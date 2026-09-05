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
  /** true enquanto a checagem inicial de sessao nao terminou. */
  loading: boolean;
  login: (code: string, deviceName: string) => Promise<Employee>;
  logout: () => Promise<void>;
  completeOnboarding: (input: { phone: string; cpf: string; birthDate: string }) => Promise<void>;
};

const DeviceAuthContext = createContext<DeviceAuthValue | null>(null);

export function DeviceAuthProvider({ children }: { children: ReactNode }) {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [branding, setBranding] = useState<Branding>(VAPT_BRANDING);
  const [loading, setLoading] = useState(true);

  const encerrarLocal = useCallback(() => {
    setEmployee(null);
    setBranding(VAPT_BRANDING);
  }, []);

  /*
   * Ao abrir o app, tenta reaproveitar a sessao guardada. `/device/me`
   * devolve permissoes mas nao o branding — entao, quando ha sessao, o app
   * ainda precisa de um login para reidratar a identidade visual.
   *
   * Em vez de inventar uma rota so para isso, tratamos assim: se ha token
   * valido, entramos direto com o que /device/me devolve; o branding completo
   * chega no proximo login. Na pratica o refresh dura 30 dias e o login e
   * raro, entao guardamos o branding junto da sessao.
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
        const salvo = lerBrandingSalvo();

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
      } catch {
        if (vivo) encerrarLocal();
      } finally {
        if (vivo) setLoading(false);
      }
    })();

    return () => {
      vivo = false;
    };
  }, [encerrarLocal]);

  /* A sessao pode morrer no meio do turno (bloqueio, revogacao). O cliente
     HTTP avisa por evento e a interface volta para a tela de codigo. */
  useEffect(() => onSessionLost(encerrarLocal), [encerrarLocal]);

  const login = useCallback(async (code: string, deviceName: string) => {
    const data = await deviceApi.login(code, deviceName);
    setEmployee(data.employee);
    setBranding(data.branding);
    salvarBranding({
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
    limparBrandingSalvo();
    encerrarLocal();
  }, [encerrarLocal]);

  const completeOnboarding = useCallback(
    async (input: { phone: string; cpf: string; birthDate: string }) => {
      const data = await deviceApi.updateProfile(input);
      setEmployee((atual) =>
        atual ? { ...atual, onboardingCompleted: true, profile: data.profile } : atual
      );
    },
    []
  );

  const value = useMemo<DeviceAuthValue>(
    () => ({ employee, branding, loading, login, logout, completeOnboarding }),
    [employee, branding, loading, login, logout, completeOnboarding]
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
 * O branding NAO e segredo — sao nome, cores e logo publicos do restaurante.
 * Por isso pode ficar em sessionStorage sem o cuidado dos tokens: o pior caso
 * de um vazamento aqui e alguem descobrir a cor da marca de um bar.
 *
 * Existe para o app abrir ja vestido do restaurante, sem piscar a marca Vapt
 * antes de a sessao ser confirmada.
 */
const CHAVE = 'vapt.device.branding';

type BrandingSalvo = {
  branding: Branding;
  employeeName: string;
  roleName: string;
  onboardingCompleted: boolean;
  profile: Employee['profile'];
};

function salvarBranding(dados: BrandingSalvo) {
  try {
    window.sessionStorage.setItem(CHAVE, JSON.stringify(dados));
  } catch {
    /* Armazenamento bloqueado: o app so vai piscar a marca Vapt ao abrir. */
  }
}

function lerBrandingSalvo(): BrandingSalvo | null {
  try {
    const bruto = window.sessionStorage.getItem(CHAVE);
    return bruto ? (JSON.parse(bruto) as BrandingSalvo) : null;
  } catch {
    return null;
  }
}

function limparBrandingSalvo() {
  try {
    window.sessionStorage.removeItem(CHAVE);
  } catch {
    /* Nada a fazer. */
  }
}
