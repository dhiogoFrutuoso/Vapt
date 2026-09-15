import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Download, ShieldAlert } from 'lucide-react';
import { useForceUpdate } from './ForceUpdateContext';

type ElectronUpdateBridge = { openUpdate?: (url: string) => Promise<boolean> };

function electronBridge(): ElectronUpdateBridge | null {
  return (window as unknown as { vaptSecure?: ElectronUpdateBridge }).vaptSecure ?? null;
}

function downloadUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const configured = import.meta.env.VITE_DOWNLOAD_BASE_URL?.trim();
  const base = configured || (/^https?:$/.test(window.location.protocol) ? window.location.origin : 'https://vapt-web.vercel.app');
  return new URL(path, `${base.replace(/\/$/, '')}/`).toString();
}

async function clearWebCaches(): Promise<void> {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
}

export function ForceUpdateGate() {
  const { update, isUpdateRequired } = useForceUpdate();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (!isUpdateRequired) return;
    const previousBody = document.body.style.overflow;
    const previousHtml = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    const root = document.getElementById('root');
    root?.setAttribute('inert', '');
    root?.setAttribute('aria-hidden', 'true');
    buttonRef.current?.focus();

    const blockEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') event.preventDefault();
    };
    window.addEventListener('keydown', blockEscape, true);

    let disposed = false;
    let removeBackListener: (() => Promise<void>) | undefined;
    if (Capacitor.isNativePlatform()) {
      void CapacitorApp.addListener('backButton', () => undefined).then((handle) => {
        if (disposed) {
          void handle.remove();
          return;
        }
        removeBackListener = () => handle.remove();
      });
    }

    return () => {
      disposed = true;
      document.body.style.overflow = previousBody;
      document.documentElement.style.overflow = previousHtml;
      root?.removeAttribute('inert');
      root?.removeAttribute('aria-hidden');
      window.removeEventListener('keydown', blockEscape, true);
      void removeBackListener?.();
    };
  }, [isUpdateRequired]);

  if (!update) return null;
  const changelog = Array.isArray(update.changelog)
    ? update.changelog
    : update.changelog.split(/\r?\n/).filter(Boolean);

  async function startUpdate() {
    setOpening(true);
    try {
      const bridge = electronBridge();
      if (bridge?.openUpdate) {
        await bridge.openUpdate(downloadUrl(update!.downloadUrls.exe));
        return;
      }
      if (Capacitor.getPlatform() === 'android') {
        window.open(downloadUrl(update!.downloadUrls.apk), '_blank', 'noopener,noreferrer');
        return;
      }
      await clearWebCaches();
      (window.location.reload as (forceReload?: boolean) => void)(true);
    } finally {
      window.setTimeout(() => setOpening(false), 1500);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex min-h-[100dvh] items-center justify-center overflow-y-auto bg-gray-950/90 px-4 py-[max(1.5rem,env(safe-area-inset-top))] backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="force-update-title"
      aria-describedby="force-update-description"
    >
      <section className="my-auto w-full max-w-lg rounded-3xl border border-white/10 bg-white p-6 shadow-2xl sm:p-8 dark:bg-gray-900">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F95D2A]/10 text-[#D94717] dark:text-[#FF8A63]">
          <ShieldAlert size={30} aria-hidden="true" />
        </div>
        <h1 id="force-update-title" className="m-0 text-2xl font-extrabold tracking-tight text-gray-950 dark:text-white sm:text-3xl">
          Atualização Obrigatória
        </h1>
        <p id="force-update-description" className="mt-3 text-base leading-7 text-gray-700 dark:text-gray-200">
          Uma nova versão do Vapt está disponível com correções críticas e novos recursos.
        </p>
        <p className="mt-5 inline-flex rounded-full bg-[#F95D2A] px-4 py-2 text-sm font-extrabold text-white">
          Versão {update.latestVersion} já disponível
        </p>
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
        <button
          ref={buttonRef}
          type="button"
          disabled={opening}
          onClick={() => void startUpdate()}
          className="mt-6 inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-[#F95D2A] px-6 py-3.5 text-base font-extrabold text-white shadow-lg shadow-orange-500/20 transition-colors hover:bg-[#E64D1B] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-orange-500 disabled:cursor-wait disabled:opacity-60"
        >
          <Download size={20} aria-hidden="true" />
          {opening ? 'Abrindo atualização…' : 'Atualizar Aplicativo Agora'}
        </button>
      </section>
    </div>,
    document.body
  );
}
