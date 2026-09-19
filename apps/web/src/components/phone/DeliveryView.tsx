import { useMemo, useState } from 'react';
import { demo } from '../../data/content';
import { brl } from '../../lib/format';
import { addressLabel, mapsUrl, paymentCashBalance, whatsappUrl, type DeliveryOrder, type PaymentMethod, type PaymentSplit } from './types';
import { useConfirm } from '../ConfirmModal';
import { Bike, Check, CornerUpLeft, MapPinned, Trash2, UserRoundCog } from 'lucide-react';
import { ConvertToTakeout, type ConvertHandler } from './ConvertToTakeout';

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  pix: 'PIX', cartao: 'Cartão', dinheiro: 'Dinheiro', fiado: 'Fiado',
};

function formatPayments(payments: PaymentSplit): string {
  if (payments.length === 0) return 'Pendente';
  return payments.map(p => `${PAYMENT_LABEL[p.method]} ${brl(p.amount)}${p.method === 'dinheiro' && p.changeFor != null ? ` · troco para ${brl(p.changeFor)}` : ''}`).join(' + ');
}

type Props = {
  onConvert?: ConvertHandler;
  orders: DeliveryOrder[];
  interactive: boolean;
  onAdvance: (id: string) => void;
  onRevert?: (id: string) => void;
  onCancel?: (id: string) => void;
  deliveryPeople?: Array<{ id: string; name: string }>;
  onReassign?: (id: string, employeeId: string) => void;
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
export function DeliveryView({
  orders,
  interactive,
  onAdvance,
  onRevert,
  onCancel,
  deliveryPeople = [],
  onReassign,
  onConvert,
}: Props) {
  const copy = demo.preview;
  const [tab, setTab] = useState<'pending' | 'done'>('pending');
  const { confirm, ConfirmElement } = useConfirm();
  const [search, setSearch] = useState('');
  const [assignmentDraft, setAssignmentDraft] = useState<Record<string, string>>({});

  const pending = useMemo(() => orders.filter((order) => order.isDelivery !== false && order.status !== 'entregue' && order.status !== 'novo'), [orders]);
  const done = useMemo(() => orders.filter((order) => order.isDelivery !== false && order.status === 'entregue'), [orders]);

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
          <span className="phone__section-count">{orders.filter(order => order.isDelivery !== false).length}</span>
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
              {(order.deliveryFee ?? 0) > 0 && order.payments.length > 1 && (
                <p className="mt-2 rounded-xl bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-900 dark:bg-orange-950/40 dark:text-orange-100">
                  Taxa de {brl(order.deliveryFee ?? 0)} incluída na 1ª forma de pagamento ({PAYMENT_LABEL[order.payments[0].method]}).
                </p>
              )}
              {order.payments.some((payment) => payment.method === 'dinheiro' && payment.changeFor != null) && (
                <p className="cash-change-field__total">{paymentCashBalance(order.payments, order.total) < 0
                  ? `Cobrar mais ${brl(-paymentCashBalance(order.payments, order.total))} após a taxa de entrega`
                  : `Troco a levar: ${brl(paymentCashBalance(order.payments, order.total))}`}</p>
              )}

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

              {onReassign && order.status !== 'novo' ? (
                <div className="deliv-owner">
                  <label className="deliv-owner__field">
                    <span><UserRoundCog size={14} aria-hidden="true" /> {order.status === 'aceito' ? 'Entregador designado' : 'Autor da entrega'}</span>
                    <select
                      value={assignmentDraft[order.id] ?? (order.assignedCourierId || order.deliveredById || '')}
                      onChange={(event) => setAssignmentDraft((current) => ({ ...current, [order.id]: event.target.value }))}
                      aria-label={`Entregador responsável pelo pedido ${order.code}`}
                    >
                      <option value="">Selecione o entregador</option>
                      {!deliveryPeople.some((person) => person.id === (order.assignedCourierId || order.deliveredById)) && (order.assignedCourierId || order.deliveredById) && (
                        <option value={order.assignedCourierId || order.deliveredById}>{order.assignedCourierName || order.deliveredByName || 'Funcionário removido'}</option>
                      )}
                      {deliveryPeople.map((person) => (
                        <option key={person.id} value={person.id}>{person.name}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="deliv-owner__button"
                    disabled={!assignmentDraft[order.id] || assignmentDraft[order.id] === (order.assignedCourierId || order.deliveredById)}
                    onClick={() => {
                      const employeeId = assignmentDraft[order.id];
                      if (!employeeId) return;
                      onReassign(order.id, employeeId);
                    }}
                  >
                    {order.status === 'aceito' ? 'Trocar entregador' : 'Corrigir autoria'}
                  </button>
                </div>
              ) : (order.assignedCourierName || order.deliveredByName) ? (
                <p className="deliv-owner__readonly">
                  <UserRoundCog size={13} aria-hidden="true" /> {order.status === 'aceito' ? 'Designado:' : 'Autor:'} <strong>{order.status === 'aceito' ? (order.assignedCourierName || order.deliveredByName) : (order.deliveredByName || order.assignedCourierName)}</strong>
                </p>
              ) : null}

              {onConvert && <ConvertToTakeout order={order} onConvert={onConvert} />}
              <div className="phone__delivery-actions deliv-actions">
                <a className="phone__sheet-btn deliv-action" href={mapsUrl(order.address)} target="_blank" rel="noreferrer">
                  <MapPinned size={16} aria-hidden="true" /> {copy.deliveryMaps}
                </a>
                <button
                  type="button"
                  className={`phone__sheet-btn deliv-action${order.status === 'a_caminho' ? ' is-deliver' : ''}`}
                  onClick={() => onAdvance(order.id)}
                  disabled={!interactive || order.status === 'entregue'}
                >
                  {order.status === 'a_caminho' ? <Check size={16} aria-hidden="true" /> : <Bike size={16} aria-hidden="true" />}
                  {copy.deliveryActions[order.status]}
                </button>
                {order.status !== 'entregue' && onRevert && <button
                  type="button"
                  className="phone__sheet-btn deliv-action"
                  onClick={() => {
                    confirm({
                      title: 'Voltar Pedido',
                      message: 'Voltar pedido para a Recepção? O entregador não verá mais este pedido.',
                      confirmText: 'Voltar',
                      isDestructive: false,
                      onConfirm: () => onRevert(order.id)
                    });
                  }}
                >
                  <CornerUpLeft size={16} aria-hidden="true" /> Para recepção
                </button>}
                {order.status !== 'entregue' && onCancel && <button
                  type="button"
                  className="phone__sheet-btn deliv-action"
                  onClick={() => {
                    confirm({
                      title: 'Excluir Pedido',
                      message: 'Tem certeza que deseja EXCLUIR este pedido permanentemente?',
                      confirmText: 'Excluir',
                      isDestructive: true,
                      onConfirm: () => onCancel(order.id)
                    });
                  }}
                >
                  <Trash2 size={16} aria-hidden="true" /> Excluir
                </button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {ConfirmElement}
    </div>
  );
}
