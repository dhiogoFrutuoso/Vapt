import { useMemo, useState, type CSSProperties } from 'react';
import { demo } from '../data/content';
import { MenuView } from './phone/MenuView';
import { CheckoutSheet } from './phone/CheckoutSheet';
import { ServiceView } from './phone/ServiceView';
import { CashRegister } from './phone/CashRegister';
import { OrderSheet, type Ticket } from './phone/OrderSheet';
import { DeliveryView } from './phone/DeliveryView';
import { ReceptionView } from './phone/ReceptionView';
import { IconRenderer } from './IconRenderer';
import { NEXT_STATUS, sumItems } from './phone/types';
import type {
  CashEntry,
  CategoryItem,
  DeliveryAddress,
  DeliveryOrder,
  OrderItem,
  PaymentSplit,
  PreviewProduct,
  PreviewPromotion,
  PreviewTable,
  TableStatus,
  TakeoutOrder,
} from './phone/types';

export type { PreviewProduct, PreviewTable, DeliveryOrder } from './phone/types';

type View = 'menu' | 'salao' | 'entrega' | 'recepcao';
type ReceptionTab = 'pedidos' | 'caixa';

type Props = {
  storeName: string;
  tagline?: string;
  logoUrl?: string | null;
  logoIcon?: string;
  brandColor: string;
  categories?: CategoryItem[];
  products: PreviewProduct[];
  promotions?: PreviewPromotion[];
  tables?: PreviewTable[];
  /** Passar habilita a interação: comanda, checkout e fila de entrega. */
  onTablesChange?: (tables: PreviewTable[]) => void;
  /** Entregas iniciais (vazio por padrão: só entra pedido feito de verdade). */
  initialDeliveries?: DeliveryOrder[];
  /** Taxa de entrega cobrada do cliente, usada no fechamento de caixa. */
  deliveryFee?: number;
  /** Dono marcou que o entregador é pago por entrega (sem salário fixo). */
  courierPaidPerDelivery?: boolean;
  onCloseRegister?: () => Promise<void> | void;
  showRoomTab?: boolean;
  showDeliveryTab?: boolean;
  liveBadge?: boolean;
  code?: string | null;
  theme?: 'claro' | 'escuro';
  waiterCommissionRate?: number;
};

/** Contraste automático: texto branco em cor escura, texto escuro em cor clara. */
function readableText(hex: string) {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return '#ffffff';
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#111827' : '#ffffff';
}

function shortCode() {
  return String(Math.floor(1000 + Math.random() * 8999));
}

/**
 * Simulação do aplicativo VaptApp dentro do painel.
 *
 * Três abas, que são as três faces do produto:
 *   Cliente    -> cardápio + pedido pelo site
 *   Equipe     -> Atendimento (retirada + mesas) e Caixa (fechamento)
 *   Entregador -> fila de entregas, separada entre em andamento e concluídas
 *
 * Tudo que é fechado (mesa, retirada ou entrega) vira um lançamento no caixa —
 * é o que permite o fechamento do turno contar os três canais juntos.
 *
 * É ILUSTRATIVO por decisão de produto: mostra o fluxo, não é a implementação real.
 */
export function EditorPreview({
  storeName,
  tagline,
  logoUrl,
  categories = [],
  logoIcon = 'burger',
  brandColor,
  theme = 'claro',
  products,
  tables = [],
  onTablesChange,
  initialDeliveries = [],
  deliveryFee = 0,
  courierPaidPerDelivery = false,
  showRoomTab = false,
  showDeliveryTab = false,
  liveBadge = false,
  code = null,
  promotions = [],
  onCloseRegister,
  waiterCommissionRate,
}: Props) {
  const [view, setView] = useState<View>(showDeliveryTab ? 'menu' : 'salao');
  const [receptionTab, setReceptionTab] = useState<ReceptionTab>(
    showRoomTab && !showDeliveryTab ? 'caixa' : 'pedidos'
  );

  const [cart, setCart] = useState<OrderItem[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const [openTableId, setOpenTableId] = useState<string | null>(null);
  const [openTakeoutId, setOpenTakeoutId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const [takeouts, setTakeouts] = useState<TakeoutOrder[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryOrder[]>(initialDeliveries);
  const [cashEntries, setCashEntries] = useState<CashEntry[]>([]);

  const interactive = Boolean(onTablesChange);
  const onBrand = readableText(brandColor);
  const style = { '--brand': brandColor, '--on-brand': onBrand } as CSSProperties;

  const openTable = useMemo(() => tables.find((t) => t.id === openTableId) ?? null, [tables, openTableId]);
  const openTakeout = useMemo(
    () => takeouts.find((t) => t.id === openTakeoutId) ?? null,
    [takeouts, openTakeoutId]
  );

  function showFlash(message: string, ms = 2600) {
    setFlash(message);
    window.setTimeout(() => setFlash(null), ms);
  }

  /* ---------------------------- Mesas ----------------------------- */

  function updateTable(id: string, patch: Partial<PreviewTable>) {
    onTablesChange?.(tables.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function handleOpenTable(table: PreviewTable) {
    if (!interactive) return;
    setOpenTakeoutId(null);
    setOpenTableId(table.id);
    // Automático: mesa livre que recebe atenção vira ocupada.
    if (table.status === 'livre') updateTable(table.id, { status: 'ocupada', items: [] });
  }

  /** Troca manual do status, feita pelo seletor do card. */
  function handleSetTableStatus(id: string, status: TableStatus) {
    const table = tables.find((t) => t.id === id);
    if (!table) return;
    // Voltar para livre limpa a comanda: mesa livre com itens não existe.
    updateTable(id, status === 'livre' ? { status, items: [] } : { status });
  }

  /* --------------------------- Retirada ---------------------------- */

  function handleCreateTakeout(customerName: string, phone: string) {
    const takeout: TakeoutOrder = {
      id: `t-${Date.now()}`,
      label: shortCode().slice(0, 2),
      customerName,
      phone: phone || undefined,
      status: 'ocupada',
      items: [],
      createdAt: Date.now(),
    };
    setTakeouts((list) => [takeout, ...list]);
    setOpenTableId(null);
    setOpenTakeoutId(takeout.id);
  }

  function updateTakeout(id: string, patch: Partial<TakeoutOrder>) {
    setTakeouts((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function handleOpenTakeout(takeout: TakeoutOrder) {
    if (!interactive) return;
    setOpenTableId(null);
    setOpenTakeoutId(takeout.id);
  }

  function handleSetTakeoutStatus(id: string, status: TableStatus) {
    updateTakeout(id, status === 'livre' ? { status, items: [] } : { status });
  }

  function handleRemoveTakeout(id: string) {
    setTakeouts((list) => list.filter((t) => t.id !== id));
    if (openTakeoutId === id) setOpenTakeoutId(null);
  }

  /* -------------------- Comanda (mesa ou retirada) ------------------ */

  const ticket: Ticket | null = openTable
    ? {
        id: openTable.id,
        title: `Mesa ${openTable.label}`,
        status: openTable.status,
        items: openTable.items ?? [],
        serviceFeeRate: waiterCommissionRate ?? 0.1,
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

  function handleAddTicketItem(item: OrderItem) {
    if (openTable) {
      updateTable(openTable.id, { items: [...(openTable.items ?? []), item], status: 'ocupada' });
    } else if (openTakeout) {
      updateTakeout(openTakeout.id, { items: [...openTakeout.items, item], status: 'ocupada' });
    }
  }

  function handleRemoveTicketItem(index: number) {
    if (openTable) {
      const items = [...(openTable.items ?? [])];
      items.splice(index, 1);
      updateTable(openTable.id, { items });
    } else if (openTakeout) {
      const items = [...openTakeout.items];
      items.splice(index, 1);
      updateTakeout(openTakeout.id, { items });
    }
  }

  function handleRequestPayment() {
    if (openTable) updateTable(openTable.id, { status: 'pagamento' });
    else if (openTakeout) updateTakeout(openTakeout.id, { status: 'pagamento' });
  }

  /** Fecha a comanda e joga o valor no caixa. */
  function handleConfirmTicketPayment(payments: PaymentSplit) {
    if (!ticket) return;

    const subtotal = sumItems(ticket.items);
    const serviceFee = subtotal * ticket.serviceFeeRate;

    setCashEntries((list) => [
      {
        id: `c-${Date.now()}`,
        source: openTable ? 'mesa' : 'retirada',
        label: ticket.title,
        customerName: openTakeout?.customerName ?? 'Consumo no salão',
        items: ticket.items,
        subtotal,
        serviceFee,
        deliveryFee: 0,
        total: subtotal + serviceFee,
        payments,
        orderStatus: 'feito',
        paymentStatus: 'concluido',
        createdAt: Date.now(),
        closedAt: Date.now(),
      },
      ...list,
    ]);

    if (openTable) updateTable(openTable.id, { status: 'livre', items: [] });
    else if (openTakeout) handleRemoveTakeout(openTakeout.id);

    setOpenTableId(null);
    setOpenTakeoutId(null);
    showFlash(demo.preview.paid);
  }

  /** Cancela sem cobrar: entra no caixa como cancelado, para não sumir do histórico. */
  function handleCancelTicket() {
    if (!ticket) return;

    const subtotal = sumItems(ticket.items);
    if (subtotal > 0) {
      setCashEntries((list) => [
        {
          id: `c-${Date.now()}`,
          source: openTable ? 'mesa' : 'retirada',
          label: ticket.title,
          customerName: openTakeout?.customerName ?? 'Consumo no salão',
          items: ticket.items,
          subtotal,
          serviceFee: 0,
          deliveryFee: 0,
          total: subtotal,
          payments: [],
          orderStatus: 'cancelado',
          paymentStatus: 'pendente',
          createdAt: Date.now(),
          closedAt: Date.now(),
        },
        ...list,
      ]);
    }

    if (openTable) updateTable(openTable.id, { status: 'livre', items: [] });
    else if (openTakeout) handleRemoveTakeout(openTakeout.id);

    setOpenTableId(null);
    setOpenTakeoutId(null);
    showFlash(demo.preview.orderCanceled);
  }

  /* -------------------------- Delivery -------------------------- */

  function handleCheckout(data: {
    customerName: string;
    phone: string;
    payments: PaymentSplit;
    address: DeliveryAddress;
  }) {
    const itemsTotal = sumItems(cart);
    const orderId = `d-${Date.now()}`;
    const displayCode = shortCode();

    const order: DeliveryOrder = {
      id: orderId,
      code: displayCode,
      customerName: data.customerName,
      phone: data.phone,
      items: cart,
      total: itemsTotal + deliveryFee,
      payments: data.payments,
      address: data.address,
      status: 'novo',
      timeLabel: 'agora',
      distanceLabel: data.address.mode === 'gps' ? '1,2 km' : '2,4 km',
    };

    setDeliveries((list) => [order, ...list]);

    /**
     * O CashEntry de delivery só será criado quando a Recepção despachar o pedido
     * (onAccept), não no momento do checkout do cliente.
     */

    setCart([]);
    setCheckoutOpen(false);
    setView('recepcao');
    showFlash(demo.preview.checkoutSuccess, 3200);
  }

  function advanceDelivery(id: string) {
    const order = deliveries.find((o) => o.id === id);
    setDeliveries((list) =>
      list.map((item) => (item.id === id ? { ...item, status: NEXT_STATUS[item.status] } : item))
    );

    // Entrega concluída: o dinheiro/cartão foi recebido na porta do cliente.
    if (order && NEXT_STATUS[order.status] === 'entregue') {
      setCashEntries((list) =>
        list.map((entry) =>
          entry.id === `c-${id}` && entry.paymentStatus === 'pendente'
            ? { ...entry, paymentStatus: 'concluido', closedAt: Date.now() }
            : entry
        )
      );
    }
  }

  /* ---------------------------- Caixa ----------------------------- */

  function handleUpdateCashPayments(id: string, payments: PaymentSplit) {
    setCashEntries((list) =>
      list.map((entry) =>
        entry.id === id ? { ...entry, payments, paymentStatus: 'concluido', closedAt: Date.now() } : entry
      )
    );
  }

  /** Fechar o caixa arquiva o que já foi conferido e recebido. */
  async function handleCloseRegister() {
    setCashEntries((list) => list.filter((entry) => entry.paymentStatus !== 'concluido'));
    if (onCloseRegister) {
      await onCloseRegister();
    }
  }

  /* ---------------------------- Render --------------------------- */

  const occupiedTables = tables.filter((t) => t.status !== 'livre').length;
  const pendingDeliveries = deliveries.filter((order) => order.status !== 'entregue').length;
  const openTickets = takeouts.length + occupiedTables;

  return (
    <div className={`editor-preview theme-${theme}`} style={style}>
      {liveBadge && (
        <span className="phone__live">
          <span className="phone__live-dot" /> Atualizando ao vivo
        </span>
      )}

      <div className="editor-preview__screen">
        <header className="phone__header">
          <div className="phone__brandbar">
            <div className="phone__logo">
              {logoUrl ? <img src={logoUrl} alt={`Logo ${storeName}`} /> : <span><IconRenderer name={logoIcon} /></span>}
            </div>
            <div className="phone__brandtext">
              <strong>{storeName || 'Seu Negócio'}</strong>
              <span>{tagline || 'Sua frase aparece aqui'}</span>
            </div>
          </div>

          <div className="phone__chips">
            {view === 'menu' && (
              <>
                <span className="phone__chip phone__chip--on">Aberto agora</span>
                <span className="phone__chip">Entrega 35 min</span>
                <span className="phone__chip">Retirada</span>
              </>
            )}
            {view === 'salao' && (
              <>
                <span className="phone__chip phone__chip--on">Caixa aberto</span>
                <span className="phone__chip">{openTickets} comandas abertas</span>
              </>
            )}
            

        {view === 'entrega' && (
              <>
                <span className="phone__chip phone__chip--on">Entregador online</span>
                <span className="phone__chip">{pendingDeliveries} na fila</span>
              </>
            )}
          </div>
        </header>

        {view === 'menu' && (
          <div className="phone__content">
            <MenuView
              appName={storeName}
              primaryColor={brandColor}
              logoUrl={logoUrl}
              theme={theme}
              interactive={interactive}
              products={products}
              promotions={promotions}
              categories={categories}
              cart={cart}
              onAddToCart={(p) => setCart([...cart, { name: p.name, price: p.price }])}
              onRemoveFromCart={(name) => {
                const idx = cart.findIndex((i) => i.name === name);
                if (idx !== -1) {
                  const newCart = [...cart];
                  newCart.splice(idx, 1);
                  setCart(newCart);
                }
              }}
              onOpenCheckout={() => setCheckoutOpen(true)}
              isCheckoutOpen={checkoutOpen}
            />
          </div>
        )}

        {view === 'salao' && (
          <ServiceView
            tables={tables}
            takeouts={takeouts}
            interactive={interactive}
            flash={flash}
            onOpenTable={handleOpenTable}
            onOpenTakeout={handleOpenTakeout}
            onCreateTakeout={handleCreateTakeout}
            onSetTableStatus={handleSetTableStatus}
            onSetTakeoutStatus={handleSetTakeoutStatus}
            onCancelTakeout={handleRemoveTakeout}
          />
        )}

        {view === 'recepcao' && (
          <>
            {showRoomTab && showDeliveryTab && (
              <div className="team-tabs" role="tablist" aria-label="Recepção">
                <button
                  type="button"
                  role="tab"
                  aria-selected={receptionTab === 'pedidos'}
                  className={receptionTab === 'pedidos' ? 'is-active' : ''}
                  onClick={() => setReceptionTab('pedidos')}
                >
                  🎧 Pedidos
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={receptionTab === 'caixa'}
                  className={receptionTab === 'caixa' ? 'is-active' : ''}
                  onClick={() => setReceptionTab('caixa')}
                >
                  💰 {demo.preview.teamTabs.cash}
                  {cashEntries.length > 0 && <span className="team-tabs__count">{cashEntries.length}</span>}
                </button>
              </div>
            )}

            {(!showRoomTab || receptionTab === 'pedidos') && showDeliveryTab ? (
              <>
                <ReceptionView 
                  deliveries={deliveries} 
                  onAccept={(id, fee) => {
                    const d = deliveries.find(x => x.id === id);
                    if (d) {
                      const itemsTotal = sumItems(d.items);
                      const totalWithFee = itemsTotal + fee;
                      setDeliveries(list => list.map(x => x.id === id ? { ...x, deliveryFee: fee, total: totalWithFee, status: 'aceito' } : x));
                      setCashEntries(list => [
                        {
                          id: `c-${id}`,
                          source: 'delivery' as const,
                          label: `Entrega #${d.code}`,
                          customerName: d.customerName,
                          items: d.items,
                          subtotal: itemsTotal,
                          serviceFee: 0,
                          deliveryFee: fee,
                          total: totalWithFee,
                          payments: d.payments,
                          orderStatus: 'feito' as const,
                          paymentStatus: d.payments.every(p => p.method === 'pix') ? 'concluido' as const : 'pendente' as const,
                          createdAt: Date.now(),
                          closedAt: d.payments.every(p => p.method === 'pix') ? Date.now() : null,
                        },
                        ...list,
                      ]);
                    }
                    showFlash('Pedido despachado para o entregador!');
                  }} 
                  onReject={(id) => {
                    setDeliveries(list => list.filter(d => d.id !== id));
                  }} 
                />
                {flash && <p className="phone__flash phone__flash--float">{flash}</p>}
              </>
            ) : (
              <CashRegister
                entries={cashEntries}
                courierPaidPerDelivery={courierPaidPerDelivery}
                onUpdatePayments={handleUpdateCashPayments}
                onCloseRegister={handleCloseRegister}
              />
            )}
          </>
        )}

        {view === 'entrega' && (
          <>
            <DeliveryView 
              orders={deliveries} 
              interactive={interactive} 
              onAdvance={advanceDelivery} 
              onRevert={(id) => {
                setDeliveries(list => list.map(d => d.id === id ? { ...d, status: 'novo', total: sumItems(d.items) } : d));
                showFlash('De volta à Recepção!');
              }}
              onCancel={(id) => {
                setDeliveries(list => list.filter(d => d.id !== id));
                showFlash('Pedido excluído!');
              }}
            />
            {flash && <p className="phone__flash phone__flash--float">{flash}</p>}
          </>
        )}

        {view === 'menu' && checkoutOpen && cart.length > 0 && (
          <CheckoutSheet items={cart} onClose={() => setCheckoutOpen(false)} onSubmit={handleCheckout} />
        )}

        {view === 'salao' && ticket && (
          <OrderSheet
            ticket={ticket}
            categories={categories}
            products={products}
            onAddItem={handleAddTicketItem}
            onRemoveItem={handleRemoveTicketItem}
            onRequestPayment={handleRequestPayment}
            onConfirmPayment={handleConfirmTicketPayment}
            onCancelOrder={handleCancelTicket}
            onDismiss={() => {
              setOpenTableId(null);
              setOpenTakeoutId(null);
            }}
          />
        )}

        {code && (
          <div className="phone__code">
            Código do restaurante: <strong>{code}</strong>
          </div>
        )}
      </div>

      <div className="phone__tabs" role="tablist" aria-label="Visões do aplicativo">
        {showDeliveryTab && (
          <button
            type="button"
            role="tab"
            aria-selected={view === 'menu'}
            className={view === 'menu' ? 'is-active' : ''}
            onClick={() => setView('menu')}
          >
            🛵 {demo.preview.tabMenu}
          </button>
        )}
        
        {showRoomTab && (
          <button
            type="button"
            role="tab"
            aria-selected={view === 'salao'}
            className={view === 'salao' ? 'is-active' : ''}
            onClick={() => setView('salao')}
          >
            🪑 {demo.preview.tabRoom}
          </button>
        )}
        
        <button
          type="button"
          role="tab"
          aria-selected={view === 'recepcao'}
          className={view === 'recepcao' ? 'is-active' : ''}
          onClick={() => {
            setView('recepcao');
            if (showRoomTab && !showDeliveryTab) setReceptionTab('caixa');
            else if (!showRoomTab && showDeliveryTab) setReceptionTab('pedidos');
          }}
        >
          {showRoomTab && !showDeliveryTab ? '💰 Caixa' : '🎧 Recepção'}
          {showDeliveryTab && deliveries.filter(d => d.status === 'novo').length > 0 && <span className="phone__tab-dot" aria-hidden="true" />}
        </button>

        {showDeliveryTab && (
          <button
            type="button"
            role="tab"
            aria-selected={view === 'entrega'}
            className={view === 'entrega' ? 'is-active' : ''}
            onClick={() => setView('entrega')}
          >
            🛵 {demo.preview.tabDelivery}
            {deliveries.filter(d => d.status === 'aceito' || d.status === 'a_caminho').length > 0 && <span className="phone__tab-dot" aria-hidden="true" />}
          </button>
        )}
      </div>
    </div>
  );
}
