import { DeviceAuthProvider, useDeviceAuth } from '../mobile/DeviceAuthContext';
import { CodeLoginScreen } from '../mobile/CodeLoginScreen';
import { OnboardingScreen } from '../mobile/OnboardingScreen';
import { MobileShell } from '../mobile/MobileShell';

/**
 * `/mobile-view` — a rota que a casca do Capacitor aponta.
 *
 * É deliberadamente isolada do resto do site: sem navbar comercial, sem
 * rodapé, sem `ProtectedRoute` do painel. A sessão aqui é a do FUNCIONÁRIO
 * (Bearer token no Secure Storage), não a do dono (cookie httpOnly) — são
 * dois mundos que não se cruzam.
 *
 * SOBRE O `:id` DA ESPECIFICAÇÃO
 * ------------------------------
 * O pedido original era `/mobile-view/:id`. O id não cabe no fluxo: o
 * funcionário digita só o código, e é o código que revela de qual restaurante
 * ele é — o app não sabe o id antes do login. Passá-lo na URL seria
 * informação que ninguém tem para digitar, e que o Capacitor teria de embutir
 * no build, quebrando a premissa de uma casca única para todos os clientes.
 * A rota aceita o parâmetro opcional para compatibilidade, mas ignora: quem
 * manda é o `appId` que vem dentro da sessão.
 *
 * ATUALIZAÇÃO OTA
 * ---------------
 * A casca do Capacitor carrega esta URL do servidor. Todo deploy na Vercel
 * troca a interface do app na próxima abertura — sem loja, sem reinstalação,
 * sem plugin de live update. O `capacitor-updater` só seria necessário se o
 * bundle fosse empacotado dentro do APK, que não é o caso aqui.
 */

function MobileRouter() {
  const { employee, loading, branding } = useDeviceAuth();

  if (loading) {
    return (
      <main
        className="flex min-h-[100dvh] items-center justify-center"
        style={{ backgroundColor: '#FAF8F5' }}
      >
        <p className="m-0 text-sm font-semibold text-gray-400">Carregando...</p>
      </main>
    );
  }

  // Sem sessão: a marca é a do Vapt, e a única tela é a do código.
  if (!employee) return <CodeLoginScreen />;

  // Primeiro acesso: bloqueante até contato, CPF e nascimento existirem.
  if (!employee.onboardingCompleted) return <OnboardingScreen modo="onboarding" />;

  return <MobileShell key={branding.storeName} />;
}

export function MobileViewPage() {
  return (
    <DeviceAuthProvider>
      <MobileRouter />
    </DeviceAuthProvider>
  );
}
