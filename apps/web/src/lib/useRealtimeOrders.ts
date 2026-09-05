import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';

/**
 * Escuta os eventos de pedido do restaurante.
 *
 * A Recepção e a Cozinha ficam abertas o turno inteiro. Sem push, um pedido
 * novo só aparece quando alguém troca de aba — e pedido que ninguém vê é
 * cliente esperando.
 *
 * O socket entra na sala do restaurante pelo `appId`, mas quem decide a sala é
 * o SERVIDOR, a partir do token: o `appId` do handshake é conferido contra a
 * posse do aplicativo. Um cliente não consegue pedir para entrar numa sala que
 * não é dele.
 */

export type EventoPedido = {
  orderId: string;
  code?: string;
  customerName?: string;
  status?: string;
  source?: string;
};

type Handlers = {
  onNewOrder?: (evento: EventoPedido) => void;
  onOrderUpdated?: (evento: EventoPedido) => void;
};

/**
 * Origem do socket.
 *
 * Precisa ser o HOST da API, sem o sufixo `/api` — o Socket.io monta o próprio
 * caminho (`/socket.io/`) a partir da raiz. Passar a base com `/api` faz o
 * handshake bater em `/api/socket.io/` e falhar com 404, que na tela aparece
 * como "não conecta" sem explicação.
 */
function origemDoSocket(): string {
  const base = import.meta.env.VITE_API_URL ?? '/api';
  if (base.startsWith('http')) return base.replace(/\/api\/?$/, '');
  // Base relativa: o socket fala com a própria origem da página.
  return window.location.origin;
}

export function useRealtimeOrders(
  appId: string | null | undefined,
  token: string | null | undefined,
  handlers: Handlers
): void {
  /*
   * Os handlers vão numa ref porque mudam a cada render (são closures sobre o
   * estado). Se entrassem nas dependências do efeito, o socket reconectaria a
   * cada digitação — e reconexão constante perde eventos.
   */
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    if (!appId || !token) return;

    let socket: Socket | null = null;

    try {
      socket = io(origemDoSocket(), {
        auth: { token, appId },
        transports: ['polling', 'websocket'],
        // Rede de restaurante cai; reconectar sozinho é o comportamento certo.
        reconnection: true,
        reconnectionDelay: 1500,
        reconnectionDelayMax: 10000,
      });

      socket.on('new_order', (evento: EventoPedido) => ref.current.onNewOrder?.(evento));
      socket.on('order_updated', (evento: EventoPedido) => ref.current.onOrderUpdated?.(evento));

      socket.on('unauthorized', () => {
        console.warn('[realtime] Sessao recusada pelo tempo real.');
        socket?.close();
      });

      socket.on('connect_error', (erro) => {
        /*
         * Falha de conexão NÃO é fatal: o app continua funcionando sem push, e
         * quem troca de aba vê os pedidos. Só registra para o operador saber
         * que o tempo real está fora — em serverless, por exemplo, ele nunca
         * conecta e isso é esperado.
         */
        console.warn('[realtime] Sem tempo real:', erro.message);
      });
    } catch (erro) {
      console.warn('[realtime] Nao foi possivel iniciar o tempo real.', erro);
    }

    return () => {
      socket?.close();
    };
  }, [appId, token]);
}
