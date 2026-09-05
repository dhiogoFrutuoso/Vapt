import { useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { useDeviceAuth, VAPT_BRANDING } from './DeviceAuthContext';
import { DeviceApiError } from './deviceApi';
import { isNative } from './deviceStorage';

/**
 * Tela de entrada do app: só o código do funcionário.
 *
 * Antes do login o app veste a marca Vapt — o funcionário ainda não disse de
 * qual restaurante ele é, e é o próprio código que revela isso. Depois de
 * validado, o `DeviceAuthContext` troca a identidade visual globalmente.
 */

/** Nome do aparelho, para o dono reconhecer a sessão na lista. */
function nomeDoAparelho(): string {
  const ua = navigator.userAgent;
  const modelo = /\(([^)]+)\)/.exec(ua)?.[1] ?? '';
  const limpo = modelo.split(';').map((p) => p.trim()).filter(Boolean);
  const candidato = limpo[limpo.length - 1] || limpo[0] || 'Aparelho';
  return candidato.slice(0, 60);
}

export function CodeLoginScreen() {
  const { login } = useDeviceAuth();
  const [code, setCode] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const completo = code.length === 6;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!completo || enviando) return;

    setErro(null);
    setEnviando(true);

    try {
      const funcionario = await login(code, nomeDoAparelho());
      toast.success(`Bom trabalho, ${funcionario.name.split(' ')[0]}!`);
    } catch (error) {
      const mensagem =
        error instanceof DeviceApiError
          ? error.message
          : 'Não conseguimos entrar agora. Verifique sua conexão.';
      setErro(mensagem);
      // Limpa para o funcionário redigitar sem apagar caractere por caractere.
      setCode('');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main
      className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#FAF8F5]
        px-6 py-10 dark:bg-gray-950"
    >
      <div className="w-full max-w-sm">
        <header className="mb-10 text-center">
          <p
            className="m-0 text-4xl font-extrabold tracking-tight"
            style={{ color: VAPT_BRANDING.primaryColor }}
          >
            Vapt
          </p>
          <p className="m-0 mt-1 text-sm text-gray-400 dark:text-gray-500">{VAPT_BRANDING.tagline}</p>
        </header>

        <form onSubmit={handleSubmit} noValidate>
          <label
            htmlFor="employee-code"
            className="mb-2 block text-center text-[0.95rem] font-semibold text-gray-700 dark:text-gray-200"
          >
            Digite o código do funcionário
          </label>

          <input
            id="employee-code"
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus={!isNative()}
            maxLength={6}
            value={code}
            disabled={enviando}
            // Só o alfabeto do código: teclado do celular sugere minúsculas e
            // o servidor recusaria por caixa se não normalizássemos aqui.
            onChange={(event) => {
              setErro(null);
              setCode(
                event.target.value
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, '')
                  .slice(0, 6)
              );
            }}
            className="w-full rounded-2xl border border-solid border-gray-200 bg-white px-4 py-4
              text-center text-3xl font-extrabold uppercase tracking-[0.4em] text-gray-900
              outline-none transition-colors placeholder:tracking-normal placeholder:text-gray-300
              dark:border-white/10 dark:bg-gray-900 dark:text-gray-50 dark:placeholder:text-gray-600
              focus:border-[#F95D2A] disabled:opacity-60"
            placeholder="ABC123"
            aria-describedby={erro ? 'code-error' : undefined}
          />

          {erro && (
            <p id="code-error" className="mt-3 text-center text-sm font-medium text-red-600">
              {erro}
            </p>
          )}

          <button
            type="submit"
            disabled={!completo || enviando}
            className="mt-6 w-full rounded-full px-6 py-4 text-[1rem] font-bold text-white
              transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            style={{ backgroundColor: VAPT_BRANDING.primaryColor }}
          >
            {enviando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className="mt-8 text-center text-sm leading-relaxed text-gray-400 dark:text-gray-500">
          O código é fornecido pelo responsável do restaurante e vale só neste aparelho.
        </p>
      </div>
    </main>
  );
}
