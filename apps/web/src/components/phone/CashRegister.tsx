import { useMemo, useState } from 'react';
import { demo } from '../../data/content';
import { brl } from '../../lib/format';
import { MoneyInput } from './MoneyInput';
import { faturamento } from './types';
import type { CashEntry, OrderSource, PaymentMethod, PaymentSplit, PaymentSplitItem } from './types';

type Props = {
  entries: CashEntry[];
  /** Turnos ja fechados. So a sub-aba "Registro" enxerga. */
  archive?: CashEntry[];
  /** Dono marcou que o entregador recebe por entrega (sem salário fixo). */
  courierPaidPerDelivery: boolean;
  onUpdatePayments: (id: string, payments: PaymentSplit) => void;
  /**
   * Cancelamento de uma venda já fechada.
   *
   * Opcional para o simulador da landing, que não tem servidor por trás — lá
   * o botão simplesmente não aparece.
   */
  onCancelEntry?: (id: string, motivo: string) => void;
  onCloseRegister: (total: number) => void;
};

type PeriodValue = '2h' | '6h' | '24h' | 'hoje' | 'tudo';
type TotalOption = 'received' | 'pix' | 'cartao' | 'dinheiro' | 'orders' | 'deliveryFees';
type CashTab = 'turno' | 'registro';

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

/** Busca tolerante: ignora acento e caixa. */
function normalize(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/** "2026-09-02" no fuso local — formato que o <input type="date"> usa. */
function toDateInput(ms: number): string {
  const date = new Date(ms);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Um lançamento casa com o termo digitado?
 * Procura em nome, telefone, identificação da comanda e valor — o admin
 * digita "ana", "99999", "45" ou "45,90" e acha o mesmo pedido.
 */
function matchesSearch(entry: CashEntry, term: string): boolean {
  const needle = normalize(term).trim();
  if (!needle) return true;

  const digits = needle.replace(/\D/g, '');
  const phoneDigits = (entry.phone ?? '').replace(/\D/g, '');

  const haystack = [
    entry.customerName,
    entry.label,
    entry.phone ?? '',
    SOURCE_LABEL[entry.source],
    brl(entry.total),
    entry.total.toFixed(2),
    entry.total.toFixed(2).replace('.', ','),
  ]
    .map(normalize)
    .join(' | ');

  if (haystack.includes(needle)) return true;
  return digits.length >= 3 && phoneDigits.includes(digits);
}

/**
 * Fechamento de caixa.
 *
 * Duas sub-abas com responsabilidades distintas:
 *   turno    — o que está aberto agora: conciliação e fechamento;
 *   registro — auditoria do que já foi pago, inclusive de turnos anteriores,
 *              com busca livre e extrato por data.
 */
export function CashRegister({
  entries,
  archive = [],
  courierPaidPerDelivery,
  onUpdatePayments,
  onCancelEntry,
  onCloseRegister,
}: Props) {
  const copy = demo.preview;

  const [tab, setTab] = useState<CashTab>('turno');
  const [period, setPeriod] = useState<PeriodValue>('24h');
  const [source, setSource] = useState<'todos' | OrderSource>('todos');
  const [paymentFilter, setPaymentFilter] = useState<'todos' | PaymentMethod>('todos');
  const [selectedTotalOption, setSelectedTotalOption] = useState<TotalOption>('received');
  const [closedMessage, setClosedMessage] = useState<string | null>(null);

  /* ---- Registro: busca livre e extrato por data ---- */
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');

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

  /* ---- Filtros do turno ---- */
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

  /* ---- Registro: histórico de tudo que já foi pago ---- */

  /**
   * Turno atual + turnos arquivados. Um pedido pode existir nos dois lados
   * durante o instante do fechamento, por isso a deduplicação por id.
   */
  const history = useMemo(() => {
    const seen = new Set<string>();

    return [...archive, ...entries]
      .filter((entry) => entry.paymentStatus === 'concluido' && entry.orderStatus !== 'cancelado')
      .filter((entry) => {
        if (seen.has(entry.id)) return false;
        seen.add(entry.id);
        return true;
      })
      .sort((a, b) => (b.closedAt ?? b.createdAt) - (a.closedAt ?? a.createdAt));
  }, [archive, entries]);

  const historyFiltered = useMemo(() => {
    const start = periodStart(period);

    return history
      .filter((entry) => {
        const when = entry.closedAt ?? entry.createdAt;
        // A data escolhida manda: vira o extrato daquele dia e ignora o período.
        if (dateFilter) return toDateInput(when) === dateFilter;
        return when >= start;
      })
      .filter((entry) => (source === 'todos' ? true : entry.source === source))
      .filter((entry) => {
        if (paymentFilter === 'todos') return true;
        return entry.payments.some(p => p.method === paymentFilter);
      })
      .filter((entry) => matchesSearch(entry, search));
  }, [history, period, dateFilter, source, paymentFilter, search]);

  /*
   * O total do Registro PULA os cancelados.
   *
   * Este era o furo: a aba Turno já filtrava, mas aqui o `reduce` somava tudo.
   * Uma venda cancelada continuava aparecendo — o que é certo, para
   * auditoria — e continuava contando no total — o que é errado, porque
   * inflava o faturamento do dia com dinheiro que nunca entrou.
   *
   * A regra mora em `faturamento()`, num lugar só, para nenhuma tela futura
   * reinventar o `reduce` e esquecer o filtro de novo.
   */
  const historyTotal = useMemo(() => faturamento(historyFiltered), [historyFiltered]);

  const hasRegistroFilter = Boolean(search.trim() || dateFilter || source !== 'todos' || paymentFilter !== 'todos');

  function clearRegistroFilters() {
    setSearch('');
    setDateFilter('');
    setSource('todos');
    setPaymentFilter('todos');
  }

  function handleClose() {
    onCloseRegister(totals.received);
    setClosedMessage(copy.cashClosed(brl(totals.received)));
    window.setTimeout(() => setClosedMessage(null), 4000);
  }

  /** Os três selects são os mesmos nas duas sub-abas. */
  const filterControls = (
    <div className="cash-filters">
      <label className="cash-filter">
        <span>{copy.cashFilterPeriod}</span>
        <select
          value={period}
          onChange={(event) => setPeriod(event.target.value as PeriodValue)}
          disabled={tab === 'registro' && Boolean(dateFilter)}
        >
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
  );

  return (
    <div className="phone__body" style={{ position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1, width: '90%', maxWidth: 'none', margin: '0 auto', overflow: 'hidden', padding: 0 }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 24px 24px' }}>
      <p className="phone__role">
        <span aria-hidden="true">💰</span>
        {copy.cashTitle}
      </p>

      {/* --------------------------- Sub-abas --------------------------- */}
      <div className="cash-tabs" role="tablist" aria-label="Seções do caixa">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'turno'}
          className={tab === 'turno' ? 'is-active' : ''}
          onClick={() => setTab('turno')}
        >
          Turno
          {totals.pending > 0 && <span className="cash-tabs__dot" aria-hidden="true" />}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'registro'}
          className={tab === 'registro' ? 'is-active' : ''}
          onClick={() => setTab('registro')}
        >
          Registro
          <span className="cash-tabs__count">{history.length}</span>
        </button>
      </div>

      {tab === 'turno' && (
        <>
          <p className="cat-hint">{copy.cashHint}</p>

          {filterControls}

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

                  {/*
                    Correção de venda JÁ FECHADA.

                    O comércio erra: o cliente pagou PIX e o caixa marcou
                    dinheiro. Sem isto a única saída seria um estorno falso,
                    que suja o histórico mais do que a correção.
                  */}
                  {entry.orderStatus !== 'cancelado' && (
                    <div className="cash-entry__acoes">
                      <button type="button" className="cash-entry__edit" onClick={() => openEditModal(entry)}>
                        ✏️ Editar pagamento
                      </button>

                      {onCancelEntry && (
                        <button
                          type="button"
                          className="cash-entry__cancel"
                          onClick={() => {
                            const motivo = window.prompt(
                              `Cancelar ${entry.label}? A venda continua no Registro, fora do faturamento.\n\nMotivo (opcional):`
                            );
                            /* `null` = fechou o diálogo. String vazia = confirmou
                               sem escrever motivo, e isso é aceitável. */
                            if (motivo === null) return;
                            onCancelEntry(entry.id, motivo);
                          }}
                        >
                          🚫 Cancelar venda
                        </button>
                      )}
                    </div>
                  )}

                  {/* Fantasma: fica visível, marcado, e fora da soma. */}
                  {entry.orderStatus === 'cancelado' && (
                    <p className="cash-entry__fantasma">
                      Venda cancelada — não entra no faturamento.
                      {entry.motivoCancelamento ? ` Motivo: ${entry.motivoCancelamento}` : ''}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {tab === 'registro' && (
        <>
          <p className="cat-hint">
            Histórico de tudo que já foi pago, inclusive de turnos fechados. Busque por cliente, telefone ou valor.
          </p>

          {/* ---------------------- Busca e extrato por data ---------------------- */}
          <div className="cash-search">
            <label className="cash-search__field">
              <span aria-hidden="true">🔎</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cliente, telefone ou valor"
                aria-label="Buscar no registro do caixa"
              />
              {search && (
                <button type="button" className="cash-search__clear" onClick={() => setSearch('')} aria-label="Limpar busca">
                  ✕
                </button>
              )}
            </label>

            <label className="cash-filter cash-search__date">
              <span>Extrato do dia</span>
              <input
                type="date"
                value={dateFilter}
                onChange={(event) => setDateFilter(event.target.value)}
                max={toDateInput(Date.now())}
                aria-label="Extrato de um dia específico"
              />
            </label>
          </div>

          {filterControls}

          {hasRegistroFilter && (
            <button type="button" className="cash-search__reset" onClick={clearRegistroFilters}>
              Limpar filtros
            </button>
          )}

          {historyFiltered.length === 0 ? (
            <div className="phone__empty">
              <span>🗂️</span>
              <p>
                {history.length === 0
                  ? 'Nenhum pedido pago ainda. O registro se enche conforme o caixa recebe.'
                  : 'Nenhum pedido encontrado com esses filtros.'}
              </p>
            </div>
          ) : (
            <ul className="cash-list">
              {historyFiltered.map((entry) => {
                const when = entry.closedAt ?? entry.createdAt;

                return (
                  <li key={entry.id} className="cash-entry is-feito">
                    <header className="cash-entry__head">
                      <span className={`cash-entry__source is-${entry.source}`}>{SOURCE_LABEL[entry.source]}</span>
                      <strong>{entry.label}</strong>
                      <span className="cash-entry__time">
                        {new Date(when).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                        {' · '}
                        {new Date(when).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </header>

                    <p className="cash-entry__client">
                      {entry.customerName}
                      {entry.phone && <span className="cash-entry__phone"> · {entry.phone}</span>}
                    </p>

                    <div className="cash-entry__values">
                      {entry.deliveryFee > 0 && (
                        <span>
                          Entrega: <strong>{brl(entry.deliveryFee)}</strong>
                        </span>
                      )}
                      {entry.serviceFee > 0 && (
                        <span>
                          {copy.serviceFee}: <strong>{brl(entry.serviceFee)}</strong>
                        </span>
                      )}
                      <span className="cash-entry__total">{brl(entry.total)}</span>
                    </div>

                    <div className="cash-entry__status">
                      <span className="cash-badge is-pay-concluido">{formatPayments(entry.payments)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {/* ------------------------------ Totais ----------------------------- */}
      </div>

      {tab === 'turno' && (
        <section className="cash-totals" style={{
          marginTop: 'auto',
          flexShrink: 0,
          zIndex: 50,
          boxShadow: '0 -10px 15px -3px rgba(0, 0, 0, 0.1), 0 -4px 6px -2px rgba(0, 0, 0, 0.05)'
        }}>
          <div className="cash-totals__head">
            <h4>{copy.cashTotals}</h4>
            <select
              value={selectedTotalOption}
              onChange={(e) => setSelectedTotalOption(e.target.value as TotalOption)}
              className="cash-totals__pick"
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
      )}

      {tab === 'registro' && (
        <section className="cash-totals" style={{
          marginTop: 'auto',
          flexShrink: 0,
          zIndex: 50,
          boxShadow: '0 -10px 15px -3px rgba(0, 0, 0, 0.1), 0 -4px 6px -2px rgba(0, 0, 0, 0.05)'
        }}>
          <div className="cash-totals__head">
            <h4>
              {dateFilter
                ? `Extrato de ${new Date(`${dateFilter}T12:00:00`).toLocaleDateString('pt-BR')}`
                : 'Total encontrado'}
            </h4>
          </div>

          <div className="cash-totals__grid">
            <div className="cash-total is-main">
              <span>Somatório</span>
              <strong>{brl(historyTotal)}</strong>
            </div>
            <div className="cash-total">
              <span>Pedidos</span>
              <strong>{historyFiltered.length}</strong>
            </div>
          </div>

          <p className="cash-note">🗂️ Somente leitura — o registro serve para auditoria.</p>
        </section>
      )}

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
