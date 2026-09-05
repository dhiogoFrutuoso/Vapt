import { Route, Routes } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { EditorPage } from './pages/EditorPage';
import { AccountPage } from './pages/AccountPage';
import { DownloadPage } from './pages/DownloadPage';
import { MobileViewPage } from './pages/MobileViewPage';
import { ClientMenuPage } from './pages/ClientMenuPage';
import { ApkPage } from './pages/ApkPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { TermsPage, PrivacyPage } from './pages/LegalPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { AdminPage } from './pages/AdminPage';
import { PlanSelectionPage } from './pages/PlanSelectionPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminRoute } from './components/AdminRoute';
import { GuestRoute } from './components/GuestRoute';

import { Toaster } from 'react-hot-toast';

/**
 * Mapa de rotas.
 *
 *   /          -> página comercial (landing)
 *   /login     -> entrar (tela isolada, sem navbar comercial)
 *   /register  -> criar conta (tela isolada)
 *   /painel    -> área do usuário, exige sessão
 *   /painel/app/:id -> editor do aplicativo
 *   /painel/app/:id/planos -> escolha de plano
 */
export default function App() {
  return (
    <>
      <Toaster position="bottom-right" />
      <Routes>
        <Route
          path="/"
          element={<LandingPage />}
        />
      <Route
        path="/login"
        element={
          <GuestRoute>
            <LoginPage />
          </GuestRoute>
        }
      />
      <Route
        path="/register"
        element={
          <GuestRoute>
            <RegisterPage />
          </GuestRoute>
        }
      />
      <Route
        path="/recuperar-senha"
        element={
          <GuestRoute>
            <ForgotPasswordPage />
          </GuestRoute>
        }
      />
      {/* Publicas: precisam abrir para quem esta logado e para quem nao esta,
          inclusive em nova aba a partir do checkbox de aceite. */}
      <Route path="/termos" element={<TermsPage />} />
      <Route path="/privacidade" element={<PrivacyPage />} />
      <Route
        path="/painel"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminPage />
          </AdminRoute>
        }
      />

      {/* Cardapio publico do cliente final. Sem login: e o link que o dono
          divulga. Aceita id ou slug. */}
      <Route path="/cliente/:id" element={<ClientMenuPage />} />

      {/* Pagina de instalacao do app Android, para circular sozinha. */}
      <Route path="/apk" element={<ApkPage />} />

      {/* Casca do app da equipe (Capacitor). Fora do ProtectedRoute: a sessao
          aqui e a do funcionario, por Bearer token, nao a do dono por cookie.
          O :id opcional existe so por compatibilidade com a especificacao. */}
      <Route path="/mobile-view" element={<MobileViewPage />} />
      <Route path="/mobile-view/:id" element={<MobileViewPage />} />
      <Route
        path="/download"
        element={
          <ProtectedRoute>
            <DownloadPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/painel/conta"
        element={
          <ProtectedRoute>
            <AccountPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/painel/app/:id"
        element={
          <ProtectedRoute>
            <EditorPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/painel/app/:id/planos"
        element={
          <ProtectedRoute>
            <PlanSelectionPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    </>
  );
}
