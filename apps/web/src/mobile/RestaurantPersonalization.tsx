import { useEffect, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Store, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useConfirm } from '../components/ConfirmModal';
import { getImageUrl } from '../lib/api';

export const restaurantBranding = registerPlugin<{
  status(): Promise<{ supported: boolean; appId: string; version: string; pinned: boolean }>;
  personalize(options: { appId: string; name: string; icon: string }): Promise<{ updated: boolean }>;
  clear(): Promise<void>;
}>('VaptBranding');

async function shortcutIcon(url: string | null): Promise<string> {
  if (!url) return '';
  const img = new Image(); img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('Não foi possível carregar o logotipo. Tente novamente.')), 10000);
    img.onload = () => { window.clearTimeout(timer); resolve(); };
    img.onerror = () => { window.clearTimeout(timer); reject(new Error('Não foi possível carregar o logotipo. Tente novamente.')); };
    img.src = /^https?:\/\//.test(url) ? url : getImageUrl(url)!;
  });
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 192;
  const ctx = canvas.getContext('2d'); if (!ctx) return '';
  const size = Math.min(192 / img.width, 192 / img.height);
  ctx.drawImage(img, (192 - img.width * size) / 2, (192 - img.height * size) / 2, img.width * size, img.height * size);
  return canvas.toDataURL('image/png').split(',')[1];
}

export function RestaurantPersonalization({ appId, name, logoUrl, profile = false }: {
  appId: string; name: string; logoUrl: string | null; profile?: boolean;
}) {
  const [available, setAvailable] = useState(false);
  const [supported, setSupported] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const { confirm, ConfirmElement } = useConfirm();
  useEffect(() => {
    if (!Capacitor.isPluginAvailable('VaptBranding')) return;
    let alive = true;
    void restaurantBranding.status().then(s => { if (alive) { setSupported(s.supported); setAvailable(profile || s.appId !== appId || !s.pinned); } }).catch(() => {});
    return () => { alive = false; };
  }, [appId, profile]);
  if (!available || dismissed) return null;
  return <section className="restaurant-personalization">
    <Store size={22} aria-hidden="true" />
    <div><strong>Seu acesso ao {name}</strong><p>{supported ? 'Adicione um atalho com o nome e o ícone do restaurante neste aparelho. O aplicativo instalado continua sendo o Vapt.' : 'A tela inicial deste aparelho não permite criar atalhos personalizados. A identidade do restaurante continua aplicada dentro do Vapt.'}</p>
      {supported && <button type="button" disabled={busy} onClick={() => confirm({
        title: `Personalizar para ${name}?`, message: 'Apenas este aparelho será alterado. Após uma atualização do APK, entre novamente para renovar a personalização. O Android poderá pedir confirmação para adicionar o atalho.',
        confirmText: 'Personalizar meu aparelho', isDestructive: false, onConfirm: async () => {
          setBusy(true);
          try {
            const icon = await shortcutIcon(logoUrl);
            const result = await restaurantBranding.personalize({ appId, name, icon });
            toast.success(result.updated ? 'Atalho do restaurante atualizado.' : 'Solicitação enviada. Confirme o atalho na tela do Android.');
            setDismissed(true);
          } catch (error) { toast.error(error instanceof Error ? error.message : 'Não foi possível criar o atalho.'); }
          finally { setBusy(false); }
        },
      })}>{busy ? 'Preparando…' : 'Personalizar este aparelho'}</button>}
    </div>
    {!profile && <button type="button" aria-label="Personalizar depois" disabled={busy} onClick={() => setDismissed(true)}><X size={18} /></button>}
    {ConfirmElement}
  </section>;
}
