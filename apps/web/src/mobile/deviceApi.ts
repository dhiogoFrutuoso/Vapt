import { deviceStorage, getDeviceId, platform } from './deviceStorage';

/**
 * Cliente HTTP do app da equipe.
 *
 * Difere do `lib/api.ts` do painel em dois pontos que importam:
 *
 *   1. Autentica por Bearer token, nao por cookie — a WebView do Capacitor
 *      roda em `capacitor://localhost` e nao compartilha cookie com a API;
 *   2. Renova sozinho. Ao receber 401, tenta rotacionar o refresh UMA vez e
 *      repete a chamada. Sem isso o funcionario seria expulso a cada 10
 *      minutos, no meio do turno.
 */

/** Base absoluta no app nativo; relativa no navegador (proxy/rewrite). */
const BASE = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '');

export class DeviceApiError extends Error {
  status: number;
  details?: Array<{ field: string; message: string }>;

  constructor(status: number, message: string, details?: Array<{ field: string; message: string }>) {
    super(message);
    this.name = 'DeviceApiError';
    this.status = status;
    this.details = details;
  }

  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const d of this.details ?? []) out[d.field] = d.message;
    return out;
  }
}

export type Branding = {
  storeName: string;
  tagline: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  theme: 'claro' | 'escuro';
  code: string | null;
};

export type EmployeeProfile = {
  phone: string;
  cpf: string;
  birthDate: string | null;
  photoUrl: string | null;
};

export type Employee = {
  id: string;
  name: string;
  role: string;
  permissions: string[];
  onboardingCompleted: boolean;
  profile: EmployeeProfile;
};

export type LoginResult = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  employee: Employee;
  branding: Branding;
  appId: string;
};

type Envelope<T> = { ok: boolean; data?: T; error?: string; message?: string; details?: Array<{ field: string; message: string }> };

/** Evita renovacoes simultaneas quando varias chamadas tomam 401 juntas. */
let renovando: Promise<boolean> | null = null;

/** Avisa o app que a sessao caiu de vez, para voltar a tela de codigo. */
const SESSAO_MORTA = 'vapt:device-sessao-encerrada';

export function onSessionLost(handler: () => void): () => void {
  window.addEventListener(SESSAO_MORTA, handler);
  return () => window.removeEventListener(SESSAO_MORTA, handler);
}

async function parse<T>(response: Response): Promise<T> {
  let payload: Envelope<T>;
  try {
    payload = (await response.json()) as Envelope<T>;
  } catch {
    throw new DeviceApiError(response.status, 'Resposta invalida do servidor.');
  }

  if (!response.ok || payload.ok === false) {
    throw new DeviceApiError(
      response.status,
      payload.error ?? payload.message ?? 'Nao foi possivel completar a acao.',
      payload.details
    );
  }

  return payload.data as T;
}

async function rawRequest(path: string, init: RequestInit, comToken: boolean): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('X-Device-Id', await getDeviceId());

  if (comToken) {
    const token = await deviceStorage.getAccess();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(`${BASE}${path}`, { ...init, headers });
}

/** Rotaciona o refresh. Uma unica tentativa em voo por vez. */
async function renovarSessao(): Promise<boolean> {
  if (renovando) return renovando;

  renovando = (async () => {
    const refreshToken = await deviceStorage.getRefresh();
    if (!refreshToken) return false;

    try {
      const response = await rawRequest(
        '/device/refresh',
        { method: 'POST', body: JSON.stringify({ refreshToken, deviceId: await getDeviceId() }) },
        false
      );

      if (!response.ok) return false;

      const data = await parse<{ accessToken: string; refreshToken: string }>(response);
      await deviceStorage.setTokens(data.accessToken, data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      renovando = null;
    }
  })();

  return renovando;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response = await rawRequest(path, init, true);

  /*
   * 401 no primeiro tiro: o access token provavelmente expirou. Tenta renovar
   * e repete UMA vez. Se a renovacao tambem falhar, a sessao acabou de verdade
   * (bloqueio, revogacao ou refresh expirado) e o app volta ao login.
   */
  if (response.status === 401) {
    const renovou = await renovarSessao();

    if (!renovou) {
      await deviceStorage.clearTokens();
      window.dispatchEvent(new Event(SESSAO_MORTA));
      throw new DeviceApiError(401, 'Sua sessao terminou. Entre novamente.');
    }

    response = await rawRequest(path, init, true);
  }

  return parse<T>(response);
}

export const deviceApi = {
  /** Login por codigo. Nao usa token — e ele que cria a sessao. */
  async login(code: string, deviceName: string): Promise<LoginResult> {
    const response = await rawRequest(
      '/device/login',
      {
        method: 'POST',
        body: JSON.stringify({
          code,
          deviceId: await getDeviceId(),
          deviceName,
          platform: platform(),
        }),
      },
      false
    );

    const data = await parse<LoginResult>(response);
    await deviceStorage.setTokens(data.accessToken, data.refreshToken);
    return data;
  },

  me: () =>
    request<{ employeeId: string; appId: string; deviceId: string; permissions: string[] }>('/device/me'),

  sessions: () =>
    request<{
      sessions: Array<{
        deviceId: string;
        deviceName: string;
        platform: string;
        lastUsedAt: string;
        createdAt: string;
        atual: boolean;
      }>;
    }>('/device/sessions'),

  updateProfile: (input: { phone: string; cpf: string; birthDate: string }) =>
    request<{ profile: EmployeeProfile; onboardingCompleted: boolean }>('/device/profile', {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  /**
   * Encerra a sessao. Limpa o armazenamento local MESMO se a chamada falhar —
   * o funcionario clicou em sair, e ficar preso numa tela por erro de rede
   * seria pior do que o servidor manter uma sessao que expira sozinha.
   */
  async logout(): Promise<void> {
    const refreshToken = await deviceStorage.getRefresh();

    if (refreshToken) {
      try {
        await rawRequest('/device/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }, false);
      } catch {
        /* Sem rede: segue para a limpeza local. */
      }
    }

    await deviceStorage.clearTokens();
  },
};
