import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Download, LogOut, RefreshCw, ShieldAlert } from 'lucide-react';
import { useForceUpdate } from './ForceUpdateContext';
import { clearSessionAndExit, installNativeUpdate, setNativeUpdateGateActive } from './nativeUpdater';

type Phase = 'idle' | 'downloading' | 'installing' | 'failed';

export function ForceUpdateGate() {
  const { update, isUpdateRequired, checkState, retry } = useForceUpdate();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const visible = checkState !== 'ready' || isUpdateRequired;

  useEffect(() => {
    if (!visible) return;
    const previousBody = document.body.style.overflow;
    const previousHtml = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    const root = document.getElementById('root');
    root?.setAttribute('inert', '');
    root?.setAttribute('aria-hidden', 'true');
    setNativeUpdateGateActive(true);
    buttonRef.current?.focus();

    const blockEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') event.preventDefault();
    };
    window.addEventListener('keydown', blockEscape, true);

    let disposed = false;
    let removeBackListener: (() => Promise<void>) | undefined;
    if (Capacitor.isNativePlatform()) {
      void CapacitorApp.addListener('backButton', () => void clearSessionAndExit()).then((handle) => {
        if (disposed) void handle.remove();
        else removeBackListener = () => handle.remove();
      });
    }

    return () => {
      disposed = true;
      document.body.style.overflow = previousBody;
      document.documentElement.style.overflow = previousHtml;
      root?.removeAttribute('inert');
      root?.removeAttribute('aria-hidden');
      setNativeUpdateGateActive(false);
      window.removeEventListener('keydown', blockEscape, true);
      void removeBackListener?.();
    };
  }, [visible]);

  if (!visible) return null;

  if (!update) {
    return createPortal(
      <div className="fixed inset-0 z-[9999] flex min-h-[100dvh] items-center justify-center bg-gray-950 px-5 text-white" role="alert" aria-live="assertive">
        <section className="w-full max-w-md text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F95D2A]/20 text-[#FF8A63]">
            <RefreshCw className={checkState === 'checking' ? 'animate-spin motion-reduce:animate-none' : ''} size={30} aria-hidden="true" />
          </div>
          <h1 className="mt-6 text-2xl font-extrabold">{checkState === 'checking' ? 'Verificando atualização' : 'Verificação indisponível'}</h1>
          <p className="mx-auto mt-3 max-w-sm text-base leading-7 text-gray-300">
            {checkState === 'checking'
              ? 'Validando a versão instalada antes de liberar o aplicativo.'
              : 'Conecte o aparelho à internet e tente novamente. O acesso permanece bloqueado por segurança.'}
          </p>
          {checkState === 'error' && (
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <button ref={buttonRef} type="button" onClick={() => void retry()} className="min-h-12 rounded-full bg-[#F95D2A] px-5 font-bold text-white focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-orange-400">
                Tentar novamente
              </button>
              <button type="button" onClick={() => void clearSessionAndExit()} className="min-h-12 rounded-full border border-white/25 px-5 font-bold text-white focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-white">
                Sair do aplicativo
              </button>
            </div>
          )}
        </section>
      </div>,
      document.body
    );
  }

  const changelog = Array.isArray(update.changelog)
    ? update.changelog
    : update.changelog.split(/\r?\n/).filter(Boolean);

  async function startUpdate() {
    if (!update || phase !== 'idle') return;
    setPhase('downloading');
    setProgress(0);
    try {
      await installNativeUpdate(update.downloadUrls, update.latestVersion, (event) => {
        const next = Math.min(100, Math.max(0, Math.round(event.percent || 0)));
        setProgress(next);
        if (next >= 100) setPhase('installing');
      });
    } catch (error) {
      console.error('[update] Falha na atualização nativa.', error);
      setPhase('failed');
      window.setTimeout(() => void clearSessionAndExit(), 900);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex min-h-[100dvh] items-center justify-center overflow-y-auto bg-gray-950/95 px-4 py-[max(1.5rem,env(safe-area-inset-top))] backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="force-update-title" aria-describedby="force-update-description">
      <section className="my-auto w-full max-w-lg rounded-3xl border border-white/10 bg-white p-6 shadow-2xl sm:p-8 dark:bg-gray-900">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F95D2A]/10 text-[#D94717] dark:text-[#FF8A63]">
          <ShieldAlert size={30} aria-hidden="true" />
        </div>
        <h1 id="force-update-title" className="m-0 text-2xl font-extrabold tracking-tight text-gray-950 dark:text-white sm:text-3xl">Atualização Obrigatória</h1>
        <p id="force-update-description" className="mt-3 text-base leading-7 text-gray-700 dark:text-gray-200">
          {update.reason || 'Uma nova versão do Vapt está disponível com correções críticas e novos recursos.'}
        </p>
        <p className="mt-5 inline-flex rounded-full bg-[#F95D2A] px-4 py-2 text-sm font-extrabold text-white">Versão {update.latestVersion} já disponível</p>
        <div className="mt-6 rounded-2xl border border-orange-200 bg-orange-50 p-4 dark:border-orange-400/20 dark:bg-orange-400/10">
          <h2 className="m-0 text-sm font-extrabold uppercase tracking-wide text-gray-950 dark:text-white">O que mudou</h2>
          {changelog.length > 0 ? (
            <ul className="mb-0 mt-3 space-y-2 pl-5 text-sm leading-6 text-gray-700 dark:text-gray-200">
              {changelog.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
            </ul>
          ) : (
            <p className="mb-0 mt-3 text-sm leading-6 text-gray-700 dark:text-gray-200">Melhorias de segurança, estabilidade e desempenho.</p>
          )}
        </div>

        {phase !== 'idle' && (
          <div className="mt-6" aria-live="polite">
            <div className="mb-2 flex items-center justify-between text-sm font-bold text-gray-700 dark:text-gray-200">
              <span>{phase === 'failed' ? 'Falha no download. Encerrando…' : phase === 'installing' ? 'Abrindo instalador…' : 'Baixando atualização…'}</span>
              <span className="tabular-nums">{progress}%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700" role="progressbar" aria-label="Progresso da atualização" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
              <div className="h-full rounded-full bg-[#F95D2A] transition-transform motion-reduce:transition-none" style={{ transform: `translateX(${progress - 100}%)` }} />
            </div>
          </div>
        )}

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button ref={buttonRef} type="button" disabled={phase !== 'idle'} onClick={() => void startUpdate()} className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-full bg-[#F95D2A] px-5 py-3.5 text-base font-extrabold text-white shadow-lg shadow-orange-500/20 transition-colors hover:bg-[#E64D1B] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-orange-500 disabled:cursor-wait disabled:opacity-60">
            <Download size={20} aria-hidden="true" />
            {phase === 'idle' ? 'Atualizar Agora' : 'Atualizando…'}
          </button>
          <button type="button" onClick={() => void clearSessionAndExit()} className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-full border border-gray-300 bg-white px-5 py-3.5 text-base font-extrabold text-gray-800 transition-colors hover:bg-gray-100 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700">
            <LogOut size={20} aria-hidden="true" />
            Sair do Aplicativo
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
