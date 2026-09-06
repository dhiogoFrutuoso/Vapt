import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { MenuView } from '../components/phone/MenuView';
import { CheckoutSheet } from '../components/phone/CheckoutSheet';
import { ServiceView } from '../components/phone/ServiceView';
import { CashRegister } from '../components/phone/CashRegister';
import { OrderSheet, type Ticket } from '../components/phone/OrderSheet';
import { DeliveryView } from '../components/phone/DeliveryView';
import { ReceptionView } from '../components/phone/ReceptionView';
import { KitchenView } from '../components/phone/KitchenView';
import { ImportOrderPanel } from '../components/phone/ImportOrderPanel';
import { addressLabel, NO_STATION, sumItems } from '../components/phone/types';
import type {
  CategoryItem,
  DeliveryAddress,
  KitchenStatus,
  KitchenTicket,
  OrderItem,
  PaymentSplit,
  PreviewProduct,
  PreviewPromotion,
  PreviewTable,
  TableStatus,
  TakeoutOrder,
} from '../components/phone/types';
import type { PedidoImportado } from '../lib/parseWhatsappOrder';
import type { Comando, EstadoOperacao } from './useOperation';

/**
 * As seis áreas de operação, ligadas ao servidor.
 *
 * Os componentes visuais são os MESMOS do painel do dono — `ReceptionView`,
 * `KitchenView`, `CashRegister` e companhia não foram tocados. O que muda é
 * quem os alimenta: no painel era o estado em memória do simulador; aqui é o
 * documento de operação no MongoDB.
 *
 * O QUE FICA LOCAL, E O QUE VAI PARA O SERVIDOR
 * ---------------------------------------------
 * Vai para o servidor tudo que outra pessoa precisa ver: mesa aberta, item
 * lançado, pedido despachado, turno fechado.
 *
 * Fica local o que é da tela de quem está mexendo — o carrinho sendo montado,
 * qual mesa está aberta na frente deste garçom, o saguão filtrado na cozinha.
 * Mandar isso para o servidor faria o aparelho do colega abrir a mesa que
 * ESTE aqui acabou de tocar.
 */

type Props = {
  aba: 'cliente' | 'recepcao' | 'salao' | 'cozinha' | 'caixa' | 'entregador';
  estado: EstadoOperacao;
  executar: (comando: Comando) => Promise<string | null>;
  /** Cardápio e configuração, vindos do aplicativo do dono. */
  products: PreviewProduct[];
  promotions: PreviewPromotion[];
  categories: CategoryItem[];
  stations: string[];
  storeName: string;
  logoUrl: string | null;
  brandColor: string;
  theme: 'claro' | 'escuro';
  deliveryFee: number;
  courierPaidPerDelivery: boolean;
  waiterCommissionRate: number;
  /** Troca de aba pedida por dentro (ex.: importar pedido leva ao Cliente). */
  onIrPara: (aba: Props['aba']) => void;
};

export function AppViews({
  aba,
  estado,
  executar,
  products,
  promotions,
  categories,
  stations,
  storeName,
  logoUrl,
  brandColor,
  theme,
  deliveryFee,
  courierPaidPerDelivery,
  waiterCommissionRate,
  onIrPara,
}: Props) {
  /* ------------------------- Estado local da tela ------------------------- */

  const [cart, setCart] = useState<OrderItem[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [openTableId, setOpenTableId] = useState<string | null>(null);
  const [openTakeoutId, setOpenTakeoutId] = useState<string | null>(null);
  const [activeStation, setActiveStation] = useState('todos');
  const [editandoPedidoId, setEditandoPedidoId] = useState<string | null>(null);
  const [rascunhoCliente, setRascunhoCliente] = useState<{
    name: string;
    phone: string;
    address: string;
    notes: string;
  } | null>(null);

  const openTable = useMemo(
    () => estado.tables.find((t) => t.id === openTableId) ?? null,
    [estado.tables, openTableId]
  );
  const openTakeout = useMemo(
    () => estado.takeouts.find((t) => t.id === openTakeoutId) ?? null,
    [estado.takeouts, openTakeoutId]
  );

  /**
   * Roda um comando e mostra o resultado.
   *
   * Todo erro vira `toast` em vez de subir: no meio de um turno, uma exceção
   * não tratada apagaria a tela do caixa. A mensagem do servidor é específica
   * ("este pedido já foi despachado") e vale mais que um "erro" genérico.
   */
  async function rodar(comando: Comando) {
    try {
      const mensagem = await executar(comando);
      if (mensagem) toast.success(mensagem);
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : 'Não foi possível concluir a ação.');
    }
  }

  /* ------------------------------- Cliente ------------------------------- */

  /**
   * Importação do WhatsApp: o texto lido vira carrinho.
   *
   * A quantidade é expandida em itens repetidos porque o carrinho é uma lista
   * simples, um item por unidade — o mesmo formato que o cliente produz
   * clicando duas vezes em "adicionar".
   */
  function importarPedido(pedido: PedidoImportado) {
    const itens: OrderItem[] = [];

    for (const item of pedido.items) {
      for (let i = 0; i < item.quantity; i += 1) {
        /* Casa com o cardápio para recuperar o saguão: sem isso o item cairia
           em "Sem saguão" na Cozinha e ninguém saberia quem prepara. */
        const doCardapio = products.find(
          (p) => p.name.trim().toLowerCase() === item.name.trim().toLowerCase()
        );
        itens.push({
          name: item.name,
          price: item.price > 0 ? item.price : (doCardapio?.price ?? 0),
          station: doCardapio?.station,
        });
      }
    }

    setCart(itens);
    setRascunhoCliente({
      name: pedido.customerName,
      phone: pedido.phone,
      address: pedido.address,
      notes: pedido.notes,
    });
    setEditandoPedidoId(null);
    onIrPara('cliente');
    toast.success(
      `${itens.length} ${itens.length === 1 ? 'item importado' : 'itens importados'}. Revise e confirme.`
    );
  }

  function editarPedido(id: string) {
    const pedido = estado.deliveries.find((d) => d.id === id);
    if (!pedido) return;

    setCart(pedido.items.map((item) => ({ ...item })));
    setRascunhoCliente({
      name: pedido.customerName,
      phone: pedido.phone ?? '',
      address: pedido.address.mode === 'manual' ? addressLabel(pedido.address) : '',
      notes: '',
    });
    setEditandoPedidoId(id);
    onIrPara('cliente');
    setCheckoutOpen(true);
    toast(`Editando o pedido #${pedido.code}.`);
  }

  async function finalizarCheckout(data: {
    customerName: string;
    phone: string;
    payments: PaymentSplit;
    address: DeliveryAddress;
  }) {
    /*
     * MODO EDIÇÃO atualiza o pedido existente em vez de criar outro. Criar um
     * novo deixaria o antigo na fila, e a cozinha produziria os dois.
     */
    const comando: Comando = editandoPedidoId
      ? {
          tipo: 'pedido.atualizar',
          pedidoId: editandoPedidoId,
          customerName: data.customerName,
          phone: data.phone,
          items: cart,
          payments: data.payments,
          address: data.address,
        }
      : {
          tipo: 'pedido.criar',
          customerName: data.customerName,
          phone: data.phone,
          items: cart,
          payments: data.payments,
          address: data.address,
        };

    await rodar(comando);

    setCart([]);
    setCheckoutOpen(false);
    setEditandoPedidoId(null);
    setRascunhoCliente(null);
    onIrPara('recepcao');
  }

  /* -------------------------------- Salão -------------------------------- */

  const ticket: Ticket | null = openTable
    ? {
        id: openTable.id,
        title: `Mesa ${openTable.label}`,
        status: openTable.status,
        items: openTable.items ?? [],
        serviceFeeRate: waiterCommissionRate,
      }
    : openTakeout
      ? {
          id: openTakeout.id,
          title: `Retirada #${openTakeout.label} · ${openTakeout.customerName}`,
          status: openTakeout.status,
          items: openTakeout.items,
          serviceFeeRate: 0,
        }
      : null;

  async function abrirMesa(mesa: PreviewTable) {
    setOpenTakeoutId(null);
    setOpenTableId(mesa.id);
    if (mesa.status === 'livre') await rodar({ tipo: 'mesa.abrir', mesaId: mesa.id });
  }

  async function adicionarItem(item: OrderItem) {
    if (openTable) await rodar({ tipo: 'mesa.item.adicionar', mesaId: openTable.id, item });
    else if (openTakeout)
      await rodar({ tipo: 'retirada.item.adicionar', retiradaId: openTakeout.id, item });
  }

  async function removerItem(indice: number) {
    if (openTable) await rodar({ tipo: 'mesa.item.remover', mesaId: openTable.id, indice });
    else if (openTakeout)
      await rodar({ tipo: 'retirada.item.remover', retiradaId: openTakeout.id, indice });
  }

  async function pedirPagamento() {
    if (openTable) await rodar({ tipo: 'mesa.status', mesaId: openTable.id, status: 'pagamento' });
    else if (openTakeout)
      await rodar({ tipo: 'retirada.status', retiradaId: openTakeout.id, status: 'pagamento' });
  }

  async function confirmarPagamento(payments: PaymentSplit) {
    if (!ticket) return;
    await rodar({
      tipo: 'comanda.pagar',
      alvo: openTable ? 'mesa' : 'retirada',
      alvoId: ticket.id,
      payments,
    });
    setOpenTableId(null);
    setOpenTakeoutId(null);
  }

  async function cancelarComanda() {
    if (!ticket) return;
    await rodar({
      tipo: 'comanda.cancelar',
      alvo: openTable ? 'mesa' : 'retirada',
      alvoId: ticket.id,
    });
    setOpenTableId(null);
    setOpenTakeoutId(null);
  }

  /* ------------------------------- Cozinha ------------------------------- */

  /**
   * A cozinha não tem estado próprio de pedidos: ela lê mesa, retirada e
   * delivery e monta a fila de produção. Assim nada precisa ser
   * sincronizado — o que existe no salão existe na cozinha.
   */
  const kitchenTickets = useMemo<KitchenTicket[]>(() => {
    const lista: KitchenTicket[] = [];

    for (const mesa of estado.tables) {
      const itens = mesa.items ?? [];
      if (mesa.status === 'livre' || itens.length === 0) continue;
      lista.push({
        id: `k-mesa-${mesa.id}`,
        origin: 'mesa',
        label: `Mesa ${mesa.label}`,
        customerName: `Mesa ${mesa.label}`,
        items: itens,
        createdAt: 0,
      });
    }

    for (const retirada of estado.takeouts) {
      if (retirada.items.length === 0) continue;
      lista.push({
        id: `k-retirada-${retirada.id}`,
        origin: 'retirada',
        label: `Retirada #${retirada.label}`,
        customerName: retirada.customerName,
        items: retirada.items,
        createdAt: retirada.createdAt,
      });
    }

    for (const pedido of estado.deliveries) {
      /* Entregue já saiu da cozinha; o resto ainda interessa à produção. */
      if (pedido.status === 'entregue' || pedido.items.length === 0) continue;
      lista.push({
        id: `k-delivery-${pedido.id}`,
        origin: 'delivery',
        label: `Entrega #${pedido.code}`,
        customerName: pedido.customerName,
        items: pedido.items,
        createdAt: 0,
      });
    }

    return lista;
  }, [estado.tables, estado.takeouts, estado.deliveries]);

  function statusDaCozinha(comandaId: string, saguao: string): KitchenStatus {
    return estado.kitchenStatus[`${comandaId}::${saguao}`] ?? 'recebido';
  }

  /* --------------------------------- Telas -------------------------------- */

  if (aba === 'cliente') {
    return (
      <div className="phone__content" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div className="import-order__wrap">
          {editandoPedidoId && (
            <p className="import-order__editing">
              Editando um pedido existente. Ao confirmar, ele é atualizado.
              <button
                type="button"
                onClick={() => {
                  setEditandoPedidoId(null);
                  setRascunhoCliente(null);
                  setCart([]);
                  setCheckoutOpen(false);
                  onIrPara('recepcao');
                }}
              >
                Cancelar
              </button>
            </p>
          )}
          <ImportOrderPanel onImport={importarPedido} />
        </div>

        <MenuView
          appName={storeName}
          primaryColor={brandColor}
          logoUrl={logoUrl}
          theme={theme}
          interactive
          products={products}
          promotions={promotions}
          categories={categories}
          cart={cart}
          onAddToCart={(p) =>
            setCart([
              ...cart,
              {
                name: p.name,
                price: p.price,
                station: p.station,
                isPromo: p.isPromo,
                components: p.components,
              },
            ])
          }
          onRemoveFromCart={(name) => {
            const idx = cart.findIndex((i) => i.name === name);
            if (idx !== -1) {
              const novo = [...cart];
              novo.splice(idx, 1);
              setCart(novo);
            }
          }}
          onOpenCheckout={() => setCheckoutOpen(true)}
          isCheckoutOpen={checkoutOpen}
        />

        {checkoutOpen && cart.length > 0 && (
          <CheckoutSheet
            items={cart}
            initial={rascunhoCliente ?? undefined}
            submitLabel={editandoPedidoId ? 'Salvar alterações' : undefined}
            onClose={() => setCheckoutOpen(false)}
            onSubmit={(dados) => void finalizarCheckout(dados)}
          />
        )}
      </div>
    );
  }

  if (aba === 'recepcao') {
    return (
      <ReceptionView
        deliveries={estado.deliveries}
        defaultFee={deliveryFee}
        onEdit={editarPedido}
        onAccept={(id, fee) => void rodar({ tipo: 'pedido.aceitar', pedidoId: id, fee })}
        onReject={(id) => void rodar({ tipo: 'pedido.rejeitar', pedidoId: id })}
      />
    );
  }

  if (aba === 'salao') {
    return (
      <>
        <ServiceView
          tables={estado.tables}
          takeouts={estado.takeouts}
          interactive
          flash={null}
          onOpenTable={(mesa) => void abrirMesa(mesa)}
          onOpenTakeout={(retirada: TakeoutOrder) => {
            setOpenTableId(null);
            setOpenTakeoutId(retirada.id);
          }}
          onCreateTakeout={(nome, telefone) =>
            void rodar({ tipo: 'retirada.criar', customerName: nome, phone: telefone })
          }
          onSetTableStatus={(id: string, status: TableStatus) =>
            void rodar({ tipo: 'mesa.status', mesaId: id, status })
          }
          onSetTakeoutStatus={(id: string, status: TableStatus) =>
            void rodar({ tipo: 'retirada.status', retiradaId: id, status })
          }
          onCancelTakeout={(id: string) => {
            void rodar({ tipo: 'retirada.remover', retiradaId: id });
            if (openTakeoutId === id) setOpenTakeoutId(null);
          }}
        />

        {ticket && (
          <OrderSheet
            ticket={ticket}
            categories={categories}
            products={products}
            onAddItem={(item) => void adicionarItem(item)}
            onRemoveItem={(indice) => void removerItem(indice)}
            onRequestPayment={() => void pedirPagamento()}
            onConfirmPayment={(payments) => void confirmarPagamento(payments)}
            onCancelOrder={() => void cancelarComanda()}
            onDismiss={() => {
              setOpenTableId(null);
              setOpenTakeoutId(null);
            }}
          />
        )}
      </>
    );
  }

  if (aba === 'cozinha') {
    return (
      <KitchenView
        tickets={kitchenTickets}
        stations={stations}
        activeStation={activeStation}
        onChangeStation={setActiveStation}
        statusOf={statusDaCozinha}
        onSetStatus={(comandaId, saguoes, status) =>
          void rodar({
            tipo: 'cozinha.status',
            comandaId,
            /* Comanda sem saguão cadastrado cai no balde "Sem saguão", e ele
               também precisa de um nome para virar chave no servidor. */
            saguoes: saguoes.length > 0 ? saguoes : [NO_STATION],
            status,
          })
        }
      />
    );
  }

  if (aba === 'caixa') {
    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <CashRegister
          entries={estado.cashEntries}
          archive={estado.cashArchive}
          courierPaidPerDelivery={courierPaidPerDelivery}
          onUpdatePayments={(id, payments) =>
            void rodar({ tipo: 'caixa.pagamento', lancamentoId: id, payments })
          }
          onCloseRegister={() => void rodar({ tipo: 'caixa.fechar' })}
        />
      </div>
    );
  }

  return (
    <DeliveryView
      orders={estado.deliveries}
      interactive
      onAdvance={(id) => void rodar({ tipo: 'pedido.avancar', pedidoId: id })}
      onRevert={(id) => void rodar({ tipo: 'pedido.voltar', pedidoId: id })}
      onCancel={(id) => void rodar({ tipo: 'pedido.cancelar', pedidoId: id })}
    />
  );
}

/** Soma exportada para a casca mostrar contadores sem recalcular a regra. */
export { sumItems };
