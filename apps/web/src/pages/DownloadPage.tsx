import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Apple, ArrowLeft, Check, Copy, Monitor, Share, Smartphone } from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * /download — como o lojista e a equipe colocam o Vapt no aparelho.
 *
 * Três caminhos, e o motivo de serem diferentes não é preguiça: é como cada
 * plataforma trata instalação de software fora da loja.
 *
 *   Windows  → PWA. O app é web; instalar pelo navegador dá janela própria,
 *              ícone e atalho, sem passar por loja nenhuma.
 *   Android  → APK direto. O Android permite instalar fora da Play Store,
 *              desde que o usuário autorize "fontes desconhecidas".
 *   iOS      → só PWA. A Apple não permite sideload de .ipa sem conta de
 *              desenvolvedor e provisionamento por device. Não é limitação
 *              nossa; é política da plataforma. Por isso o card de iOS ensina
 *              "Adicionar à Tela de Início" em vez de oferecer um download
 *              que não existiria.
 */

/** Enquanto o APK não é publicado, o botão avisa em vez de dar 404. */
const APK_URL = import.meta.env.VITE_APK_URL ?? '';

const CARD =
  'flex h-full flex-col rounded-3xl bg-white p-6 shadow-[0_10px_30px_-4px_rgba(17,17,17,0.06)]';
const PILL =
  'mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#F95D2A] px-5 py-3 ' +
  'text-[0.95rem] font-bold text-white no-underline transition-colors hover:bg-[#FF7A4D] ' +
  'disabled:cursor-not-allowed disabled:opacity-55';

type Platform = 'windows' | 'android' | 'ios' | 'outro';

/** Detecta a plataforma só para destacar o card mais provável. */
function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'outro';
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  // iPadOS 13+ se identifica como Mac; o toque é o que o denuncia.
  if (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return 'ios';
  if (/windows/i.test(ua)) return 'windows';
  return 'outro';
}

export function DownloadPage() {
  const [params] = useSearchParams();
  const appId = params.get('app');
  const [platform, setPlatform] = useState<Platform>('outro');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  /** Endereço que a equipe abre no aparelho. */
  const appUrl = appId
    ? `${window.location.origin}/painel/app/${appId}`
    : `${window.location.origin}/painel`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(appUrl);
      setCopied(true);
      toast.success('Link copiado.');
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Não foi possível copiar. Selecione o endereço manualmente.');
    }
  }

  return (
    <main className="min-h-screen bg-[#FAF8F5] px-4 py-8 md:py-12">
      <div className="mx-auto w-full max-w-5xl">
        <Link
          to="/painel"
          className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-gray-500 no-underline transition-colors hover:text-gray-900"
        >
          <ArrowLeft size={16} />
          Voltar ao painel
        </Link>

        <header className="mb-8">
          <h1 className="m-0 text-3xl font-extrabold tracking-tight text-gray-900">Baixar o app</h1>
          <p className="m-0 mt-2 max-w-2xl text-[0.98rem] leading-relaxed text-gray-500">
            Instale o Vapt no aparelho da equipe. Escolha a plataforma abaixo — em qualquer uma
            delas, o acesso é feito com o código do funcionário.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {/* ------------------------------ Windows ----------------------------- */}
          <section className={`${CARD} ${platform === 'windows' ? 'ring-2 ring-[#F95D2A]' : ''}`}>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FFF0EC]">
              <Monitor size={20} className="text-[#F95D2A]" />
            </div>

            <h2 className="m-0 mt-4 text-lg font-extrabold text-gray-900">Windows</h2>
            <p className="m-0 mt-2 flex-1 text-[0.92rem] leading-relaxed text-gray-500">
              Abre a versão web otimizada. No Chrome ou no Edge, clique no ícone de instalar na
              barra de endereço para ganhar janela própria e atalho na área de trabalho.
            </p>

            <a className={PILL} href={appUrl} target="_blank" rel="noreferrer">
              Abrir versão web
            </a>
          </section>

          {/* ------------------------------ Android ----------------------------- */}
          <section className={`${CARD} ${platform === 'android' ? 'ring-2 ring-[#F95D2A]' : ''}`}>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FFF0EC]">
              <Smartphone size={20} className="text-[#F95D2A]" />
            </div>

            <h2 className="m-0 mt-4 text-lg font-extrabold text-gray-900">Android</h2>
            <p className="m-0 mt-2 flex-1 text-[0.92rem] leading-relaxed text-gray-500">
              Baixe o instalador e abra o arquivo no aparelho. Na primeira vez, o Android pede
              para autorizar a instalação de fontes desconhecidas — é o comportamento normal para
              apps fora da Play Store.
            </p>

            {APK_URL ? (
              <a className={PILL} href={APK_URL} download>
                Baixar .apk
              </a>
            ) : (
              <button type="button" className={PILL} disabled title="Instalador ainda não publicado">
                Em breve
              </button>
            )}
          </section>

          {/* -------------------------------- iOS ------------------------------- */}
          <section className={`${CARD} ${platform === 'ios' ? 'ring-2 ring-[#F95D2A]' : ''}`}>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FFF0EC]">
              <Apple size={20} className="text-[#F95D2A]" />
            </div>

            <h2 className="m-0 mt-4 text-lg font-extrabold text-gray-900">iPhone e iPad</h2>
            <p className="m-0 mt-2 text-[0.92rem] leading-relaxed text-gray-500">
              A Apple não permite instalar apps fora da App Store. No iOS o Vapt roda como app
              instalado pela própria tela — o resultado é o mesmo: ícone, tela cheia e sem barra do
              navegador.
            </p>

            <ol className="mt-4 flex-1 list-none space-y-2.5 p-0 text-[0.9rem] text-gray-600">
              <li className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600">
                  1
                </span>
                Abra este endereço no <strong>Safari</strong> (não funciona no Chrome do iOS).
              </li>
              <li className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600">
                  2
                </span>
                <span className="inline-flex flex-wrap items-center gap-1">
                  Toque em Compartilhar <Share size={14} className="inline" />
                </span>
              </li>
              <li className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600">
                  3
                </span>
                Escolha <strong>Adicionar à Tela de Início</strong>.
              </li>
            </ol>

            <button type="button" className={PILL} onClick={() => void copyLink()}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? 'Link copiado' : 'Copiar endereço'}
            </button>
          </section>
        </div>

        <p className="mt-8 rounded-2xl bg-white p-5 text-[0.9rem] leading-relaxed text-gray-500 shadow-[0_10px_30px_-4px_rgba(17,17,17,0.06)]">
          <strong className="text-gray-900">Atualizações:</strong> o app carrega a interface direto
          do servidor. Toda melhoria publicada aparece no aparelho da equipe assim que o app é
          aberto de novo — ninguém precisa reinstalar nada.
        </p>
      </div>
    </main>
  );
}
