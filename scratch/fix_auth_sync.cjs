const fs = require('fs');
const path = require('path');

const cwd = 'c:/Users/seuma/Desktop/PROJETOS/Vapt';

// 1. Update requireAuth.ts
const authMidPath = path.join(cwd, 'apps/api/src/middlewares/requireAuth.ts');
let authMid = fs.readFileSync(authMidPath, 'utf8');

if (!authMid.includes('isAdmin?: boolean')) {
  authMid = authMid.replace(/username\?: string \| null;/, "username?: string | null;\n        isAdmin?: boolean;");
}
if (!authMid.includes('isAdmin: user.isAdmin')) {
  authMid = authMid.replace(/username: user\.username,/g, "username: user.username,\n      isAdmin: user.isAdmin ?? false,");
}
fs.writeFileSync(authMidPath, authMid);

// 2. Update auth.controller.ts
const authCtrlPath = path.join(cwd, 'apps/api/src/controllers/auth.controller.ts');
let authCtrl = fs.readFileSync(authCtrlPath, 'utf8');

if (!authCtrl.includes('isAdmin?: boolean;')) {
  authCtrl = authCtrl.replace(/role: string;/, "role: string;\n  isAdmin?: boolean;");
}
if (!authCtrl.includes('isAdmin: user.isAdmin === true')) {
  authCtrl = authCtrl.replace(/role: user\.role,/, "role: user.role,\n    isAdmin: user.isAdmin === true,");
}
fs.writeFileSync(authCtrlPath, authCtrl);

// 3. Update AdminRoute.tsx
const adminRoutePath = path.join(cwd, 'apps/web/src/components/AdminRoute.tsx');
const adminRouteCode = `import { Navigate, Outlet } from 'react-router-dom';
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
`;
fs.writeFileSync(adminRoutePath, adminRouteCode);

// 4. Update AuthContext.tsx for debug
const authCtxPath = path.join(cwd, 'apps/web/src/context/AuthContext.tsx');
let authCtx = fs.readFileSync(authCtxPath, 'utf8');
if (!authCtx.includes('console.log(\'[AuthContext] user.isAdmin:\'')) {
  authCtx = authCtx.replace(/setUser\(data\.user\);/, "setUser(data.user);\n        console.log('[AuthContext] user.isAdmin:', data.user?.isAdmin);");
}
fs.writeFileSync(authCtxPath, authCtx);

console.log("Auth sync fixed");
