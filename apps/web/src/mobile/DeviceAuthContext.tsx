import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { deviceApi, onSessionLost, type Branding, type Employee } from './deviceApi';
import { deviceStorage } from './deviceStorage';

/**
 * Sessao do funcionario dentro do app.
 *
 * Guarda tres coisas que mudam a interface inteira:
 *   employee  — quem e, e o que a funcao dele libera (RBAC das abas);
 *   branding  — identidade do restaurante, aplicada globalmente apos o login;
 *   onboarding — se ainda falta preencher contato, CPF e nascimento.
 */

/** Marca do Vapt, exibida ANTES do login. Depois, o restaurante assume. */
export const VAPT_BRANDING: Branding = {
  storeName: 'Vapt',
  tagline: 'aplicativos rápidos',
  logoUrl: null,
  primaryColor: '#F95D2A',
  secondaryColor: '#111827',
  theme: 'claro',
  code: null,
};

type DeviceAuthValue = {
  employee: Employee | null;
  branding: Branding;
  /**
   * Restaurante da sessao.
   *
   * Necessario para o socket: o handshake manda o appId junto do token, e o
   * servidor CONFERE um contra o outro antes de colocar a conexao na sala.
   * Mandar so o token bastaria para o app da equipe (o appId vai assinado
   * dentro dele), mas a mesma funcao de autenticacao serve o painel do dono,
   * onde o appId precisa vir de fora.
   */
  appId: string | null;
  /**
   * Access token atual, exposto SO para o handshake do socket.
   *
   * O `socket.io-client` nao passa por `deviceApi`, entao nao herda o
   * cabecalho `Authorization`. Fora isso, nenhuma tela deve ler este valor:
   * quem faz chamada HTTP usa `deviceApi`, que ja injeta o token e renova
   * sozinho em 401.
   */
  accessToken: string | null;
  /** true enquanto a checagem inicial de sessao nao terminou. */
  loading: boolean;
  sessionUnavailable: boolean;
  retrySession: () => void;
  login: (code: string, deviceName: string) => Promise<Employee>;
  logout: () => Promise<void>;
  completeOnboarding: (input: { phone: string; cpf: string; birthDate: string }) => Promise<void>;
};

const DeviceAuthContext = createContext<DeviceAuthValue | null>(null);

export function DeviceAuthProvider({ children }: { children: ReactNode }) {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [branding, setBranding] = useState<Branding>(VAPT_BRANDING);
  const [appId, setAppId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionUnavailable, setSessionUnavailable] = useState(false);
  const [restoreAttempt, setRestoreAttempt] = useState(0);

  const retrySession = useCallback(() => {
    setLoading(true);
    setSessionUnavailable(false);
    setRestoreAttempt((attempt) => attempt + 1);
  }, []);

  const encerrarLocal = useCallback((_clearPersonalization = true) => {
    setEmployee(null);
    setBranding(VAPT_BRANDING);
    setAppId(null);
    setAccessToken(null);
  }, []);

  /*
   * Ao abrir, confirma a sessao no servidor. O cache cifrado guarda o perfil
   * e a marca, que `/device/me` nao devolve; o refresh tem limite de 7 dias.
   */
  useEffect(() => {
    let vivo = true;

    (async () => {
      const token = await deviceStorage.getAccess();
      const refresh = await deviceStorage.getRefresh();

      if (!token && !refresh) {
        if (vivo) setLoading(false);
        return;
      }

      try {
        const dados = await deviceApi.me();
        const salvo = await lerBrandingSalvo();
        // /device/me pode ter rotacionado um access expirado durante o boot.
        const currentToken = await deviceStorage.getAccess();

        if (!vivo) return;

        setEmployee({
          id: dados.employeeId,
          name: salvo?.employeeName ?? 'Funcionário',
          role: salvo?.roleName ?? '',
          permissions: dados.permissions,
          onboardingCompleted: salvo?.onboardingCompleted ?? true,
          profile: salvo?.profile ?? { phone: '', cpf: '', birthDate: null, photoUrl: null },
        });
        setBranding(salvo?.branding ?? VAPT_BRANDING);
        setAppId(dados.appId);
        setAccessToken(currentToken);
      } catch {
        if (vivo) {
          const stillStored = (await deviceStorage.getAccess()) || (await deviceStorage.getRefresh());
          encerrarLocal(!stillStored);
          if (vivo) setSessionUnavailable(Boolean(stillStored));
        }
      } finally {
        if (vivo) setLoading(false);
      }
    })();

    return () => {
      vivo = false;
    };
  }, [encerrarLocal, restoreAttempt]);

  /* A sessao pode morrer no meio do turno (bloqueio, revogacao). O cliente
     HTTP avisa por evento e a interface volta para a tela de codigo. */
  useEffect(() => onSessionLost(() => {
    encerrarLocal();
    setSessionUnavailable(false);
  }), [encerrarLocal]);

  const login = useCallback(async (code: string, deviceName: string) => {
    const data = await deviceApi.login(code, deviceName);
    setSessionUnavailable(false);
    setAppId(data.appId);
    setAccessToken(data.accessToken);
    setEmployee(data.employee);
    setBranding(data.branding);
    await salvarBranding({
      branding: data.branding,
      employeeName: data.employee.name,
      roleName: data.employee.role,
      onboardingCompleted: data.employee.onboardingCompleted,
      profile: data.employee.profile,
    });
    return data.employee;
  }, []);

  const logout = useCallback(async () => {
    await deviceApi.logout();
    setSessionUnavailable(false);
    encerrarLocal();
  }, [encerrarLocal]);

  const completeOnboarding = useCallback(
    async (input: { phone: string; cpf: string; birthDate: string }) => {
      const data = await deviceApi.updateProfile(input);
      setEmployee((atual) =>
        atual ? { ...atual, onboardingCompleted: true, profile: data.profile } : atual
      );
      const salvo = await lerBrandingSalvo();
      if (salvo) await salvarBranding({ ...salvo, onboardingCompleted: true, profile: data.profile });
    },
    []
  );

  const value = useMemo<DeviceAuthValue>(
    () => ({ employee, branding, appId, accessToken, loading, sessionUnavailable, retrySession, login, logout, completeOnboarding }),
    [employee, branding, appId, accessToken, loading, sessionUnavailable, retrySession, login, logout, completeOnboarding]
  );

  return <DeviceAuthContext.Provider value={value}>{children}</DeviceAuthContext.Provider>;
}

export function useDeviceAuth(): DeviceAuthValue {
  const ctx = useContext(DeviceAuthContext);
  if (!ctx) throw new Error('useDeviceAuth precisa estar dentro de <DeviceAuthProvider>.');
  return ctx;
}

/* ------------------------------------------------------------------ */
/* Cache do branding                                                   */
/* ------------------------------------------------------------------ */

/*
 * O perfil inclui CPF e contato: no app nativo acompanha os tokens no cofre
 * cifrado. No navegador, acompanha a sessao temporaria da aba.
 */
type BrandingSalvo = {
  branding: Branding;
  employeeName: string;
  roleName: string;
  onboardingCompleted: boolean;
  profile: Employee['profile'];
};

async function salvarBranding(dados: BrandingSalvo) {
  try {
    await deviceStorage.setBranding(JSON.stringify(dados));
  } catch {
    /* Cache opcional: o login continua, mas a marca sera recuperada depois. */
  }
}

async function lerBrandingSalvo(): Promise<BrandingSalvo | null> {
  try {
    const bruto = await deviceStorage.getBranding();
    return bruto ? (JSON.parse(bruto) as BrandingSalvo) : null;
  } catch {
    return null;
  }
}
