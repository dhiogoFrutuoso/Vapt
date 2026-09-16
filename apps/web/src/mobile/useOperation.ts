import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { deviceApi } from './deviceApi';
import type {
  CashEntry,
  CashMovement,
  CashClosure,
  AuditEntry,
  DeliveryOrder,
  KitchenStatus,
  OrderItem,
  PaymentSplit,
  PreviewTable,
  TableStatus,
  TakeoutOrder,
} from '../components/phone/types';

/**
 * Estado operacional do restaurante, vindo do servidor.
 *
 * Substitui o `useState` do simulador: onde o `EditorPreview` guardava mesas
 * e pedidos em memória, aqui cada mudança vira um comando para a API e volta
 * como o estado novo — o mesmo para todos os aparelhos.
 *
 * TRÊS CAMINHOS DE ATUALIZAÇÃO, E POR QUÊ
 * ---------------------------------------
 *   1. A resposta do próprio comando. O servidor devolve o estado completo
 *      depois de aplicar, então quem agiu vê o resultado sem nova viagem.
 *   2. O socket. Quando OUTRO aparelho muda algo, chega um aviso e este
 *      recarrega. O aviso traz só o tipo do comando, nunca os dados: mandar
 *      o estado pelo socket duplicaria a autorização, e um aparelho receberia
 *      o que talvez não possa ver.
 *   3. Uma sondagem lenta. Em serverless o socket não conecta, e sem ela a
 *      cozinha ficaria muda até alguém trocar de aba. Trinta segundos é
 *      pouco para um turno e barato para o servidor.
 */

export type EstadoOperacao = {
  tables: PreviewTable[];
  takeouts: TakeoutOrder[];
  deliveries: DeliveryOrder[];
  cashEntries: CashEntry[];
  cashArchive: CashEntry[];
  kitchenStatus: Record<string, KitchenStatus>;
  cashMovements: CashMovement[];
  cashClosures: CashClosure[];
  auditLog: AuditEntry[];
};

const VAZIO: EstadoOperacao = {
  tables: [],
  takeouts: [],
  deliveries: [],
  cashEntries: [],
  cashArchive: [],
  kitchenStatus: {},
  cashMovements: [],
  cashClosures: [],
  auditLog: [],
};

/** Todo comando aceito pela API, com a forma exata de cada um. */
export type Comando =
  | { tipo: 'mesa.abrir'; mesaId: string }
  | { tipo: 'mesa.status'; mesaId: string; status: TableStatus }
  | { tipo: 'mesa.item.adicionar'; mesaId: string; item: OrderItem }
  | { tipo: 'mesa.item.remover'; mesaId: string; indice: number }
  | { tipo: 'retirada.criar'; customerName: string; phone?: string }
  | { tipo: 'retirada.status'; retiradaId: string; status: TableStatus }
  | { tipo: 'retirada.remover'; retiradaId: string }
  | { tipo: 'retirada.item.adicionar'; retiradaId: string; item: OrderItem }
  | { tipo: 'retirada.item.remover'; retiradaId: string; indice: number }
  | { tipo: 'comanda.pagar'; alvo: 'mesa' | 'retirada'; alvoId: string; payments: PaymentSplit }
  | { tipo: 'comanda.cancelar'; alvo: 'mesa' | 'retirada'; alvoId: string }
  | {
      tipo: 'pedido.criar';
      customerName: string;
      phone?: string;
      items: OrderItem[];
      payments: PaymentSplit;
      address: DeliveryOrder['address'];
      notes?: string;
      isDelivery?: boolean;
    }
  | {
      tipo: 'pedido.atualizar';
      pedidoId: string;
      customerName: string;
      phone?: string;
      items: OrderItem[];
      payments: PaymentSplit;
      address: DeliveryOrder['address'];
      notes?: string;
      isDelivery?: boolean;
    }
  | { tipo: 'pedido.aceitar'; pedidoId: string; fee: number; employeeId?: string }
  | { tipo: 'pedido.rejeitar'; pedidoId: string }
  | { tipo: 'pedido.avancar'; pedidoId: string }
  | { tipo: 'pedido.voltar'; pedidoId: string }
  | { tipo: 'pedido.cancelar'; pedidoId: string }
  | { tipo: 'caixa.pagamento'; lancamentoId: string; payments: PaymentSplit }
  | {
      tipo: 'caixa.editar';
      lancamentoId: string;
      payments?: PaymentSplit;
      items?: OrderItem[];
      deliveryFee?: number;
    }
  | { tipo: 'caixa.cancelar'; lancamentoId: string; motivo?: string }
  | { tipo: 'caixa.fechar'; counted: { dinheiro: number; cartao: number; pix: number } }
  | { tipo: 'caixa.movimento'; movementType: 'sangria'; amount: number; reason: string }
  | { tipo: 'caixa.reabrir'; lancamentoId: string }
  | { tipo: 'fiado.abater'; lancamentoId: string; amount: number }
  | { tipo: 'pedido.entregador'; pedidoId: string; employeeId: string }
  | { tipo: 'cozinha.status'; comandaId: string; saguoes: string[]; status: KitchenStatus };

type Resposta = EstadoOperacao & { mensagem?: string | null };

/** Origem do socket: o HOST da API, sem o sufixo `/api`. */
function origemDoSocket(): string {
  const base = import.meta.env.VITE_API_URL ?? '/api';
  if (base.startsWith('http')) return base.replace(/\/api\/?$/, '');
  return window.location.origin;
}

export function useOperation(
  appId: string | null,
  token: string | null,
  /** Funcionário logado, para o kill-switch saber se o evento é dele. */
  employeeId: string | null,
  /** Chamado quando o painel revoga esta sessão. */
  aoRevogar?: () => void | Promise<void>
) {
  const [estado, setEstado] = useState<EstadoOperacao>(VAZIO);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  /*
   * A busca fica numa ref para que o socket e a sondagem a chamem sem
   * entrarem nas dependências do efeito — do contrário o socket
   * reconectaria a cada render, e reconexão constante perde eventos.
   */
  const buscarRef = useRef<() => Promise<void>>(async () => {});

  const buscar = useCallback(async () => {
    try {
      const dados = await deviceApi.get<EstadoOperacao>('/device/operation');
      setEstado({ ...VAZIO, ...dados });
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar a operação.');
    } finally {
      setCarregando(false);
    }
  }, []);

  buscarRef.current = buscar;

  useEffect(() => {
    if (!token) return;
    void buscar();
  }, [token, buscar]);

  /* ------------------------------ Tempo real ------------------------------ */

  useEffect(() => {
    if (!appId || !token) return;

    let socket: Socket | null = null;

    try {
      socket = io(origemDoSocket(), {
        auth: { token, appId },
        transports: ['polling', 'websocket'],
        reconnection: true,
        reconnectionDelay: 1500,
        reconnectionDelayMax: 10000,
      });

      socket.on('operation_changed', () => void buscarRef.current());
      /* Pedido novo entrando pelo site do cliente também mexe na operação. */
      socket.on('new_order', () => void buscarRef.current());
      socket.on('order_updated', () => void buscarRef.current());

      /*
       * Kill-switch: o dono bloqueou ou excluiu este funcionário.
       *
       * O evento vai para a sala inteira do restaurante, então cada aparelho
       * confere se o alvo é ele. O `deviceApi` já limpa o armazenamento e
       * avisa a interface pelo mesmo caminho que usa quando o refresh falha —
       * reaproveitar isso evita uma segunda porta de saída para manter.
       */
      socket.on('session_revoked', (dados: { employeeId?: string; motivo?: string }) => {
        if (!dados?.employeeId || dados.employeeId !== employeeId) return;
        console.warn('[sessao] Revogada pelo painel:', dados.motivo);
        void aoRevogar?.();
      });

      socket.on('connect_error', (e) => {
        /* Não é fatal: a sondagem abaixo cobre. Em serverless o socket nunca
           conecta, e isso é esperado — o app degrada em vez de ficar mudo. */
        console.warn('[operacao] Sem tempo real:', e.message);
      });
    } catch (e) {
      console.warn('[operacao] Nao foi possivel iniciar o tempo real.', e);
    }

    return () => {
      socket?.close();
    };
  }, [appId, token, employeeId, aoRevogar]);

  /* ------------------------------- Sondagem ------------------------------- */

  useEffect(() => {
    if (!token) return;

    const id = window.setInterval(() => {
      /*
       * Aba escondida não recarrega. O tablet do salão fica horas na tela de
       * bloqueio, e sondar ali só gasta bateria e requisição — ao voltar, o
       * `visibilitychange` abaixo já busca.
       */
      if (document.visibilityState === 'visible') void buscarRef.current();
    }, 30_000);

    const aoVoltar = () => {
      if (document.visibilityState === 'visible') void buscarRef.current();
    };
    document.addEventListener('visibilitychange', aoVoltar);

    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, [token]);

  /* ------------------------------- Comandos ------------------------------- */

  const executar = useCallback(async (comando: Comando): Promise<string | null> => {
    const dados = await deviceApi.post<Resposta>('/device/operation', comando);
    const { mensagem, ...novo } = dados;
    setEstado({ ...VAZIO, ...novo });
    return mensagem ?? null;
  }, []);

  return { estado, carregando, erro, executar, recarregar: buscar };
}
