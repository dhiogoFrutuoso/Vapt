import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, type AuthUser, type LoginInput } from '../lib/api';

/**
 * Sessão do usuário no front.
 *
 * A fonte da verdade é o cookie httpOnly gravado pela API: o React nunca guarda
 * o token (localStorage é alvo fácil de XSS). Ao abrir o app, perguntamos
 * GET /auth/me — se responder, há sessão; se der 401, não há.
 */

type AuthContextValue = {
  user: AuthUser | null;
  /** true enquanto a primeira checagem de sessão não terminou. */
  loading: boolean;
  login: (input: LoginInput) => Promise<AuthUser>;
  register: (input: FormData) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.me();
      setUser(data.user);
        console.log('[AuthContext] user.isAdmin:', data.user?.isAdmin);
    } catch (error: any) {
      // 401 é resposta esperada para visitante sem sessão: não é erro de verdade.
      if (!(error instanceof ApiError) || error.status !== 401) {
        console.warn('[auth] Não foi possível verificar a sessão:', error);
      }
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();

    const handleUnauthorized = () => {
      // Quando qualquer request de API falhar com 401 (ex: sessão expirou),
      // forçamos o usuário a ser deslogado no frontend imediatamente.
      setUser(null);
    };

    window.addEventListener('vaptapp:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('vaptapp:unauthorized', handleUnauthorized);
    };
  }, [refresh]);

  const login = useCallback(async (input: LoginInput) => {
    const data = await api.login(input);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (input: FormData) => {
    const data = await api.register(input);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, register, logout, refresh }),
    [user, loading, login, register, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth precisa estar dentro de <AuthProvider>.');
  return context;
}
