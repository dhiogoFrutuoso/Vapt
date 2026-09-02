import { useMemo, useState, type CSSProperties } from 'react';
import { demo } from '../data/content';
import { MenuView } from './phone/MenuView';
import { CheckoutSheet } from './phone/CheckoutSheet';
import { RoomView } from './phone/RoomView';
import { OrderSheet } from './phone/OrderSheet';
import { DeliveryView } from './phone/DeliveryView';
import { IconRenderer } from './IconRenderer';
import { NEXT_STATUS } from './phone/types';
import type {
  DeliveryAddress,
  DeliveryOrder,
  OrderItem,
  PaymentSplit,
  PreviewProduct,
  PreviewPromotion,
  PreviewTable,
} from './phone/types';

export type { PreviewProduct, PreviewTable, DeliveryOrder } from './phone/types';

type View = 'menu' | 'salao' | 'entrega';

type Props = {
  storeName: string;
  tagline?: string;
  logoUrl?: string | null;
  logoIcon?: string;
  brandColor: string;
  products: PreviewProduct[];
  promotions?: PreviewPromotion[];
  tables?: PreviewTable[];
  /** Passar habilita a interação: comanda, checkout e fila de entrega. */
  onTablesChange?: (tables: PreviewTable[]) => void;
  /** Entregas iniciais (a vitrine do hero usa um exemplo pronto). */
  initialDeliveries?: DeliveryOrder[];
  showRoomTab?: boolean;
  liveBadge?: boolean;
  code?: string | null;
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

function orderCode() {
  return String(Math.floor(1000 + Math.random() * 8999));
}

/**
 * Simulação do aplicativo VaptApp dentro da landing.
 *
 * Três abas, que são as três faces do produto:
 *   Cliente    -> cardápio + pedido pelo site (nome, pagamento, localização)
 *   Equipe     -> mapa de mesas + comanda
 *   Entregador -> fila de entregas com Google Maps
 *
 * É ILUSTRATIVO por decisão de produto: mostra o fluxo, não é a implementação real do app.
 */
export function PhonePreview({
  storeName,
  tagline,
  logoUrl,
  logoIcon = 'burger',
  brandColor,
  products = [],
  promotions = [],
  tables = [],
  onTablesChange,
  initialDeliveries = [],
  showRoomTab = false,
  liveBadge = false,
  code = null,
}: Props) {
  const [view, setView] = useState<View>('menu');

  const [cart, setCart] = useState<OrderItem[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const [openTableId, setOpenTableId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const [deliveries, setDeliveries] = useState<DeliveryOrder[]>(initialDeliveries);

  const interactive = Boolean(onTablesChange);
  const onBrand = readableText(brandColor);
  const style = { '--brand': brandColor, '--on-brand': onBrand } as CSSProperties;

  const openTable = useMemo(() => tables.find((t) => t.id === openTableId) ?? null, [tables, openTableId]);

  /* --------------------------- Salão --------------------------- */

  function updateTable(id: string, patch: Partial<PreviewTable>) {
    onTablesChange?.(tables.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function handleOpenTable(table: PreviewTable) {
    if (!interactive) return;
    setOpenTableId(table.id);
    if (table.status === 'livre') updateTable(table.id, { status: 'ocupada', items: [] });
  }

  function handleAddItemToTable(item: OrderItem) {
    if (!openTable) return;
    updateTable(openTable.id, { items: [...(openTable.items ?? []), item] });
  }

  function handleRemoveItemFromTable(index: number) {
    if (!openTable) return;
    const items = [...(openTable.items ?? [])];
    items.splice(index, 1);
    updateTable(openTable.id, { items });
  }

  /** Passo 1 do fechamento: a mesa vai para "fechando". */
  function handleRequestPayment() {
    if (!openTable) return;
    updateTable(openTable.id, { status: 'pagamento' });
  }

  /** Passo 2: forma de pagamento escolhida, mesa liberada. */
  function handleConfirmPayment() {
    if (!openTable) return;
    updateTable(openTable.id, { status: 'livre', items: [] });
    setFlash(demo.preview.paid);
    setOpenTableId(null);
    window.setTimeout(() => setFlash(null), 2400);
  }

  function handleCancelTableOrder() {
    if (!openTable) return;
    updateTable(openTable.id, { status: 'livre', items: [] });
    setFlash(demo.preview.orderCanceled);
    setOpenTableId(null);
    window.setTimeout(() => setFlash(null), 2400);
  }

  /* -------------------------- Delivery -------------------------- */

  function handleCheckout(data: {
    customerName: string;
    phone: string;
    payments: PaymentSplit;
    address: DeliveryAddress;
  }) {
    const itemsTotal = cart.reduce((sum, item) => sum + item.price, 0);
    const order: DeliveryOrder = {
      id: `d-${Date.now()}`,
      code: orderCode(),
      customerName: data.customerName,
      phone: data.phone,
      items: cart,
      total: itemsTotal + 5,
      payments: data.payments,
      address: data.address,
      status: 'novo',
      timeLabel: 'agora',
      distanceLabel: data.address.mode === 'gps' ? '1,2 km' : '2,4 km',
    };

    setDeliveries((list) => [order, ...list]);
    setCart([]);
    setCheckoutOpen(false);
    setView('entrega');
    setFlash(demo.preview.checkoutSuccess);
    window.setTimeout(() => setFlash(null), 3200);
  }

  function advanceDelivery(id: string) {
    setDeliveries((list) =>
      list.map((order) => (order.id === id ? { ...order, status: NEXT_STATUS[order.status] } : order))
    );
  }

  /* ---------------------------- Render --------------------------- */

  const occupiedTables = tables.filter((t) => t.status !== 'livre').length;
  const pendingDeliveries = deliveries.filter((order) => order.status !== 'entregue').length;

  return (
    <div className="phone" style={style}>
      {liveBadge && (
        <span className="phone__live">
          <span className="phone__live-dot" /> Atualizando ao vivo
        </span>
      )}

      <div className="phone__frame">
        <div className="phone__notch" />
        <div className="phone__screen">
          <header className="phone__header">
            <div className="phone__status">
              <span>9:41</span>
              <span className="phone__status-icons">▮▮▮ ▲ ▰</span>
            </div>

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
                  <span className="phone__chip">
                    {occupiedTables}/{tables.length} ocupadas
                  </span>
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
            <MenuView
              products={products}
              promotions={promotions}
              cart={cart}
              interactive={interactive}
              onAddToCart={(product, qty = 1) => setCart((list) => [...list, { name: product.name, price: product.price * qty, quantity: qty, pricingType: product.pricingType }])}
              onRemoveFromCart={(name) =>
                setCart((list) => {
                  const index = list.findIndex((item) => item.name === name);
                  if (index === -1) return list;
                  const next = [...list];
                  next.splice(index, 1);
                  return next;
                })
              }
              onOpenCheckout={() => setCheckoutOpen(true)}
              isCheckoutOpen={checkoutOpen}
            />
          )}

          {view === 'salao' && (
            <RoomView
              tables={tables}
              interactive={interactive}
              flash={flash}
              hasOpenTable={Boolean(openTable)}
              onOpenTable={handleOpenTable}
            />
          )}

          {view === 'entrega' && (
            <>
              <DeliveryView 
            orders={deliveries} 
            interactive={interactive} 
            onAdvance={advanceDelivery} 
            onRevert={() => {}} 
            onCancel={() => {}} 
          />
              {flash && <p className="phone__flash phone__flash--float">{flash}</p>}
            </>
          )}

          {view === 'menu' && checkoutOpen && cart.length > 0 && (
            <CheckoutSheet items={cart} onClose={() => setCheckoutOpen(false)} onSubmit={handleCheckout} />
          )}

          {view === 'salao' && openTable && (
            <OrderSheet
              ticket={{
                id: openTable.id,
                title: `Mesa ${openTable.label}`,
                status: openTable.status,
                items: openTable.items ?? [],
                serviceFeeRate: waiterCommissionRate ?? 0.1,
              }}
              products={products}
              promotions={promotions}
              onAddItem={handleAddItemToTable}
              onRemoveItem={handleRemoveItemFromTable}
              onRequestPayment={handleRequestPayment}
              onConfirmPayment={handleConfirmPayment}
              onCancelOrder={handleCancelTableOrder}
              onDismiss={() => setOpenTableId(null)}
            />
          )}

          {code && (
            <div className="phone__code">
              Código do restaurante: <strong>{code}</strong>
            </div>
          )}
        </div>
      </div>

      {showRoomTab && (
        <div className="phone__tabs" role="tablist" aria-label="Visões do aplicativo">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'menu'}
            className={view === 'menu' ? 'is-active' : ''}
            onClick={() => setView('menu')}
          >
            🛵 {demo.preview.tabMenu}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'salao'}
            className={view === 'salao' ? 'is-active' : ''}
            onClick={() => setView('salao')}
          >
            🪑 {demo.preview.tabRoom}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'entrega'}
            className={view === 'entrega' ? 'is-active' : ''}
            onClick={() => setView('entrega')}
          >
            🛵 {demo.preview.tabDelivery}
            {pendingDeliveries > 0 && <span className="phone__tab-dot" aria-hidden="true" />}
          </button>
        </div>
      )}
    </div>
  );
}
