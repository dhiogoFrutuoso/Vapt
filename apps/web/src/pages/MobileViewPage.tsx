import { DeviceAuthProvider, useDeviceAuth } from '../mobile/DeviceAuthContext';
import { CodeLoginScreen } from '../mobile/CodeLoginScreen';
import { OnboardingScreen } from '../mobile/OnboardingScreen';
import { MobileShell } from '../mobile/MobileShell';
import { PreferencesProvider } from '../mobile/PreferencesContext';
import { ForceUpdateProvider, useForceUpdate } from '../mobile/ForceUpdateContext';
import { ForceUpdateGate } from '../mobile/ForceUpdateGate';

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
 * ATUALIZAÇÃO NATIVA
 * ------------------
 * O bundle de produção acompanha o APK/EXE. Antes de liberar esta rota, o
 * ForceUpdateProvider consulta a versão pública e mantém o hard gate até a
 * instalação do binário compatível com o restaurante ativo.
 */

function MobileRouter() {
  const { employee, loading, branding } = useDeviceAuth();
  const { checkState, isUpdateRequired } = useForceUpdate();

  /* O conteúdo operacional só nasce depois da decisão de versão. */
  if (checkState !== 'ready' || isUpdateRequired) return null;

  if (loading) {
    return (
      <main
        className="flex min-h-[100dvh] items-center justify-center bg-[#FAF8F5] dark:bg-gray-950"
      >
        <p className="m-0 text-sm font-semibold text-gray-600 dark:text-gray-300">Carregando...</p>
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
    /*
     * As preferencias envolvem a autenticacao, e nao o contrario: tema e
     * escala precisam valer JA na tela de login, antes de existir sessao.
     * Por dentro, um funcionario nao ve a preferencia do outro — a chave e
     * do aparelho, e trocar de conta nao troca o tamanho da fonte.
     */
    <PreferencesProvider>
      <DeviceAuthProvider>
        <ForceUpdateProvider>
          <MobileRouter />
          <ForceUpdateGate />
        </ForceUpdateProvider>
      </DeviceAuthProvider>
    </PreferencesProvider>
  );
}
