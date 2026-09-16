import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import packageInfo from '../../package.json';
import { useDeviceAuth } from './DeviceAuthContext';

export type AppVersionPayload = {
  latestVersion: string;
  minVersion: string;
  buildId: string;
  tenantBuilds: Record<string, string>;
  reason: string;
  forceUpdate: boolean;
  downloadUrls: { apk: string; exe: string };
  changelog: string[] | string;
};

type CheckState = 'checking' | 'ready' | 'error';
type ForceUpdateValue = {
  localVersion: string;
  localBuildId: string;
  update: AppVersionPayload | null;
  isUpdateRequired: boolean;
  checkState: CheckState;
  retry: () => Promise<void>;
};

const BASE = import.meta.env.VITE_API_URL ?? '/api';
export const LOCAL_APP_VERSION = import.meta.env.VITE_APP_VERSION?.trim() || packageInfo.version;
export const LOCAL_BUILD_ID = import.meta.env.VITE_APP_BUILD_ID?.trim() || LOCAL_APP_VERSION;
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
  if (!a || !b) return -1;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return Number(a[index]) > Number(b[index]) ? 1 : -1;
  }
  if (a[3] === b[3]) return 0;
  if (!a[3]) return 1;
  if (!b[3]) return -1;
  return a[3].localeCompare(b[3], undefined, { numeric: true });
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  );
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

  return {
    ...value,
    buildId: typeof value.buildId === 'string' ? value.buildId : value.latestVersion,
    tenantBuilds: stringRecord(value.tenantBuilds),
    reason: typeof value.reason === 'string' ? value.reason : '',
    changelog: value.changelog ?? [],
  } as AppVersionPayload;
}

export function ForceUpdateProvider({ children }: { children: ReactNode }) {
  const { appId } = useDeviceAuth();
  const [published, setPublished] = useState<AppVersionPayload | null>(null);
  const publishedRef = useRef<AppVersionPayload | null>(null);
  const [checkState, setCheckState] = useState<CheckState>('checking');

  const acceptVersion = useCallback((incoming: unknown) => {
    const version = unwrap(incoming);
    if (!version) return false;
    publishedRef.current = version;
    setPublished(version);
    setCheckState('ready');
    return true;
  }, []);

  const checkVersion = useCallback(async () => {
    setCheckState((state) => (state === 'ready' ? state : 'checking'));
    try {
      const response = await fetch(`${BASE}/public/app/version`, { cache: 'no-store' });
      if (!response.ok || !acceptVersion(await response.json())) throw new Error('Resposta de versão inválida.');
    } catch (error) {
      console.warn('[update] Não foi possível verificar a versão.', error);
      if (!publishedRef.current) setCheckState('error');
    }
  }, [acceptVersion]);

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
    const socket: Socket = io(socketOrigin(), {
      auth: { updates: true },
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionDelay: 1500,
      reconnectionDelayMax: 10000,
    });
    socket.on('app:force_update_published', acceptVersion);
    return () => {
      socket.close();
    };
  }, [acceptVersion]);

  const update = useMemo(() => {
    if (!published?.forceUpdate) return null;
    const versionTooOld = compareSemver(LOCAL_APP_VERSION, published.minVersion) < 0;
    const tenantBuild = appId ? published.tenantBuilds[appId] ?? published.tenantBuilds['*'] : undefined;
    const incompatibleTenantBuild = Boolean(tenantBuild && tenantBuild !== LOCAL_BUILD_ID);
    return versionTooOld || incompatibleTenantBuild ? published : null;
  }, [appId, published]);

  const value = useMemo<ForceUpdateValue>(
    () => ({
      localVersion: LOCAL_APP_VERSION,
      localBuildId: LOCAL_BUILD_ID,
      update,
      isUpdateRequired: update !== null,
      checkState,
      retry: checkVersion,
    }),
    [checkState, checkVersion, update]
  );

  return <ForceUpdateContext.Provider value={value}>{children}</ForceUpdateContext.Provider>;
}

export function useForceUpdate(): ForceUpdateValue {
  const context = useContext(ForceUpdateContext);
  if (!context) throw new Error('useForceUpdate deve estar dentro de ForceUpdateProvider.');
  return context;
}
