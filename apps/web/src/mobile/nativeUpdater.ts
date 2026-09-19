import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { deviceStorage } from './deviceStorage';

export type UpdateProgress = { percent: number; transferred?: number; total?: number };

type AndroidUpdaterPlugin = {
  downloadAndInstall(options: { url: string; version: string; sha256?: string }): Promise<void>;
  exitApp(): Promise<void>;
  addListener(eventName: 'progress', listener: (event: UpdateProgress) => void): Promise<PluginListenerHandle>;
};

type ElectronBridge = {
  disponivel?: boolean;
  installUpdate?: (url: string) => Promise<boolean>;
  installBranding?: (url: string, sha256: string) => Promise<boolean>;
  exitApp?: () => Promise<void>;
  setUpdateGateActive?: (active: boolean) => Promise<boolean>;
  onUpdateProgress?: (listener: (event: UpdateProgress) => void) => () => void;
};

const AndroidUpdater = registerPlugin<AndroidUpdaterPlugin>('VaptUpdater');

export async function installPersonalizedBuild(
  artifacts: { apk: { url: string; sha256: string }; exe: { url: string; sha256: string } },
  version: string, onProgress: (progress: UpdateProgress) => void,
): Promise<void> {
  const bridge = electronBridge();
  if (bridge?.installBranding) {
    const remove = bridge.onUpdateProgress?.(onProgress);
    try { await bridge.installBranding(artifacts.exe.url, artifacts.exe.sha256); } finally { remove?.(); }
    return;
  }
  if (Capacitor.getPlatform() !== 'android') throw new Error('Atualize o Vapt para habilitar a personalização.');
  const listener = await AndroidUpdater.addListener('progress', onProgress);
  try { await AndroidUpdater.downloadAndInstall({ url: artifacts.apk.url, sha256: artifacts.apk.sha256, version }); }
  finally { await listener.remove(); }
}

function electronBridge(): ElectronBridge | null {
  const bridge = (window as unknown as { vaptSecure?: ElectronBridge }).vaptSecure;
  return bridge?.disponivel === true ? bridge : null;
}

export function updateDownloadUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const configured = import.meta.env.VITE_DOWNLOAD_BASE_URL?.trim();
  // A WebView do Capacitor usa https://localhost. Alguns builds antigos não
  // reportavam isNativePlatform() aqui e tentavam baixar o APK do próprio app.
  const localShellOrigin = /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
  const safeConfigured = configured && !/^https?:\/\/(?:localhost|127\.0\.0\.1)(?:[:/]|$)/i.test(configured);
  const base = (safeConfigured ? configured : '') || (localShellOrigin || !/^https?:$/.test(window.location.protocol)
    ? 'https://vapt-web.vercel.app'
    : window.location.origin);
  return new URL(path, `${base.replace(/\/$/, '')}/`).toString();
}

/** Host diferente da WebView remota: o Capacitor antigo abre o navegador do Android. */
export const LEGACY_ANDROID_DOWNLOAD_URL = 'https://vapt-api-ashen.vercel.app/api/public/app/download/android';

export function setNativeUpdateGateActive(active: boolean): void {
  void electronBridge()?.setUpdateGateActive?.(active);
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

export async function clearSessionAndExit(): Promise<void> {
  await deviceStorage.clearTokens().catch(() => undefined);
  const bridge = electronBridge();
  if (bridge?.exitApp) {
    await bridge.exitApp();
    return;
  }
  if (Capacitor.getPlatform() === 'android') {
    if (Capacitor.isPluginAvailable('VaptUpdater')) await AndroidUpdater.exitApp();
    else await CapacitorApp.exitApp();
    return;
  }
  window.location.replace('about:blank');
}

export async function installNativeUpdate(
  urls: { apk: string; exe: string },
  version: string,
  onProgress: (progress: UpdateProgress) => void
): Promise<void> {
  const bridge = electronBridge();
  if (bridge?.installUpdate) {
    const removeProgress = bridge.onUpdateProgress?.(onProgress);
    try {
      const started = await bridge.installUpdate(updateDownloadUrl(urls.exe));
      if (!started) throw new Error('O instalador não pôde ser iniciado.');
    } finally {
      removeProgress?.();
    }
    return;
  }

  if (Capacitor.getPlatform() === 'android') {
    const progressHandle = await AndroidUpdater.addListener('progress', onProgress);
    try {
      await AndroidUpdater.downloadAndInstall({ url: updateDownloadUrl(urls.apk), version });
    } finally {
      await progressHandle.remove();
    }
    return;
  }

  onProgress({ percent: 100 });
  await clearWebCaches();
  window.location.reload();
}
