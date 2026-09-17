import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Copy, Download, Smartphone } from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * `/apk` — página de instalação do app Android, para ser divulgada sozinha.
 *
 * Existe separada de `/download` por dois motivos:
 *
 *   1. É pública e enxuta. O dono manda este link no grupo da equipe e cada
 *      funcionário instala sem passar pelo painel nem ter conta;
 *   2. É o endereço estável do instalador. Quando o `.apk` for publicado,
 *      basta apontar `VITE_APK_URL` para o arquivo — a página, o QR e o link
 *      que já circularam continuam valendo.
 *
 * A página NÃO hospeda o binário. Um SPA serve JavaScript, não arquivos; o
 * `.apk` vai para o storage (Cloudinary, S3, release do GitHub) e a variável
 * aponta para lá.
 */

const APK_URL = import.meta.env.VITE_APK_URL || '/downloads/vapt.apk';
const APK_VERSAO = import.meta.env.VITE_APK_VERSION ?? '';

const PILL =
  'inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-4 text-[1rem] ' +
  'font-bold text-white no-underline transition-colors disabled:cursor-not-allowed disabled:opacity-50';

export function ApkPage() {
  const [copiado, setCopiado] = useState(false);
  const [ehAndroid, setEhAndroid] = useState(false);

  useEffect(() => {
    setEhAndroid(/android/i.test(navigator.userAgent));
  }, []);

  const enderecoDoApp = `${window.location.origin}/mobile-view`;

  async function copiar(texto: string, aviso: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      toast.success(aviso);
      window.setTimeout(() => setCopiado(false), 2500);
    } catch {
      toast.error('Não foi possível copiar. Selecione o endereço manualmente.');
    }
  }

  return (
    <main className="min-h-[100dvh] bg-[#FAF8F5] px-5 py-10">
      <div className="mx-auto w-full max-w-md">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-gray-500 no-underline hover:text-gray-900"
        >
          <ArrowLeft size={16} />
          Vapt
        </Link>

        <div className="rounded-3xl bg-white p-7 shadow-[0_10px_30px_-4px_rgba(17,17,17,0.06)]">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFF0EC]">
            <Smartphone size={22} className="text-[#F95D2A]" />
          </div>

          <h1 className="m-0 mt-5 text-2xl font-extrabold tracking-tight text-gray-900">
            App da equipe
          </h1>
          <p className="m-0 mt-2 text-[0.95rem] leading-relaxed text-gray-500">
            Instale no celular de quem trabalha no salão, na cozinha ou na entrega. O acesso é feito
            com o código do funcionário.
          </p>

          {APK_VERSAO && (
            <span className="mt-4 inline-block rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600">
              Versão {APK_VERSAO}
            </span>
          )}

          {APK_URL ? (
            <>
              <a className={`${PILL} mt-6 bg-[#F95D2A] hover:bg-[#FF7A4D]`} href={APK_URL} download>
                <Download size={18} />
                Baixar instalador (.apk)
              </a>

              <ol className="mt-6 list-none space-y-3 p-0 text-[0.92rem] leading-relaxed text-gray-600">
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600">
                    1
                  </span>
                  Toque em baixar e abra o arquivo quando terminar.
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600">
                    2
                  </span>
                  O Android vai pedir para autorizar a instalação de{' '}
                  <strong>fontes desconhecidas</strong>. É o comportamento normal para apps fora da
                  Play Store.
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600">
                    3
                  </span>
                  Abra o Vapt e digite o código do funcionário.
                </li>
              </ol>
            </>
          ) : (
            <>
              <button type="button" className={`${PILL} mt-6 bg-gray-300`} disabled>
                <Download size={18} />
                Instalador em preparação
              </button>

              <p className="m-0 mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-800">
                O instalador ainda não foi publicado. Enquanto isso, o app funciona pelo navegador —
                é a mesma interface, e o link abaixo pode ser adicionado à tela de início.
              </p>
            </>
          )}

          <div className="mt-7 border-0 border-t border-solid border-gray-100 pt-6">
            <p className="m-0 text-sm font-semibold text-gray-700">Usar pelo navegador</p>
            <p className="m-0 mt-1 text-sm leading-relaxed text-gray-500">
              Funciona em qualquer celular, inclusive iPhone. No Safari, use Compartilhar →
              Adicionar à Tela de Início.
            </p>

            <button
              type="button"
              onClick={() => void copiar(enderecoDoApp, 'Endereço copiado.')}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full
                border border-solid border-gray-200 bg-white px-5 py-3 text-[0.92rem] font-bold text-gray-700
                transition-colors hover:bg-gray-50"
            >
              {copiado ? <Check size={16} /> : <Copy size={16} />}
              {copiado ? 'Copiado' : 'Copiar endereço do app'}
            </button>

            <a
              href="/mobile-view"
              className="mt-2 inline-flex w-full items-center justify-center rounded-full px-5 py-3
                text-[0.92rem] font-bold text-[#F95D2A] no-underline hover:underline"
            >
              Abrir agora
            </a>
          </div>
        </div>

        {ehAndroid && !APK_URL && (
          <p className="mt-5 text-center text-sm text-gray-400">
            Detectamos um Android. Assim que o instalador sair, ele aparece aqui.
          </p>
        )}
      </div>
    </main>
  );
}
