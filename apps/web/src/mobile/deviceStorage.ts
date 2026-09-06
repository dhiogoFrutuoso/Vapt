/**
 * Onde os tokens do app ficam guardados.
 *
 * A regra e: NUNCA em `localStorage`. Qualquer script injetado na pagina lê o
 * localStorage inteiro, e ali estaria a sessao do funcionario — um XSS viraria
 * acesso permanente ao restaurante.
 *
 * A escolha depende de onde o app esta rodando, do mais seguro para o menos:
 *
 *   No Capacitor  → Secure Storage do sistema (Keychain no iOS, EncryptedShared-
 *                   Preferences no Android). Fica fora do alcance do JavaScript
 *                   da WebView e e cifrado pelo proprio aparelho.
 *   No Electron   → cofre do processo principal, cifrado com `safeStorage`
 *                   (DPAPI no Windows, Keychain no macOS, libsecret no Linux).
 *                   A interface nao cifra nem decifra: ela pede pela ponte, e
 *                   quem tem a chave e o lado privilegiado. Um XSS na tela nao
 *                   consegue ler o arquivo, so pedir as tres chaves permitidas.
 *   No navegador  → `sessionStorage`, que morre ao fechar a aba e nao e
 *                   compartilhado entre abas. Nao e equivalente ao Keychain, mas
 *                   e o melhor disponivel sem um backend de sessao por cookie.
 *
 * A deteccao e feita em tempo de execucao para o mesmo build servir aos dois —
 * que e a premissa do OTA: a Vercel publica, o app recarrega e ja esta novo.
 */

const ACCESS = 'vapt.device.access';
const REFRESH = 'vapt.device.refresh';
const DEVICE = 'vapt.device.id';

type SecureStoragePlugin = {
  get: (options: { key: string }) => Promise<{ value: string | null }>;
  set: (options: { key: string; value: string }) => Promise<void>;
  remove: (options: { key: string }) => Promise<void>;
};

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: { SecureStoragePlugin?: SecureStoragePlugin; Preferences?: SecureStoragePlugin };
};

function capacitor(): CapacitorGlobal | null {
  const c = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return c ?? null;
}

export function isNative(): boolean {
  return capacitor()?.isNativePlatform?.() === true;
}

export function platform(): 'android' | 'ios' | 'web' | 'desconhecido' {
  const p = capacitor()?.getPlatform?.();
  if (p === 'android' || p === 'ios' || p === 'web') return p;
  return 'desconhecido';
}

/** Plugin nativo, quando presente. Preferences e o fallback do Capacitor. */
function securePlugin(): SecureStoragePlugin | null {
  const plugins = capacitor()?.Plugins;
  return plugins?.SecureStoragePlugin ?? plugins?.Preferences ?? null;
}

/**
 * Cofre do Electron, exposto pelo `preload.cjs`.
 *
 * O `disponivel` e uma marca explicita em vez de um simples teste de
 * existencia do objeto: qualquer script pode criar `window.vaptSecure`, mas
 * quem cria pela ponte e o processo principal, antes de a pagina carregar.
 * Se o objeto existir sem a marca, ele nao veio de nos e e ignorado.
 */
type PonteSegura = {
  disponivel?: boolean;
  get: (chave: string) => Promise<string | null>;
  set: (chave: string, valor: string) => Promise<boolean>;
  remove: (chave: string) => Promise<boolean>;
};

function cofreElectron(): PonteSegura | null {
  const ponte = (window as unknown as { vaptSecure?: PonteSegura }).vaptSecure;
  return ponte?.disponivel === true ? ponte : null;
}

/** O aplicativo esta rodando numa casca nativa (Capacitor ou Electron)? */
export function temCofreDoSistema(): boolean {
  return securePlugin() !== null || cofreElectron() !== null;
}

async function read(key: string): Promise<string | null> {
  const plugin = securePlugin();
  if (plugin) {
    try {
      const { value } = await plugin.get({ key });
      return value ?? null;
    } catch {
      // Chave inexistente estoura em alguns plugins; ausencia nao e erro.
      return null;
    }
  }

  const cofre = cofreElectron();
  if (cofre) {
    try {
      return await cofre.get(key);
    } catch {
      return null;
    }
  }

  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

async function write(key: string, value: string): Promise<void> {
  const plugin = securePlugin();
  if (plugin) {
    await plugin.set({ key, value });
    return;
  }

  const cofre = cofreElectron();
  if (cofre) {
    /*
     * `safeStorage` fica indisponivel em Linux sem chaveiro configurado. O
     * `false` de volta manda a gravacao para o `sessionStorage` em vez de
     * perder a sessao em silencio — menos seguro, mas o funcionario consegue
     * trabalhar, e o alternativo seria um login que nunca completa.
     */
    try {
      if (await cofre.set(key, value)) return;
      console.warn('[storage] Cofre do sistema indisponivel; usando sessionStorage.');
    } catch {
      console.warn('[storage] Falha ao gravar no cofre; usando sessionStorage.');
    }
  }

  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    /* Modo privado com armazenamento bloqueado: a sessao vive so em memoria. */
  }
}

async function drop(key: string): Promise<void> {
  const plugin = securePlugin();
  if (plugin) {
    try {
      await plugin.remove({ key });
    } catch {
      /* Ja nao existia. */
    }
    return;
  }

  const cofre = cofreElectron();
  if (cofre) {
    try {
      await cofre.remove(key);
    } catch {
      /* Ja nao existia. */
    }
    /* Continua para limpar tambem o sessionStorage: uma sessao antiga pode
       ter ficado la de quando o cofre ainda nao existia. */
  }

  try {
    window.sessionStorage.removeItem(key);
  } catch {
    /* Nada a fazer. */
  }
}

export const deviceStorage = {
  getAccess: () => read(ACCESS),
  getRefresh: () => read(REFRESH),

  async setTokens(accessToken: string, refreshToken: string) {
    await write(ACCESS, accessToken);
    await write(REFRESH, refreshToken);
  },

  async clearTokens() {
    await drop(ACCESS);
    await drop(REFRESH);
  },
};

/**
 * Identificador do aparelho.
 *
 * O ideal e o id fisico que o Capacitor expoe (`Device.getId()`), estavel
 * entre reinstalacoes na maioria dos casos. Sem ele — no navegador — geramos
 * um id aleatorio e guardamos junto dos tokens.
 *
 * `localStorage` seria aceitavel para ESTE valor, por nao ser segredo, mas
 * mantemos tudo no mesmo lugar para que "sair da conta" limpe de uma vez.
 */
export async function getDeviceId(): Promise<string> {
  const existente = await read(DEVICE);
  if (existente) return existente;

  const gerado =
    typeof crypto?.randomUUID === 'function'
      ? crypto.randomUUID()
      : `web-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;

  await write(DEVICE, gerado);
  return gerado;
}

export async function clearDeviceId(): Promise<void> {
  await drop(DEVICE);
}
