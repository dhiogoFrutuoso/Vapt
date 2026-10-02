import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Store, X } from 'lucide-react';
import { useConfirm } from '../components/ConfirmModal';
import { deviceApi } from './deviceApi';
import { useDeviceAuth } from './DeviceAuthContext';
import { installPersonalizedBuild } from './nativeUpdater';

type Identity = { appId: string; revision: string; version: string };
type Artifact = { url: string; sha256: string };
type Job = { revision: string; version: string; canRetry?: boolean; state: 'available' | 'queued' | 'building' | 'failed' | 'ready'; artifacts?: { apk: Artifact; exe: Artifact } };
const native = registerPlugin<{ status(): Promise<Identity> }>('VaptBranding');
const desktop = () => (window as unknown as { vaptSecure?: { brandingStatus?: () => Promise<Identity> } }).vaptSecure;

export function RestaurantPersonalization({ appId, name, logoUrl, profile = false }: {
  appId: string; name: string; logoUrl: string | null; profile?: boolean;
}) {
  const supported = Capacitor.getPlatform() === 'android' || Boolean(desktop()?.brandingStatus);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [installerOpened, setInstallerOpened] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(`vapt.branding.dismissed.v2:${appId}`) === 'true'; } catch { return false; }
  });
  const { logout } = useDeviceAuth();
  const { confirm, ConfirmElement } = useConfirm();
  const dialog = useRef<HTMLDialogElement>(null);
  const alive = useRef(true);
  const mandatory = Boolean(identity?.appId && identity.appId !== appId);
  const waiting = job?.state === 'queued' || job?.state === 'building';
  const installed = Boolean(identity?.revision && job?.revision === identity.revision);
  const missingLogo = !logoUrl;
  const refresh = useCallback(async () => {
    const status = await (desktop()?.brandingStatus?.() ?? native.status());
    if (alive.current) setIdentity(status);
    const current = await deviceApi.get<Job>('/device/native-build');
    if (alive.current) { setJob(current); setError(''); }
  }, []);
  useEffect(() => {
    alive.current = true;
    if (supported) void refresh().catch(e => { if (alive.current) setError(e.message || 'Não foi possível verificar a personalização.'); });
    return () => { alive.current = false; };
  }, [supported, appId, refresh]);
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => void refresh().catch(() => {
      if (alive.current) setError('Sem conexão. A compilação continua; tentaremos consultar novamente.');
    }), 8000);
    return () => window.clearInterval(timer);
  }, [waiting, refresh]);
  useEffect(() => {
    if (mandatory && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [mandatory]);

  if (!supported || (!mandatory && !profile && (dismissed || installed))) return null;
  async function perform() {
    setBusy(true); setError('');
    try {
      if (!identity) { await refresh(); return; }
      const current = await deviceApi.post<Job>('/device/native-build', {});
      if (!alive.current) return;
      setJob(current);
      if (current.state === 'ready' && current.artifacts) {
        await installPersonalizedBuild(current.artifacts, current.version, p => {
          if (alive.current) setProgress(p.percent);
        });
        if (alive.current) setInstallerOpened(true);
      }
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : 'Não foi possível preparar o aplicativo. Tente novamente.');
    } finally { if (alive.current) { setBusy(false); setProgress(null); } }
  }
  const content = <section className="restaurant-personalization">
    <Store size={24} aria-hidden="true" />
    <div>
      <strong id={mandatory ? 'branding-required-title' : undefined}>{mandatory ? `Atualize o aplicativo para ${name}` : `Aplicativo do ${name}`}</strong>
      <p>{mandatory
        ? 'Este aparelho tem a versão de outro restaurante. Instale a versão desta conta para continuar. Seus pedidos e dados permanecem no sistema.'
        : installed ? 'Nome e ícone deste restaurante já estão instalados. Eles serão mantidos mesmo quando você sair da conta.'
        : 'Use o nome e a logo do restaurante no aplicativo instalado. É uma atualização do Vapt neste aparelho, sem criar outro aplicativo.'}</p>
      <div role="status" aria-live="polite">
        {waiting && <p>{job.state === 'queued' ? 'Solicitação na fila de compilação.' : 'Gerando e assinando os instaladores.'} Pode levar alguns minutos. Você pode voltar depois.</p>}
        {progress !== null && <p>Baixando atualização: {progress}%</p>}
        {installerOpened && <p>Confirme a atualização no instalador do sistema. Se você cancelou, toque novamente em instalar.</p>}
      </div>
      {error && <p role="alert">{error}</p>}
      {missingLogo && <p role="status">O responsável precisa adicionar a logo em Configurações do Aplicativo → Aparência e Contato, no site. Depois, volte aqui para verificar.</p>}
      {job?.state === 'failed' && <p role="alert">{job.canRetry === false ? 'As tentativas de compilação foram esgotadas. Entre em contato com o suporte para liberar uma nova tentativa.' : 'A compilação falhou. Você pode tentar novamente.'}</p>}
      {!installed && <button type="button" disabled={busy || waiting || job?.canRetry === false} onClick={() => {
        if (missingLogo || !identity || !job) {
          setBusy(true);
          void refresh().catch(e => setError(e.message || 'Não foi possível verificar.')).finally(() => setBusy(false));
          return;
        }
        confirm({ title: `Instalar aplicativo do ${name}?`,
          message: 'A atualização troca somente o nome e o ícone. O aplicativo poderá fechar durante a instalação. Não desinstale o Vapt: confirme a atualização quando o sistema solicitar.',
          confirmText: job?.state === 'ready' ? 'Instalar atualização' : 'Preparar aplicativo',
          isDestructive: false, onConfirm: () => { void perform(); } });
      }}>{busy ? 'Verificando…' : waiting ? 'Aguardando instaladores…' : missingLogo ? 'Já adicionei a logo, verificar' : !identity || !job ? 'Verificar novamente' : job?.state === 'ready' ? 'Instalar atualização personalizada' : 'Personalizar este aparelho'}</button>}
      {mandatory && <button type="button" disabled={busy} onClick={() => void logout()}>Sair desta conta</button>}
    </div>
    {!mandatory && !profile && <button type="button" disabled={busy} aria-label="Personalizar depois" onClick={() => {
      try { localStorage.setItem(`vapt.branding.dismissed.v2:${appId}`, 'true'); } catch { /* Optional preference. */ }
      setDismissed(true);
    }}><X size={20} /></button>}
    {ConfirmElement}
  </section>;
  return mandatory
    ? <dialog className="restaurant-personalization-gate" ref={dialog} aria-labelledby="branding-required-title" onCancel={event => event.preventDefault()}>{content}</dialog>
    : content;
}
