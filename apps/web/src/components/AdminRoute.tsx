import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import React from 'react';

export function AdminRoute({ children }: { children?: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <div>Carregando...</div>;
  
  if (user && user.isAdmin === true) {
    return children ? <>{children}</> : <Outlet />;
  }
  
  return <Navigate to="/painel" replace />;
}
