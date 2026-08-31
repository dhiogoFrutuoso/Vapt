import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Rota para visitantes. Se o usuário já estiver logado, redireciona 
 * imediatamente para o painel.
 */
export function GuestRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="route-loading">
        <span className="route-loading__spinner" aria-hidden="true" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/painel" replace />;
  }

  return <>{children}</>;
}
