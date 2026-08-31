import { useMemo, useState } from 'react';
import { demo } from '../../data/content';
import { brl } from '../../lib/format';
import { addressLabel, mapsUrl, whatsappUrl, type DeliveryOrder, type PaymentMethod, type PaymentSplit } from './types';
import { useConfirm } from '../ConfirmModal';

const PAYMENT_LABEL: Record<PaymentMethod, string> = { pix: 'PIX', cartao: 'Cartão', dinheiro: 'Dinheiro' };

function formatPayments(payments: PaymentSplit): string {
  if (payments.length === 0) return 'Pendente';
  return payments.map(p => `${PAYMENT_LABEL[p.method]} ${brl(p.amount)}`).join(' + ');
}

type Props = {
  orders: DeliveryOrder[];
  interactive: boolean;
  onAdvance: (id: string) => void;
  onRevert: (id: string) => void;
  onCancel: (id: string) => void;
};

/** Texto de busca de um pedido: junta tudo que o entregador poderia digitar. */
function searchHaystack(order: DeliveryOrder): string {
  const address = order.address;

  return [
    order.code,
    order.customerName,
    order.phone,
    order.payments.map(p => p.method).join(' '),
    demo.preview.deliveryStatus[order.status],
    order.items.map((item) => item.name).join(' '),
    address.street,
    address.number,
    address.district,
    address.city,
    address.reference,
    address.mode === 'gps' ? 'localizacao gps tempo real' : 'endereco informado',
    String(order.total),
  ]
    .filter(Boolean)
    .join(' ');
}

/** Remove acentos: a busca não pode depender de digitar "José" certinho. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
}

/**
 * Aba "Entregador": a fila de entregas como o entregador vê no app.
 *
 * Duas listas que nunca se misturam — "Em andamento" (aceito, a caminho)
 * e "Concluídas" (entregue) — com busca que varre qualquer informação do pedido:
 * nome, telefone, código, item, endereço, referência, forma de pagamento ou valor.
 */
export function DeliveryView({ orders, interactive, onAdvance, onRevert, onCancel }: Props) {
  const copy = demo.preview;
  const [tab, setTab] = useState<'pending' | 'done'>('pending');
  const { confirm, ConfirmElement } = useConfirm();
  const [search, setSearch] = useState('');

  const pending = useMemo(() => orders.filter((order) => order.status !== 'entregue' && order.status !== 'novo'), [orders]);
  const done = useMemo(() => orders.filter((order) => order.status === 'entregue'), [orders]);

  const visible = useMemo(() => {
    const base = tab === 'pending' ? pending : done;
    const term = normalize(search);
    if (!term) return base;

    // Cada palavra precisa aparecer: "ana pix" acha a Ana que pagou no PIX.
    const words = term.split(/\s+/).filter(Boolean);
    return base.filter((order) => {
      const haystack = normalize(searchHaystack(order));
      return words.every((word) => haystack.includes(word));
    });
  }, [tab, pending, done, search]);

  const emptyMessage = search.trim()
    ? copy.deliverySearchEmpty
    : tab === 'pending'
      ? copy.deliveryPendingEmpty
      : copy.deliveryDoneEmpty;

  return (
    <div className="phone__body">
      <p className="phone__role">
        <span aria-hidden="true">{copy.roleStrip.entrega.icon}</span>
        {copy.roleStrip.entrega.text}
      </p>

      <div className="phone__section-title">
        <span>{copy.deliveryTitle}</span>
        <span className="phone__section-count">{orders.length}</span>
      </div>

      {/* --------------------- Em andamento x Concluídas --------------------- */}
      <div className="deliv-tabs" role="tablist" aria-label="Filtro de entregas">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'pending'}
          className={tab === 'pending' ? 'is-active' : ''}
          onClick={() => setTab('pending')}
        >
          {copy.deliveryTabs.pending}
          <span className="deliv-tabs__count">{pending.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'done'}
          className={tab === 'done' ? 'is-active' : ''}
          onClick={() => setTab('done')}
        >
          {copy.deliveryTabs.done}
          <span className="deliv-tabs__count">{done.length}</span>
        </button>
      </div>

      {/* ------------------------------ Busca ------------------------------- */}
      <div className="deliv-search">
        <span className="deliv-search__icon" aria-hidden="true">
          🔍
        </span>
        <input
          type="search"
          value={search}
          placeholder={copy.deliverySearchPlaceholder}
          onChange={(event) => setSearch(event.target.value)}
          aria-label={copy.deliverySearchPlaceholder}
        />
        {search && (
          <button
            type="button"
            className="deliv-search__clear"
            onClick={() => setSearch('')}
            aria-label="Limpar busca"
          >
            ✕
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="phone__empty">
          <span>🛵</span>
          <p>{emptyMessage}</p>
        </div>
      ) : (
        <ul className="phone__deliveries">
          {visible.map((order) => (
            <li key={order.id} className={`phone__delivery is-${order.status}`}>
              <header>
                <strong>#{order.code}</strong>
                <span className={`phone__delivery-badge is-${order.status}`}>
                  {copy.deliveryStatus[order.status]}
                </span>
              </header>

              <p className="phone__delivery-client">
                {order.customerName} · {order.timeLabel} · {order.distanceLabel}
              </p>

              {order.phone && (
                <a
                  className="phone__delivery-phone"
                  href={whatsappUrl(order.phone) ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                >
                  📞 {order.phone} · {copy.deliveryCall}
                </a>
              )}

              <ul className="phone__delivery-items">
                {order.items.map((item, index) => (
                  <li key={`${item.name}-${index}`}>
                    <span>{item.name}</span>
                    <span>{brl(item.price)}</span>
                  </li>
                ))}
              </ul>

              <div className="phone__delivery-pay">
                <strong>{brl(order.total)}</strong>
                <span>
                  {formatPayments(order.payments)}
                </span>
              </div>

              <div className="phone__delivery-address">
                <span className="phone__delivery-mode">
                  {order.address.mode === 'gps' ? `📡 ${copy.deliveryGps}` : '📮 Endereço informado'}
                </span>
                <strong>{addressLabel(order.address)}</strong>
                {order.address.mode === 'manual' && order.address.district && (
                  <span>
                    {order.address.district} — {order.address.city}
                  </span>
                )}
              </div>

              {order.address.reference && (
                <p className="phone__delivery-reference">
                  <strong>{copy.deliveryReference}:</strong> {order.address.reference}
                </p>
              )}

              <div className="phone__delivery-actions">
                <a className="phone__sheet-btn" href={mapsUrl(order.address)} target="_blank" rel="noreferrer" style={{ backgroundColor: '#e2e8f0', color: '#334155' }}>
                  🗺️ {copy.deliveryMaps}
                </a>
                <button
                  type="button"
                  className="phone__sheet-btn is-primary"
                  onClick={() => onAdvance(order.id)}
                  disabled={!interactive || order.status === 'entregue'}
                >
                  {copy.deliveryActions[order.status]}
                </button>
              </div>
              {order.status !== 'entregue' && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      confirm({
                        title: 'Voltar Pedido',
                        message: 'Voltar pedido para a Recepção? O entregador não verá mais este pedido.',
                        confirmText: 'Voltar',
                        isDestructive: false,
                        onConfirm: () => onRevert(order.id)
                      });
                    }}
                    style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', color: '#475569', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
                  >
                    ↩️ P/ Recepção
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      confirm({
                        title: 'Excluir Pedido',
                        message: 'Tem certeza que deseja EXCLUIR este pedido permanentemente?',
                        confirmText: 'Excluir',
                        isDestructive: true,
                        onConfirm: () => onCancel(order.id)
                      });
                    }}
                    style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #fecaca', backgroundColor: '#fef2f2', color: '#ef4444', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
                  >
                    🗑️ Excluir
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {ConfirmElement}
    </div>
  );
}
