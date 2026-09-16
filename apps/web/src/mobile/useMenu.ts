import { useCallback, useEffect, useState } from 'react';
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

  const buscar = useCallback(async () => {
    if (!token) return;
    try {
      const dados = await deviceApi.get<Menu>('/device/menu');
      setMenu({ ...VAZIO, ...dados });
    } finally {
      setCarregando(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let vivo = true;

    (async () => {
      try {
        const dados = await deviceApi.get<Menu>('/device/menu');
        if (vivo) setMenu({ ...VAZIO, ...dados });
      } catch {
        /*
         * Falhar aqui não derruba o app: sem cardápio, o garçom ainda vê as
         * mesas abertas e a cozinha ainda vê o que produzir. Só o lançamento
         * de item novo fica indisponível, e a tela mostra a lista vazia.
         */
      } finally {
        if (vivo) setCarregando(false);
      }
    })();

    return () => {
      vivo = false;
    };
  }, [token]);

  useEffect(() => {
    if (!token || !appId) return;
    const socket = io(socketOrigin(), { auth: { token, appId }, transports: ['polling', 'websocket'] });
    socket.on('menu_item_availability_changed', (event: { productId: string; available: boolean }) => {
      setMenu((current) => ({
        ...current,
        products: current.products.map((product) =>
          product.id === event.productId ? { ...product, available: event.available } : product
        ),
      }));
    });
    socket.on('team_changed', () => void buscar());
    return () => {
      socket.close();
    };
  }, [token, appId, buscar]);

  return { menu, carregando, recarregar: buscar };
}
