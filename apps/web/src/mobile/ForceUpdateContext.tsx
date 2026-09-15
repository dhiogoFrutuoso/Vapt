import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import packageInfo from '../../package.json';
import { useDeviceAuth } from './DeviceAuthContext';

export type AppVersionPayload = {
  latestVersion: string;
  minVersion: string;
  forceUpdate: boolean;
  downloadUrls: { apk: string; exe: string };
  changelog: string[] | string;
};

type ForceUpdateValue = {
  localVersion: string;
  update: AppVersionPayload | null;
  isUpdateRequired: boolean;
};

const BASE = import.meta.env.VITE_API_URL ?? '/api';
export const LOCAL_APP_VERSION = import.meta.env.VITE_APP_VERSION?.trim() || packageInfo.version;
const ForceUpdateContext = createContext<ForceUpdateValue | null>(null);

function socketOrigin(): string {
  if (BASE.startsWith('http')) return BASE.replace(/\/api\/?$/, '');
  return window.location.origin;
}

function semverParts(version: string): [number, number, number, string] | null {
  const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] ?? ''];
}

export function compareSemver(left: string, right: string): number {
  const a = semverParts(left);
  const b = semverParts(right);
  if (!a || !b) return -1; // versão local inválida falha de forma segura: exige atualização
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return Number(a[index]) > Number(b[index]) ? 1 : -1;
  }
  if (a[3] === b[3]) return 0;
  if (!a[3]) return 1;
  if (!b[3]) return -1;
  return a[3].localeCompare(b[3], undefined, { numeric: true });
}

function unwrap(payload: unknown): AppVersionPayload | null {
  const candidate = (payload as { data?: unknown } | null)?.data ?? payload;
  if (!candidate || typeof candidate !== 'object') return null;
  const value = candidate as Partial<AppVersionPayload>;
  if (
    typeof value.latestVersion !== 'string' ||
    typeof value.minVersion !== 'string' ||
    typeof value.forceUpdate !== 'boolean' ||
    !value.downloadUrls ||
    typeof value.downloadUrls.apk !== 'string' ||
    typeof value.downloadUrls.exe !== 'string'
  ) return null;
  return value as AppVersionPayload;
}

export function ForceUpdateProvider({ children }: { children: ReactNode }) {
  const { appId, accessToken } = useDeviceAuth();
  const [update, setUpdate] = useState<AppVersionPayload | null>(null);

  const applyVersion = useCallback((incoming: unknown) => {
    const version = unwrap(incoming);
    if (!version) return;
    setUpdate(version.forceUpdate && compareSemver(LOCAL_APP_VERSION, version.minVersion) < 0 ? version : null);
  }, []);

  const checkVersion = useCallback(async () => {
    try {
      const response = await fetch(`${BASE}/public/app/version`, { cache: 'no-store' });
      if (!response.ok) return;
      applyVersion(await response.json());
    } catch (error) {
      console.warn('[update] Não foi possível verificar a versão.', error);
    }
  }, [applyVersion]);

  useEffect(() => {
    void checkVersion();
  }, [checkVersion]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void checkVersion();
    };
    const interval = window.setInterval(onVisible, 30_000);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [checkVersion]);

  useEffect(() => {
    if (!appId || !accessToken) return;
    const socket: Socket = io(socketOrigin(), {
      auth: { token: accessToken, appId },
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionDelay: 1500,
      reconnectionDelayMax: 10000,
    });
    socket.on('app:force_update_published', applyVersion);
    return () => {
      socket.close();
    };
  }, [appId, accessToken, applyVersion]);

  const value = useMemo<ForceUpdateValue>(
    () => ({ localVersion: LOCAL_APP_VERSION, update, isUpdateRequired: update !== null }),
    [update]
  );

  return <ForceUpdateContext.Provider value={value}>{children}</ForceUpdateContext.Provider>;
}

export function useForceUpdate(): ForceUpdateValue {
  const context = useContext(ForceUpdateContext);
  if (!context) throw new Error('useForceUpdate deve estar dentro de ForceUpdateProvider.');
  return context;
}
