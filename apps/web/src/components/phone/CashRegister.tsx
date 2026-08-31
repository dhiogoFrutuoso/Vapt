import { useMemo, useState } from 'react';
import { demo } from '../../data/content';
import { brl } from '../../lib/format';
import { MoneyInput } from './MoneyInput';
import type { CashEntry, OrderSource, PaymentMethod, PaymentSplit, PaymentSplitItem } from './types';

type Props = {
  entries: CashEntry[];
  /** Dono marcou que o entregador recebe por entrega (sem salário fixo). */
  courierPaidPerDelivery: boolean;
  onUpdatePayments: (id: string, payments: PaymentSplit) => void;
  onCloseRegister: (total: number) => void;
};

type PeriodValue = '2h' | '6h' | '24h' | 'hoje' | 'tudo';
type TotalOption = 'received' | 'pix' | 'cartao' | 'dinheiro' | 'orders' | 'deliveryFees';

/** Início da janela de tempo escolhida, em ms. */
function periodStart(period: PeriodValue): number {
  const now = Date.now();
  const hour = 60 * 60 * 1000;

  switch (period) {
    case '2h':
      return now - 2 * hour;
    case '6h':
      return now - 6 * hour;
    case '24h':
      return now - 24 * hour;
    case 'hoje': {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return today.getTime();
    }
    default:
      return 0;
  }
}

const SOURCE_LABEL: Record<OrderSource, string> = {
  mesa: 'Mesa',
  retirada: 'Retirada',
  delivery: 'Delivery',
};

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  pix: 'PIX',
  cartao: 'Cartão',
  dinheiro: 'Dinheiro',
};

function formatPayments(payments: PaymentSplit): string {
  if (payments.length === 0) return 'Pendente';
  return payments.map(p => `${PAYMENT_LABEL[p.method]} ${brl(p.amount)}`).join(' + ');
}

/**
 * Fechamento de caixa.
 *
 * Junta mesa, retirada e delivery numa lista só e responde as perguntas que
 * o recepcionista faz no fim do turno: quanto entrou, por qual forma de
 * pagamento, o que ainda está pendente e — quando o entregador é pago por
 * entrega — quanto do valor é taxa de entrega a acertar com ele.
 */
export function CashRegister({ entries, courierPaidPerDelivery, onUpdatePayments, onCloseRegister }: Props) {
  const copy = demo.preview;

  const [period, setPeriod] = useState<PeriodValue>('24h');
  const [source, setSource] = useState<'todos' | OrderSource>('todos');
  const [paymentFilter, setPaymentFilter] = useState<'todos' | PaymentMethod>('todos');
  const [selectedTotalOption, setSelectedTotalOption] = useState<TotalOption>('received');
  const [closedMessage, setClosedMessage] = useState<string | null>(null);

  /* ---- Edit modal ---- */
  const [editingEntry, setEditingEntry] = useState<CashEntry | null>(null);
  const [editSplits, setEditSplits] = useState<PaymentSplitItem[]>([]);

  function openEditModal(entry: CashEntry) {
    setEditingEntry(entry);
    setEditSplits(
      entry.payments.length > 0
        ? entry.payments.map(p => ({ ...p }))
        : [{ method: 'pix', amount: entry.total }]
    );
  }

  function closeEditModal() {
    setEditingEntry(null);
    setEditSplits([]);
  }

  function addEditSplit() {
    const editTotal = editingEntry?.total ?? 0;
    const current = editSplits.reduce((s, p) => s + p.amount, 0);
    const rem = Math.max(0, editTotal - current);
    setEditSplits(prev => [...prev, { method: 'dinheiro', amount: parseFloat(rem.toFixed(2)) }]);
  }

  function removeEditSplit(index: number) {
    setEditSplits(prev => prev.filter((_, i) => i !== index));
  }

  function updateEditSplit(index: number, patch: Partial<PaymentSplitItem>) {
    setEditSplits(prev => prev.map((item, i) => i === index ? { ...item, ...patch } : item));
  }

  function confirmEdit() {
    if (!editingEntry) return;
    onUpdatePayments(editingEntry.id, editSplits);
    closeEditModal();
  }

  const editTotal = editingEntry?.total ?? 0;
  const editSplitsTotal = editSplits.reduce((s, p) => s + p.amount, 0);
  const editRemaining = Math.max(0, editTotal - editSplitsTotal);
  const editIsValid = Math.abs(editRemaining) < 0.01 && editSplits.length > 0 && editSplits.every(p => p.amount > 0);

  /* ---- Filtering ---- */
  const filtered = useMemo(() => {
    const start = periodStart(period);

    return entries
      .filter((entry) => entry.createdAt >= start)
      .filter((entry) => (source === 'todos' ? true : entry.source === source))
      .filter((entry) => {
        if (paymentFilter === 'todos') return true;
        return entry.payments.some(p => p.method === paymentFilter);
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [entries, period, source, paymentFilter]);

  /** Cancelado não entra em nenhum total: não houve dinheiro. */
  const valid = useMemo(() => filtered.filter((entry) => entry.orderStatus !== 'cancelado'), [filtered]);
  const paid = useMemo(() => valid.filter((entry) => entry.paymentStatus === 'concluido'), [valid]);

  const totals = useMemo(() => {
    const byPayment: Record<PaymentMethod, number> = { pix: 0, cartao: 0, dinheiro: 0 };
    let received = 0;
    let orders = 0;
    let deliveryFees = 0;
    let pending = 0;

    for (const entry of valid) {
      if (entry.paymentStatus === 'concluido') {
        received += entry.total;
        orders += entry.total - entry.deliveryFee;
        deliveryFees += entry.deliveryFee;
        for (const p of entry.payments) {
          byPayment[p.method] += p.amount;
        }
      } else {
        pending += entry.total;
      }
    }

    return { received, orders, deliveryFees, pending, byPayment };
  }, [valid]);

  function handleClose() {
    onCloseRegister(totals.received);
    setClosedMessage(copy.cashClosed(brl(totals.received)));
    window.setTimeout(() => setClosedMessage(null), 4000);
  }

  return (
    <div className="phone__body" style={{ position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1, width: '90%', maxWidth: 'none', margin: '0 auto', overflow: 'hidden', padding: 0 }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 24px 24px' }}>
      <p className="phone__role">
        <span aria-hidden="true">💰</span>
        {copy.cashTitle}
      </p>

      <p className="cat-hint">{copy.cashHint}</p>

      {/* ----------------------------- Filtros ----------------------------- */}
      <div className="cash-filters">
        <label className="cash-filter">
          <span>{copy.cashFilterPeriod}</span>
          <select value={period} onChange={(event) => setPeriod(event.target.value as PeriodValue)}>
            {copy.cashPeriods.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="cash-filter">
          <span>{copy.cashFilterSource}</span>
          <select value={source} onChange={(event) => setSource(event.target.value as 'todos' | OrderSource)}>
            <option value="todos">{copy.cashFilterAll}</option>
            {copy.cashSources.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="cash-filter">
          <span>{copy.cashFilterPayment}</span>
          <select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value as 'todos' | PaymentMethod)}>
            <option value="todos">{copy.cashFilterAll}</option>
            {copy.cashPayments.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* --------------------------- Lançamentos --------------------------- */}
      {filtered.length === 0 ? (
        <div className="phone__empty">
          <span>🧾</span>
          <p>{copy.cashEmpty}</p>
        </div>
      ) : (
        <ul className="cash-list">
          {filtered.map((entry) => (
            <li key={entry.id} className={`cash-entry is-${entry.orderStatus}`}>
              <header className="cash-entry__head">
                <span className={`cash-entry__source is-${entry.source}`}>{SOURCE_LABEL[entry.source]}</span>
                <strong>{entry.label}</strong>
                <span className="cash-entry__time">
                  {new Date(entry.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </header>

              <p className="cash-entry__client">{entry.customerName}</p>

              <ul className="cash-entry__items">
                {entry.items.map((item, index) => (
                  <li key={`${item.name}-${index}`}>
                    <span>{item.name}</span>
                    <span>{brl(item.price)}</span>
                  </li>
                ))}
              </ul>

              <div className="cash-entry__values">
                {entry.serviceFee > 0 && (
                  <span>
                    {copy.serviceFee}: <strong>{brl(entry.serviceFee)}</strong>
                  </span>
                )}
                {entry.deliveryFee > 0 && (
                  <span>
                    Entrega: <strong>{brl(entry.deliveryFee)}</strong>
                  </span>
                )}
                <span className="cash-entry__total">{brl(entry.total)}</span>
              </div>

              <div className="cash-entry__status">
                <span className={`cash-badge is-order-${entry.orderStatus}`}>
                  {copy.cashOrderStatus[entry.orderStatus]}
                </span>
                <span className={`cash-badge is-pay-${entry.paymentStatus}`}>
                  {entry.paymentStatus === 'concluido' ? formatPayments(entry.payments) : 'Pagamento pendente'}
                </span>
              </div>

              {/* Botão Editar — sempre disponível para ajustar pagamento */}
              {entry.orderStatus !== 'cancelado' && (
                <button
                  type="button"
                  onClick={() => openEditModal(entry)}
                  style={{
                    marginTop: '8px',
                    padding: '6px 12px',
                    fontSize: '0.8rem',
                    background: 'none',
                    border: '1px solid #94a3b8',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    color: '#64748b',
                    width: '100%',
                  }}
                >
                  ✏️ Editar pagamento
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* ------------------------------ Totais ----------------------------- */}
      </div>

      <section className="cash-totals" style={{ 
        marginTop: 'auto',
        flexShrink: 0,
        zIndex: 50,
        boxShadow: '0 -10px 15px -3px rgba(0, 0, 0, 0.1), 0 -4px 6px -2px rgba(0, 0, 0, 0.05)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h4 style={{ margin: 0 }}>{copy.cashTotals}</h4>
          <select
            value={selectedTotalOption}
            onChange={(e) => setSelectedTotalOption(e.target.value as TotalOption)}
            style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: '#fff', color: '#000', fontSize: '0.85rem' }}
          >
            <option value="received">{copy.cashTotalGeneral}</option>
            <option value="pix">PIX</option>
            <option value="cartao">Cartão</option>
            <option value="dinheiro">Dinheiro</option>
            {courierPaidPerDelivery && (
              <>
                <option value="orders">{copy.cashTotalOrders}</option>
                <option value="deliveryFees">{copy.cashTotalDelivery}</option>
              </>
            )}
          </select>
        </div>

        <div className="cash-totals__grid">
          {selectedTotalOption === 'received' && (
            <div className="cash-total is-main">
              <span>{copy.cashTotalGeneral}</span>
              <strong>{brl(totals.received)}</strong>
            </div>
          )}
          {selectedTotalOption === 'pix' && (
            <div className="cash-total">
              <span>PIX</span>
              <strong>{brl(totals.byPayment.pix)}</strong>
            </div>
          )}
          {selectedTotalOption === 'cartao' && (
            <div className="cash-total">
              <span>Cartão</span>
              <strong>{brl(totals.byPayment.cartao)}</strong>
            </div>
          )}
          {selectedTotalOption === 'dinheiro' && (
            <div className="cash-total">
              <span>Dinheiro</span>
              <strong>{brl(totals.byPayment.dinheiro)}</strong>
            </div>
          )}
          {courierPaidPerDelivery && selectedTotalOption === 'orders' && (
            <div className="cash-total">
              <span>{copy.cashTotalOrders}</span>
              <strong>{brl(totals.orders)}</strong>
            </div>
          )}
          {courierPaidPerDelivery && selectedTotalOption === 'deliveryFees' && (
            <div className="cash-total is-courier">
              <span>{copy.cashTotalDelivery}</span>
              <strong>{brl(totals.deliveryFees)}</strong>
            </div>
          )}
        </div>

        {courierPaidPerDelivery && selectedTotalOption === 'deliveryFees' && <p className="cash-note">🛵 {copy.cashCourierNote}</p>}
        {selectedTotalOption === 'pix' && <p className="cash-note">📱 {copy.cashPixNote}</p>}

        {totals.pending > 0 && (
          <div className="cash-total is-pending">
            <span>{copy.cashTotalPending}</span>
            <strong>{brl(totals.pending)}</strong>
          </div>
        )}

        <button
          type="button"
          className="phone__sheet-btn is-primary is-block"
          onClick={handleClose}
          disabled={paid.length === 0}
        >
          {copy.cashClose} · {brl(totals.received)}
        </button>

        {closedMessage && <p className="phone__flash">{closedMessage}</p>}
      </section>

      {/* ========================= Modal de Edição ========================= */}
      {editingEntry && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.5)',
          }}
          onClick={closeEditModal}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '12px',
              padding: '20px',
              width: '90%',
              maxWidth: '380px',
              maxHeight: '80vh',
              overflowY: 'auto',
              color: '#000',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <strong style={{ fontSize: '1rem' }}>Editar pagamento</strong>
              <button type="button" onClick={closeEditModal} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#666' }}>✕</button>
            </div>

            <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '8px' }}>
              {editingEntry.label} — {editingEntry.customerName}
            </p>
            <p style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '12px' }}>
              Total: {brl(editingEntry.total)}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {editSplits.map((split, index) => (
                <div key={index} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <select
                    value={split.method}
                    onChange={(e) => updateEditSplit(index, { method: e.target.value as PaymentMethod })}
                    style={{ flex: '0 0 auto', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', color: '#000', backgroundColor: '#fff' }}
                  >
                    <option value="pix">PIX</option>
                    <option value="cartao">Cartão</option>
                    <option value="dinheiro">Dinheiro</option>
                  </select>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <span style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#666', fontSize: '0.85rem', pointerEvents: 'none', zIndex: 2 }}>R$</span>
                    <MoneyInput
                      value={split.amount}
                      onChange={(val) => updateEditSplit(index, { amount: val })}
                    />
                  </div>
                  {editSplits.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeEditSplit(index)}
                      style={{ padding: '4px 8px', background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1.1rem' }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}

              {editRemaining > 0.01 && (
                <p style={{ fontSize: '0.8rem', color: '#f59e0b', margin: '4px 0' }}>
                  Falta: {brl(editRemaining)}
                </p>
              )}
              {editSplitsTotal > editTotal + 0.01 && (
                <p style={{ fontSize: '0.8rem', color: '#ef4444', margin: '4px 0' }}>
                  Excede o total em {brl(editSplitsTotal - editTotal)}
                </p>
              )}

              <button
                type="button"
                onClick={addEditSplit}
                style={{ fontSize: '0.8rem', background: 'none', border: '1px dashed #94a3b8', borderRadius: '6px', padding: '8px', cursor: 'pointer', color: '#64748b' }}
              >
                + Adicionar forma de pagamento
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button
                type="button"
                onClick={closeEditModal}
                style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', color: '#334155', fontSize: '0.9rem' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmEdit}
                disabled={!editIsValid}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '8px',
                  border: 'none',
                  background: editIsValid ? 'var(--brand, #f97316)' : '#e2e8f0',
                  color: editIsValid ? '#fff' : '#94a3b8',
                  cursor: editIsValid ? 'pointer' : 'not-allowed',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
