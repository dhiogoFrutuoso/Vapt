import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Rota que exige sessão. Enquanto a checagem inicial roda, mostra um estado
 * neutro — sem isso, o usuário logado veria um flash da tela de login.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="route-loading">
        <span className="route-loading__spinner" aria-hidden="true" />
        <p>Carregando seu painel...</p>
      </div>
    );
  }

  if (!user) {
    // Guarda de onde veio, para voltar ao destino certo depois do login.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
