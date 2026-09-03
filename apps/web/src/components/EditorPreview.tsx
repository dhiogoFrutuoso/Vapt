import { useMemo, useState, type CSSProperties } from 'react';
import { Bike, ChefHat, ConciergeBell, User, UtensilsCrossed, Wallet } from 'lucide-react';
import { demo } from '../data/content';
import { MenuView } from './phone/MenuView';
import { CheckoutSheet } from './phone/CheckoutSheet';
import { ServiceView } from './phone/ServiceView';
import { CashRegister } from './phone/CashRegister';
import { OrderSheet, type Ticket } from './phone/OrderSheet';
import { DeliveryView } from './phone/DeliveryView';
import { ReceptionView } from './phone/ReceptionView';
import { KitchenView } from './phone/KitchenView';
import { IconRenderer } from './IconRenderer';
import { NEXT_STATUS, sumItems } from './phone/types';
import type {
  CashEntry,
  CategoryItem,
  DeliveryAddress,
  DeliveryOrder,
  KitchenStatus,
  KitchenTicket,
  OrderItem,
  PaymentSplit,
  PreviewProduct,
  PreviewPromotion,
  PreviewTable,
  TableStatus,
  TakeoutOrder,
} from './phone/types';

export type { PreviewProduct, PreviewTable, DeliveryOrder } from './phone/types';

/**
 * Separacao de responsabilidades das abas:
 *   menu      -> cliente monta o pedido
 *   recepcao  -> logistica: define a taxa e despacha para o entregador
 *   salao     -> mesas e retiradas no balcao
 *   cozinha   -> producao: KDS com as pracas de preparo (saguoes)
 *   caixa     -> exclusivamente financeiro (fechamento e conciliacao)
 *   entrega   -> visao do entregador
 */
type View = 'menu' | 'recepcao' | 'salao' | 'cozinha' | 'entrega' | 'caixa';

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
  onTablesChange?: (tables: PreviewTable[]) => void;
  initialDeliveries?: DeliveryOrder[];
  deliveryFee?: number;
  courierPaidPerDelivery?: boolean;
  onCloseRegister?: () => Promise<void> | void;
  /** Saguoes cadastrados pelo dono, na ordem do cadastro. */
  stations?: string[];
  showRoomTab?: boolean;
  showDeliveryTab?: boolean;
  liveBadge?: boolean;
  code?: string | null;
  theme?: 'claro' | 'escuro';
  waiterCommissionRate?: number;
};

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
  stations = [],
  showRoomTab = false,
  showDeliveryTab = false,
  liveBadge = false,
  code = null,
  promotions = [],
  onCloseRegister,
  waiterCommissionRate,
}: Props) {
  const [view, setView] = useState<View>(showDeliveryTab ? 'menu' : 'salao');

  const [cart, setCart] = useState<OrderItem[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const [openTableId, setOpenTableId] = useState<string | null>(null);
  const [openTakeoutId, setOpenTakeoutId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const [takeouts, setTakeouts] = useState<TakeoutOrder[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryOrder[]>(initialDeliveries);
  const [cashEntries, setCashEntries] = useState<CashEntry[]>([]);
  /** Turnos ja fechados. Alimenta a sub-aba "Registro" do Caixa. */
  const [cashArchive, setCashArchive] = useState<CashEntry[]>([]);

  /** Cozinha: praca selecionada e status por "comandaId::saguao". */
  const [activeStation, setActiveStation] = useState('todos');
  const [kitchenStatus, setKitchenStatus] = useState<Record<string, KitchenStatus>>({});

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

  function updateTable(id: string, patch: Partial<PreviewTable>) {
    onTablesChange?.(tables.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function handleOpenTable(table: PreviewTable) {
    if (!interactive) return;
    setOpenTakeoutId(null);
    setOpenTableId(table.id);
    if (table.status === 'livre') updateTable(table.id, { status: 'ocupada', items: [] });
  }

  function handleSetTableStatus(id: string, status: TableStatus) {
    const table = tables.find((t) => t.id === id);
    if (!table) return;
    updateTable(id, status === 'livre' ? { status, items: [] } : { status });
  }

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
        phone: openTakeout?.phone,
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
          phone: openTakeout?.phone,
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
    setCart([]);
    setCheckoutOpen(false);
    // O pedido novo cai na Recepcao, nao mais no Caixa.
    setView('recepcao');
    showFlash(demo.preview.checkoutSuccess, 3200);
  }

  /**
   * Despacho: a Recepcao define a taxa daquele pedido, manda para a fila
   * do entregador e so entao o lancamento aparece no Caixa.
   */
  function handleAcceptDelivery(id: string, fee: number) {
    const order = deliveries.find((item) => item.id === id);

    if (order) {
      const itemsTotal = sumItems(order.items);
      const totalWithFee = itemsTotal + fee;
      const paidUpfront = order.payments.length > 0 && order.payments.every((p) => p.method === 'pix');

      setDeliveries((list) =>
        list.map((item) =>
          item.id === id ? { ...item, deliveryFee: fee, total: totalWithFee, status: 'aceito' } : item
        )
      );

      setCashEntries((list) => [
        {
          id: `c-${id}`,
          source: 'delivery',
          label: `Entrega #${order.code}`,
          customerName: order.customerName,
          phone: order.phone,
          items: order.items,
          subtotal: itemsTotal,
          serviceFee: 0,
          deliveryFee: fee,
          total: totalWithFee,
          payments: order.payments,
          orderStatus: 'feito',
          paymentStatus: paidUpfront ? 'concluido' : 'pendente',
          createdAt: Date.now(),
          closedAt: paidUpfront ? Date.now() : null,
        },
        ...list,
      ]);
    }

    showFlash('Pedido despachado para o entregador!');
  }

  function handleRejectDelivery(id: string) {
    setDeliveries((list) => list.filter((order) => order.id !== id));
  }

  function advanceDelivery(id: string) {
    const order = deliveries.find((o) => o.id === id);
    setDeliveries((list) =>
      list.map((item) => (item.id === id ? { ...item, status: NEXT_STATUS[item.status] } : item))
    );

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

  function handleUpdateCashPayments(id: string, payments: PaymentSplit) {
    setCashEntries((list) =>
      list.map((entry) =>
        entry.id === id ? { ...entry, payments, paymentStatus: 'concluido', closedAt: Date.now() } : entry
      )
    );
  }

  async function handleCloseRegister() {
    setCashEntries((list) => {
      const closed = list.filter((entry) => entry.paymentStatus === 'concluido');
      // O turno sai da tela, mas continua auditavel no Registro.
      if (closed.length > 0) setCashArchive((archive) => [...closed, ...archive]);
      return list.filter((entry) => entry.paymentStatus !== 'concluido');
    });

    if (onCloseRegister) {
      await onCloseRegister();
    }
  }

  /**
   * A cozinha nao tem estado proprio de pedidos: ela le mesa, retirada e
   * delivery e monta a fila de producao. Assim nada precisa ser
   * sincronizado — o que existe no salao existe na cozinha.
   */
  const kitchenTickets = useMemo<KitchenTicket[]>(() => {
    const list: KitchenTicket[] = [];

    for (const table of tables) {
      const items = table.items ?? [];
      if (table.status === 'livre' || items.length === 0) continue;
      list.push({
        id: `k-mesa-${table.id}`,
        origin: 'mesa',
        label: `Mesa ${table.label}`,
        customerName: `Mesa ${table.label}`,
        items,
        createdAt: 0,
      });
    }

    for (const takeout of takeouts) {
      if (takeout.items.length === 0) continue;
      list.push({
        id: `k-retirada-${takeout.id}`,
        origin: 'retirada',
        label: `Retirada #${takeout.label}`,
        customerName: takeout.customerName,
        items: takeout.items,
        createdAt: takeout.createdAt,
      });
    }

    for (const order of deliveries) {
      // Entregue ja saiu da cozinha; o resto ainda interessa a producao.
      if (order.status === 'entregue' || order.items.length === 0) continue;
      list.push({
        id: `k-delivery-${order.id}`,
        origin: 'delivery',
        label: `Entrega #${order.code}`,
        customerName: order.customerName,
        items: order.items,
        createdAt: 0,
      });
    }

    return list;
  }, [tables, takeouts, deliveries]);

  function kitchenStatusOf(ticketId: string, station: string): KitchenStatus {
    return kitchenStatus[`${ticketId}::${station}`] ?? 'recebido';
  }

  function handleSetKitchenStatus(ticketId: string, stationList: string[], status: KitchenStatus) {
    setKitchenStatus((current) => {
      const next = { ...current };
      for (const station of stationList) next[`${ticketId}::${station}`] = status;
      return next;
    });
  }

  const occupiedTables = tables.filter((t) => t.status !== 'livre').length;
  const pendingDeliveries = deliveries.filter((order) => order.status !== 'entregue').length;
  const openTickets = takeouts.length + occupiedTables;
  const newOrders = deliveries.filter((d) => d.status === 'novo').length;
  const kitchenPending = kitchenTickets.filter((ticket) =>
    ticket.items.some((item) => kitchenStatusOf(ticket.id, (item.station || 'Sem saguão')) !== 'pronto')
  ).length;
  const courierQueue = deliveries.filter((d) => d.status === 'aceito' || d.status === 'a_caminho').length;

  return (
    <div className={`editor-preview theme-${theme}`} style={style}>
      {liveBadge && (
        <span className="phone__live">
          <span className="phone__live-dot" /> Ao vivo
        </span>
      )}

      <div className="editor-preview__screen">
        <header className="phone__header">
          <div className="phone__brandbar">
            <div className="phone__logo">
              {logoUrl ? (
                <img src={logoUrl} alt={`Logo ${storeName}`} />
              ) : (
                <span>
                  <IconRenderer name={logoIcon} />
                </span>
              )}
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
            {view === 'recepcao' && (
              <>
                <span className="phone__chip phone__chip--on">Recepção ativa</span>
                <span className="phone__chip">{newOrders} para despachar</span>
              </>
            )}
            {view === 'salao' && (
              <>
                <span className="phone__chip phone__chip--on">Caixa aberto</span>
                <span className="phone__chip">{openTickets} comandas abertas</span>
              </>
            )}
            {view === 'cozinha' && (
              <>
                <span className="phone__chip phone__chip--on">Cozinha ativa</span>
                <span className="phone__chip">{kitchenTickets.length} em produção</span>
              </>
            )}
            {view === 'caixa' && (
              <>
                <span className="phone__chip phone__chip--on">Turno ativo</span>
                <span className="phone__chip">{cashEntries.length} lançamentos</span>
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
          <div className="phone__content" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
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
              onAddToCart={(p) =>
                setCart([...cart, { name: p.name, price: p.price, station: p.station, isPromo: p.isPromo }])
              }
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

        {view === 'recepcao' && (
          <>
            <ReceptionView
              deliveries={deliveries}
              defaultFee={deliveryFee}
              onAccept={handleAcceptDelivery}
              onReject={handleRejectDelivery}
            />
            {flash && <p className="phone__flash phone__flash--float">{flash}</p>}
          </>
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

        {view === 'cozinha' && (
          <>
            <KitchenView
              tickets={kitchenTickets}
              stations={stations}
              activeStation={activeStation}
              onChangeStation={setActiveStation}
              statusOf={kitchenStatusOf}
              onSetStatus={handleSetKitchenStatus}
            />
            {flash && <p className="phone__flash phone__flash--float">{flash}</p>}
          </>
        )}

        {view === 'caixa' && (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <CashRegister
              entries={cashEntries}
              archive={cashArchive}
              courierPaidPerDelivery={courierPaidPerDelivery}
              onUpdatePayments={handleUpdateCashPayments}
              onCloseRegister={handleCloseRegister}
            />
            {flash && <p className="phone__flash phone__flash--float">{flash}</p>}
          </div>
        )}

        {view === 'entrega' && (
          <>
            <DeliveryView
              orders={deliveries}
              interactive={interactive}
              onAdvance={advanceDelivery}
              onRevert={(id) => {
                setDeliveries((list) =>
                  list.map((d) => (d.id === id ? { ...d, status: 'novo', total: sumItems(d.items) } : d))
                );
                showFlash('De volta à recepção!');
              }}
              onCancel={(id) => {
                setDeliveries((list) => list.filter((d) => d.id !== id));
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
            <User size={14} /> Cliente
          </button>
        )}

        {showDeliveryTab && (
          <button
            type="button"
            role="tab"
            aria-selected={view === 'recepcao'}
            className={view === 'recepcao' ? 'is-active' : ''}
            onClick={() => setView('recepcao')}
          >
            <ConciergeBell size={14} /> Recepção
            {newOrders > 0 && <span className="phone__tab-dot" aria-hidden="true" />}
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
            <UtensilsCrossed size={14} /> Salão
          </button>
        )}

        <button
          type="button"
          role="tab"
          aria-selected={view === 'cozinha'}
          className={view === 'cozinha' ? 'is-active' : ''}
          onClick={() => setView('cozinha')}
        >
          <ChefHat size={14} /> Cozinha
          {kitchenPending > 0 && <span className="phone__tab-dot" aria-hidden="true" />}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={view === 'caixa'}
          className={view === 'caixa' ? 'is-active' : ''}
          onClick={() => setView('caixa')}
        >
          <Wallet size={14} /> Caixa
        </button>

        {showDeliveryTab && (
          <button
            type="button"
            role="tab"
            aria-selected={view === 'entrega'}
            className={view === 'entrega' ? 'is-active' : ''}
            onClick={() => setView('entrega')}
          >
            <Bike size={14} /> Entregador
            {courierQueue > 0 && <span className="phone__tab-dot" aria-hidden="true" />}
          </button>
        )}
      </div>
    </div>
  );
}
