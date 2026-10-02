import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { deviceApi } from './deviceApi';
import type {
  CategoryItem,
  PreviewProduct,
  PreviewPromotion,
} from '../components/phone/types';

/**
 * Cardápio e configuração de operação do restaurante.
 *
 * Separado do `useOperation` de propósito: o cardápio muda quando o dono edita
 * o aplicativo — raramente, e nunca no meio de um pedido. A operação muda a
 * cada item lançado. Buscá-los juntos faria a tela recarregar duzentos
 * produtos toda vez que um garçom encostasse num botão.
 */

export type Menu = {
  appPlanType?: string;
  allowedTabs?: string[];
  permissions?: string[];
  storeName: string;
  branding: {
    logoUrl: string | null;
    primaryColor: string;
    secondaryColor: string;
    theme: 'claro' | 'escuro';
    tagline: string;
  };
  delivery: {
    enabled: boolean;
    fee: number;
    minOrder: number;
    estimatedMinutes: number;
    courierPaidPerDelivery: boolean;
    whatsapp: string;
  };
  dining: { waiterCommissionRate: number };
  categories: CategoryItem[];
  products: PreviewProduct[];
  promotions: PreviewPromotion[];
  stations: string[];
  /** Equipe ativa, so id e nome — para o seletor de entregador. */
  equipe: Array<{
    id: string;
    name: string;
    roleName: string;
    permissions: string[];
    isDeliveryman: boolean;
  }>;
};

const VAZIO: Menu = {
  storeName: '',
  branding: {
    logoUrl: null,
    primaryColor: '#F95D2A',
    secondaryColor: '#111827',
    theme: 'claro',
    tagline: '',
  },
  delivery: {
    enabled: true,
    fee: 0,
    minOrder: 0,
    estimatedMinutes: 35,
    courierPaidPerDelivery: false,
    whatsapp: '',
  },
  dining: { waiterCommissionRate: 0 },
  categories: [],
  products: [],
  promotions: [],
  stations: [],
  equipe: [],
};

function socketOrigin(): string {
  const base = import.meta.env.VITE_API_URL ?? '/api';
  return base.startsWith('http') ? base.replace(/\/api\/?$/, '') : window.location.origin;
}

export function useMenu(token: string | null, appId?: string | null) {
  const [menu, setMenu] = useState<Menu>(VAZIO);
  const [carregando, setCarregando] = useState(true);
  const [availabilityPending, setAvailabilityPending] = useState<string[]>([]);
  const pending = useRef(new Map<string, boolean>());
  const revision = useRef(0);
  const fetching = useRef(false);
  const session = useRef(token);
  session.current = token;

  const buscar = useCallback(async () => {
    if (!token || fetching.current) return;
    fetching.current = true;
    const started = revision.current;
    try {
      const dados = await deviceApi.get<Menu>('/device/menu');
      if (session.current === token && started === revision.current) {
        setMenu({ ...VAZIO, ...dados, products: dados.products.map(product =>
          pending.current.has(product.id ?? '') ? { ...product, available: pending.current.get(product.id!) } : product) });
      }
    } finally {
      fetching.current = false;
      setCarregando(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const refresh = () => { if (document.visibilityState !== 'hidden') void buscar().catch(() => {}); };
    refresh();
    // Socket pode não existir em serverless. A fila local é instantânea;
    // os outros aparelhos se recuperam automaticamente sem recarregar a tela.
    const timer = window.setInterval(refresh, 5000);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('online', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [token, buscar]);

  const alterarDisponibilidade = useCallback(async (productId: string, available: boolean) => {
    if (pending.current.has(productId)) return;
    pending.current.set(productId, available);
    revision.current++;
    setAvailabilityPending([...pending.current.keys()]);
    setMenu(current => ({ ...current, products: current.products.map(p => p.id === productId ? { ...p, available } : p) }));
    try {
      await deviceApi.patch(`/device/menu/products/${productId}/availability`, { available });
    } catch (error) {
      if (session.current === token) setMenu(current => ({ ...current, products: current.products.map(p => p.id === productId ? { ...p, available: !available } : p) }));
      throw error;
    } finally {
      revision.current++;
      pending.current.delete(productId);
      setAvailabilityPending([...pending.current.keys()]);
    }
  }, [token]);

  useEffect(() => {
    if (!token || !appId) return;
    const socket = io(socketOrigin(), { auth: { token, appId }, transports: ['polling', 'websocket'] });
    socket.on('menu_item_availability_changed', (event: { productId: string; available: boolean }) => {
      if (pending.current.has(event.productId)) return;
      revision.current++;
      setMenu((current) => ({
        ...current,
        products: current.products.map((product) =>
          product.id === event.productId ? { ...product, available: event.available } : product
        ),
      }));
    });
    socket.on('team_changed', () => void buscar().catch(() => {}));
    return () => {
      socket.close();
    };
  }, [token, appId, buscar]);

  return { menu, carregando, recarregar: buscar, alterarDisponibilidade, availabilityPending };
}
