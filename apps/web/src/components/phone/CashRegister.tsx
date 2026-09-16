import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { demo } from '../../data/content';
import { brl } from '../../lib/format';
import { MoneyInput } from './MoneyInput';
import { faturamento } from './types';
import { addressLabel, type CashEntry, type CashMovement, type OrderItem, type OrderSource, type PaymentMethod, type PaymentSplit, type PaymentSplitItem } from './types';
import { ArrowUpFromLine, ClipboardCopy, FolderOpen, HandCoins, Printer, RotateCcw, X, XCircle } from 'lucide-react';
import { useConfirm } from '../ConfirmModal';
import { formatReceiptText, PrintTicket, type PrintTicketProps } from './PrintTicket';
import { printReceipt } from '../../lib/printReceipt';

type Props = {
  entries: CashEntry[];
  /** Turnos ja fechados. So a sub-aba "Registro" enxerga. */
  archive?: CashEntry[];
  /** Dono marcou que o entregador recebe por entrega (sem salário fixo). */
  courierPaidPerDelivery: boolean;
  onUpdatePayments: (id: string, payments: PaymentSplit) => void;
  onEditEntry?: (id: string, data: { payments: PaymentSplit; items: OrderItem[]; deliveryFee: number }) => void;
  /**
   * Cancelamento de uma venda já fechada.
   *
   * Opcional para o simulador da landing, que não tem servidor por trás — lá
   * o botão simplesmente não aparece.
   */
  onCancelEntry?: (id: string, motivo: string) => void;
  movements?: CashMovement[];
  onCashMovement?: (type: 'sangria', amount: number, reason: string) => void;
  /** Abre o pedido de delivery na aba Cliente para incluir itens do cardápio. */
  onEditDeliveryItems?: (entry: CashEntry) => void;
  onCreditPayment?: (id: string, amount: number) => void;
  onReopenEntry?: (id: string) => void;
  onCloseRegister: (counted: { dinheiro: number; cartao: number; pix: number }) => void;
  storeName?: string;
  storePhone?: string;
  operatorName?: string;
};

type PeriodValue = '2h' | '6h' | '24h' | 'hoje' | 'tudo';
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
  fiado: 'Fiado',
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
    entry.deliveredByName ?? '',
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
  onUpdatePayments,
  onEditEntry,
  onCancelEntry,
  movements = [],
  onCashMovement,
  onCreditPayment,
  onReopenEntry,
  onCloseRegister,
  onEditDeliveryItems,
  storeName = 'Vapt',
  storePhone,
  operatorName,
}: Props) {
  const copy = demo.preview;

  const [tab, setTab] = useState<CashTab>('turno');
  const [period, setPeriod] = useState<PeriodValue>('24h');
  const [source, setSource] = useState<'todos' | OrderSource>('todos');
  const [paymentFilter, setPaymentFilter] = useState<'todos' | PaymentMethod>('todos');
  const [courierFilter, setCourierFilter] = useState('todos');
  const [closedMessage, setClosedMessage] = useState<string | null>(null);
  const { confirm, ConfirmElement } = useConfirm();
  const [actionModal, setActionModal] = useState<'sangria' | 'fechar' | 'cancelar' | 'fiado' | null>(null);
  const [actionEntry, setActionEntry] = useState<CashEntry | null>(null);
  const [actionAmount, setActionAmount] = useState(0);
  const [actionReason, setActionReason] = useState('');
  const [counted, setCounted] = useState({ dinheiro: 0, cartao: 0, pix: 0 });

  /* ---- Registro: busca livre e extrato por data ---- */
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  /* ---- Edit modal ---- */
  const [editingEntry, setEditingEntry] = useState<CashEntry | null>(null);
  const [editSplits, setEditSplits] = useState<PaymentSplitItem[]>([]);
  const [editItems, setEditItems] = useState<OrderItem[]>([]);
  const [editDeliveryFee, setEditDeliveryFee] = useState(0);

  function openEditModal(entry: CashEntry) {
    setEditingEntry(entry);
    setEditSplits(
      entry.payments.length > 0
        ? entry.payments.map(p => ({ ...p }))
        : [{ method: 'pix', amount: entry.total }]
    );
    setEditItems(entry.items.map((item) => ({ ...item })));
    setEditDeliveryFee(entry.deliveryFee ?? 0);
  }

  function closeEditModal() {
    setEditingEntry(null);
    setEditSplits([]);
    setEditItems([]);
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
    const save = () => {
      if (onEditEntry) {
        onEditEntry(editingEntry.id, { payments: editSplits, items: editItems, deliveryFee: editDeliveryFee });
      } else onUpdatePayments(editingEntry.id, editSplits);
      closeEditModal();
    };
    if (editSplits.some((split) => split.method === 'fiado')) {
      confirm({
        title: 'Confirmar venda fiada',
        message: 'O valor ficará em aberto no nome do cliente e será registrado na auditoria.',
        confirmText: 'Registrar fiado',
        isDestructive: true,
        onConfirm: save,
      });
    } else save();
  }

  const editTotal = editingEntry
    ? editItems.reduce((sum, item) => sum + item.price, 0) + editingEntry.serviceFee + editDeliveryFee
    : 0;
  const editSplitsTotal = editSplits.reduce((s, p) => s + p.amount, 0);
  const editRemaining = Math.max(0, editTotal - editSplitsTotal);
  const editIsValid = editRemaining < 0.01 && editSplits.length > 0 && editSplits.every(p => p.amount > 0);

  const editingReceipt: PrintTicketProps | null = editingEntry ? {
    storeName,
    storePhone,
    label: editingEntry.label,
    origin: editingEntry.source,
    customerName: editingEntry.customerName || 'Cliente',
    phone: editingEntry.phone,
    address: editingEntry.address
      ? [addressLabel(editingEntry.address), editingEntry.address.district, editingEntry.address.city].filter(Boolean).join(' · ')
      : undefined,
    addressReference: editingEntry.address?.reference,
    notes: editingEntry.notes,
    items: editItems,
    subtotal: editItems.reduce((sum, item) => sum + item.price, 0),
    serviceFee: editingEntry.serviceFee,
    deliveryFee: editDeliveryFee,
    payments: editSplits,
    createdAt: editingEntry.createdAt,
    operatorName,
    width: 80,
  } : null;

  async function copyEditingReceipt() {
    if (!editingReceipt) return;
    try {
      const content = formatReceiptText(editingReceipt);
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(content);
      else {
        const field = document.createElement('textarea');
        field.value = content;
        field.style.position = 'fixed';
        field.style.opacity = '0';
        document.body.appendChild(field);
        field.select();
        const copied = document.execCommand('copy');
        field.remove();
        if (!copied) throw new Error('Cópia bloqueada.');
      }
      toast.success('Comanda copiada com a mesma formatação da impressão.');
    } catch {
      toast.error('Não foi possível copiar a comanda neste dispositivo.');
    }
  }

  async function printEditingReceipt() {
    try {
      await printReceipt();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível imprimir a comanda.');
    }
  }

  const couriers = useMemo(() => {
    const unique = new Map<string, string>();
    for (const entry of [...entries, ...archive]) {
      if (entry.source === 'delivery' && entry.deliveredById) {
        unique.set(entry.deliveredById, entry.deliveredByName || 'Entregador removido');
      }
    }
    return Array.from(unique, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [entries, archive]);

  /* ---- Filtros do turno ---- */
  const filtered = useMemo(() => {
    const start = periodStart(period);

    return entries
      .filter((entry) => entry.createdAt >= start)
      .filter((entry) => (source === 'todos' ? true : entry.source === source))
      .filter((entry) => courierFilter === 'todos' || (entry.source === 'delivery' && entry.deliveredById === courierFilter))
      .filter((entry) => {
        if (paymentFilter === 'todos') return true;
        return entry.payments.some(p => p.method === paymentFilter);
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [entries, period, source, courierFilter, paymentFilter]);

  /** Cancelado não entra em nenhum total: não houve dinheiro. */
  const valid = useMemo(() => filtered.filter((entry) => entry.orderStatus !== 'cancelado'), [filtered]);
  const paid = useMemo(() => valid.filter((entry) => entry.paymentStatus === 'concluido'), [valid]);

  const totals = useMemo(() => {
    const byPayment: Record<PaymentMethod, number> = { pix: 0, cartao: 0, dinheiro: 0, fiado: 0 };
    let received = 0;
    let orders = 0;
    let deliveryFees = 0;
    let pending = 0;

    for (const entry of valid) {
      if (entry.paymentStatus === 'concluido') {
        const recebido = entry.payments
          .filter((payment) => payment.method !== 'fiado')
          .reduce((sum, payment) => sum + payment.amount, 0);
        received += recebido;
        orders += Math.max(0, recebido - entry.deliveryFee);
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
      .filter((entry) => entry.paymentStatus === 'concluido' || entry.orderStatus === 'cancelado')
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
      .filter((entry) => courierFilter === 'todos' || (entry.source === 'delivery' && entry.deliveredById === courierFilter))
      .filter((entry) => {
        if (paymentFilter === 'todos') return true;
        return entry.payments.some(p => p.method === paymentFilter);
      })
      .filter((entry) => matchesSearch(entry, search));
  }, [history, period, dateFilter, source, courierFilter, paymentFilter, search]);

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

  const hasRegistroFilter = Boolean(search.trim() || dateFilter || source !== 'todos' || courierFilter !== 'todos' || paymentFilter !== 'todos');

  function clearRegistroFilters() {
    setSearch('');
    setDateFilter('');
    setSource('todos');
    setCourierFilter('todos');
    setPaymentFilter('todos');
  }

  function handleClose() {
    setCounted({ dinheiro: 0, cartao: 0, pix: 0 });
    setActionModal('fechar');
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

      {couriers.length > 0 && (
        <label className="cash-filter">
          <span>Entregador</span>
          <select
            value={courierFilter}
            onChange={(event) => {
              const next = event.target.value;
              setCourierFilter(next);
              if (next !== 'todos') setSource('delivery');
            }}
          >
            <option value="todos">Todos os entregadores</option>
            {couriers.map((courier) => (
              <option key={courier.id} value={courier.id}>{courier.name}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );

  return (
    <div className="phone__body cash-shell">
      <div className="cash-scroll">
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

          <section className="cash-overview" aria-label="Resumo do turno">
            <div className="is-primary"><span>Recebido</span><strong>{brl(totals.received)}</strong></div>
            <div><span>Pendente</span><strong>{brl(totals.pending)}</strong></div>
            <div><span>Taxas de entrega</span><strong>{brl(totals.deliveryFees)}</strong></div>
          </section>

          {onCashMovement && (
            <div className="cash-actions-bar">
              <button type="button" className="cash-outflow-button" onClick={() => { setActionModal('sangria'); setActionAmount(0); setActionReason(''); }}>
                <span><ArrowUpFromLine size={17} aria-hidden="true" /></span>
                <span><strong>Saída de dinheiro</strong><small>Registre despesas e retiradas do caixa</small></span>
                <span aria-hidden="true">→</span>
              </button>
            </div>
          )}

          {movements.length > 0 && (
            <div className="mb-4 rounded-2xl bg-slate-50 p-3 text-xs text-slate-600">
              <strong className="mb-2 block text-slate-900">Movimentos deste turno</strong>
              {movements.slice(0, 5).map((movement) => (
                <div key={movement.id} className="flex justify-between gap-3 py-1">
                  <span>{movement.type === 'sangria' ? 'Saída de dinheiro' : 'Entrada antiga'} · {movement.reason}</span>
                  <strong className={movement.type === 'sangria' ? 'text-red-600' : 'text-emerald-600'}>
                    {movement.type === 'sangria' ? '− ' : '+ '}{brl(movement.amount)}
                  </strong>
                </div>
              ))}
            </div>
          )}

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
                <li key={entry.id} className={`cash-entry is-${entry.orderStatus}`} style={['open', 'partial'].includes(entry.creditStatus ?? 'none') ? { borderColor: '#F59E0B', background: '#FFFBEB' } : undefined}>
                  <header className="cash-entry__head">
                    <span className={`cash-entry__source is-${entry.source}`}>{SOURCE_LABEL[entry.source]}</span>
                    <strong>{entry.label}</strong>
                    <span className="cash-entry__time">
                      {new Date(entry.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </header>

                  <p className="cash-entry__client">{entry.customerName}</p>

                  {entry.source === 'delivery' && entry.deliveredByName && (
                    <p className="cash-entry__courier">Entregador: <strong>{entry.deliveredByName}</strong></p>
                  )}

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
                    {['open', 'partial'].includes(entry.creditStatus ?? 'none') && (
                      <span className="cash-badge border border-solid border-amber-300 bg-amber-100 text-amber-800">
                        Fiado · saldo {brl(Number(entry.creditOriginalAmount ?? 0) - Number(entry.creditPaid ?? 0))}
                      </span>
                    )}
                    {(entry.creditPayments?.length ?? 0) > 0 && (
                      <div className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                        <strong className="block">Histórico de abatimentos</strong>
                        {entry.creditPayments!.map((payment, index) => (
                          <span key={`${payment.createdAt}-${index}`} className="mt-1 block">
                            {brl(payment.amount)} · {payment.operatorName || 'Operador'} · {new Date(payment.createdAt).toLocaleString('pt-BR')}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/*
                    Correção de venda JÁ FECHADA.

                    O comércio erra: o cliente pagou PIX e o caixa marcou
                    dinheiro. Sem isto a única saída seria um estorno falso,
                    que suja o histórico mais do que a correção.
                  */}
                  {entry.orderStatus !== 'cancelado' && (entry.paymentStatus === 'pendente' || onEditEntry || onCreditPayment || onCancelEntry) && (
                    <div className="cash-entry__acoes">
                      {(entry.paymentStatus === 'pendente' || onEditEntry) && (
                        <button type="button" className="cash-entry__edit" onClick={() => openEditModal(entry)}>
                          <FolderOpen size={15} aria-hidden="true" /> Abrir
                        </button>
                      )}

                      {onCreditPayment && ['open', 'partial'].includes(entry.creditStatus ?? 'none') && (
                        <button type="button" className="cash-entry__edit" onClick={() => { setActionEntry(entry); setActionAmount(0); setActionModal('fiado'); }}>
                          <HandCoins size={15} aria-hidden="true" /> Abater fiado
                        </button>
                      )}

                      {onCancelEntry && (
                        <button
                          type="button"
                          className="cash-entry__cancel"
                          onClick={() => { setActionEntry(entry); setActionReason(''); setActionModal('cancelar'); }}
                        >
                          <XCircle size={15} aria-hidden="true" /> Cancelar venda
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

          <section className="cash-register-summary" aria-label="Resumo do registro filtrado">
            <span><small>Encontrado</small><strong>{brl(historyTotal)}</strong></span>
            <span><small>Lançamentos</small><strong>{historyFiltered.length}</strong></span>
            <span><small>Histórico total</small><strong>{history.length}</strong></span>
          </section>

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
                  <li key={entry.id} className={`cash-entry is-${entry.orderStatus}`} style={['open', 'partial'].includes(entry.creditStatus ?? 'none') ? { borderColor: '#F59E0B', background: '#FFFBEB' } : undefined}>
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

                    {entry.source === 'delivery' && entry.deliveredByName && (
                      <p className="cash-entry__courier">Entregador: <strong>{entry.deliveredByName}</strong></p>
                    )}

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
                      <span className={`cash-badge ${entry.orderStatus === 'cancelado' ? 'is-order-cancelado' : 'is-pay-concluido'}`}>
                        {entry.orderStatus === 'cancelado' ? 'Venda cancelada · fora do faturamento' : formatPayments(entry.payments)}
                      </span>
                    </div>

                    {['open', 'partial'].includes(entry.creditStatus ?? 'none') && (
                      <p className="cash-entry__fantasma" style={{ color: '#92400e', background: '#fef3c7' }}>
                        Fiado em aberto · saldo {brl(Number(entry.creditOriginalAmount ?? 0) - Number(entry.creditPaid ?? 0))}
                      </p>
                    )}
                    {(entry.creditPayments?.length ?? 0) > 0 && (
                      <div className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                        <strong className="block">Histórico de abatimentos</strong>
                        {entry.creditPayments!.map((payment, index) => (
                          <span key={`${payment.createdAt}-${index}`} className="mt-1 block">
                            {brl(payment.amount)} · {payment.operatorName || 'Operador'} · {new Date(payment.createdAt).toLocaleString('pt-BR')}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="cash-entry__acoes">
                      {onEditEntry && (
                        <button type="button" className="cash-entry__edit" onClick={() => openEditModal(entry)}>
                          <FolderOpen size={15} aria-hidden="true" /> Abrir
                        </button>
                      )}
                      {onReopenEntry && (
                        <button
                          type="button"
                          className="cash-entry__edit"
                          onClick={() => confirm({
                            title: 'Reabrir lançamento',
                            message: `${entry.label} voltará ao turno atual para correção.`,
                            confirmText: 'Reabrir',
                            isDestructive: true,
                            onConfirm: () => onReopenEntry(entry.id),
                          })}
                        >
                          <RotateCcw size={15} aria-hidden="true" /> Reabrir
                        </button>
                      )}
                      {onCancelEntry && entry.orderStatus !== 'cancelado' && (
                        <button type="button" className="cash-entry__cancel" onClick={() => { setActionEntry(entry); setActionReason(''); setActionModal('cancelar'); }}>
                          <XCircle size={15} aria-hidden="true" /> Cancelar venda
                        </button>
                      )}
                      {onCreditPayment && ['open', 'partial'].includes(entry.creditStatus ?? 'none') && (
                        <button type="button" className="cash-entry__edit" onClick={() => { setActionEntry(entry); setActionAmount(0); setActionModal('fiado'); }}>
                          <HandCoins size={15} aria-hidden="true" /> Abater fiado
                        </button>
                      )}
                    </div>

                    {entry.orderStatus === 'cancelado' && entry.motivoCancelamento && (
                      <p className="cash-entry__fantasma">Motivo: {entry.motivoCancelamento}</p>
                    )}
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
            <h4>Conferência do turno</h4>
          </div>

          <p className="cash-note">Fechamento cego: conte cada meio de pagamento sem consultar o total calculado pelo sistema.</p>

          <button
            type="button"
            className="phone__sheet-btn is-primary is-block"
            onClick={handleClose}
            disabled={paid.length === 0}
          >
            {copy.cashClose}
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
          className="cash-order-modal"
          onClick={closeEditModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="cash-order-modal-title"
        >
          <div
            className="cash-order-modal__sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cash-order-modal__head">
              <div><span>Detalhes do pedido</span><strong id="cash-order-modal-title">{editingEntry.label}</strong></div>
              <button type="button" onClick={closeEditModal} aria-label="Fechar pedido"><X size={20} aria-hidden="true" /></button>
            </div>

            <div className="cash-order-modal__summary">
              <span><small>Cliente</small><strong>{editingEntry.customerName}</strong></span>
              <span><small>Total atual</small><strong>{brl(editTotal)}</strong></span>
              <span><small>Situação</small><strong>{editingEntry.paymentStatus === 'concluido' ? 'Pago' : 'Pendente'}</strong></span>
            </div>

            <div className="cash-order-modal__tools">
              <button type="button" onClick={() => void copyEditingReceipt()}><ClipboardCopy size={17} aria-hidden="true" /><span><strong>Copiar formatação</strong><small>Pronta para colar no WhatsApp</small></span></button>
              <button type="button" onClick={() => void printEditingReceipt()}><Printer size={17} aria-hidden="true" /><span><strong>Imprimir comanda</strong><small>Usar a impressora conectada</small></span></button>
            </div>

            {onEditEntry && (
              <div className="mb-4 space-y-2 rounded-2xl bg-slate-50 p-3">
                <strong className="block text-xs uppercase tracking-wider text-slate-500">Itens e valores</strong>
                {editItems.map((item, index) => (
                  <div key={`${item.name}-${index}`} className="grid grid-cols-[1fr_110px_32px] items-center gap-2">
                    <input
                      value={item.name}
                      aria-label={`Nome do item ${index + 1}`}
                      onChange={(event) => setEditItems((current) => current.map((value, itemIndex) => itemIndex === index ? { ...value, name: event.target.value } : value))}
                      className="min-w-0 rounded-xl border border-solid border-slate-200 bg-white px-3 py-2 text-sm"
                    />
                    <MoneyInput
                      value={item.price}
                      onChange={(value) => setEditItems((current) => current.map((itemValue, itemIndex) => itemIndex === index ? { ...itemValue, price: value } : itemValue))}
                    />
                    <button type="button" className="grid h-8 w-8 place-items-center rounded-lg border-0 bg-red-50 text-red-600" aria-label={`Remover ${item.name}`} onClick={() => setEditItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                      <XCircle size={15} aria-hidden="true" />
                    </button>
                  </div>
                ))}
                {editingEntry.source === 'delivery' && onEditDeliveryItems && (
                  <button
                    type="button"
                    className="cash-catalog-button"
                    onClick={() => { const entry = editingEntry; closeEditModal(); onEditDeliveryItems(entry); }}
                  >
                    <span>＋</span>
                    <span><strong>Adicionar item pelo cardápio</strong><small>Você continuará a edição na aba Cliente</small></span>
                    <span aria-hidden="true">→</span>
                  </button>
                )}
                {editingEntry.source === 'delivery' && (
                  <label className="block">
                    <span className="mb-1 block text-xs font-bold text-slate-600">Taxa de entrega</span>
                    <MoneyInput value={editDeliveryFee} onChange={setEditDeliveryFee} />
                  </label>
                )}
                <p className="m-0 text-right text-sm font-extrabold text-slate-900">Novo total: {brl(editTotal)}</p>
              </div>
            )}

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
                    <option value="fiado">Fiado</option>
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
                <p style={{ fontSize: '0.8rem', color: '#047857', background: '#ecfdf5', borderRadius: '10px', padding: '9px 11px', margin: '4px 0', fontWeight: 800 }}>
                  Troco calculado: {brl(editSplitsTotal - editTotal)}
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

            <div className="cash-order-modal__actions">
              <button
                type="button"
                onClick={closeEditModal}
                className="is-secondary"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmEdit}
                disabled={!editIsValid}
                className="is-primary"
              >
                Confirmar
              </button>
            </div>
            {editingReceipt && <PrintTicket {...editingReceipt} />}
          </div>
        </div>
      )}

      {actionModal && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl dark:bg-slate-900">
            <h3 className="m-0 text-lg font-extrabold text-slate-950 dark:text-white">
              {actionModal === 'fechar' && 'Fechamento cego'}
              {actionModal === 'sangria' && 'Registrar saída de dinheiro'}
              {actionModal === 'cancelar' && `Cancelar ${actionEntry?.label ?? 'venda'}`}
              {actionModal === 'fiado' && 'Abater valor fiado'}
            </h3>
            <p className="mb-5 mt-1 text-sm leading-relaxed text-slate-500">
              {actionModal === 'fechar'
                ? 'Informe apenas os valores contados. O sistema revelará as diferenças somente na área de Gestão.'
                : actionModal === 'cancelar'
                  ? 'A venda continuará no histórico, marcada como cancelada e fora do faturamento.'
                  : actionModal === 'fiado'
                    ? `Saldo atual: ${brl(Number(actionEntry?.creditOriginalAmount ?? 0) - Number(actionEntry?.creditPaid ?? 0))}`
                    : 'Valor e motivo ficam registrados com o operador e o horário.'}
            </p>

            {actionModal === 'fechar' ? (
              <div className="space-y-3">
                {(['dinheiro', 'cartao', 'pix'] as const).map((method) => (
                  <label key={method} className="block">
                    <span className="mb-1 block text-xs font-bold capitalize text-slate-600">{method}</span>
                    <MoneyInput value={counted[method]} onChange={(value) => setCounted((current) => ({ ...current, [method]: value }))} />
                  </label>
                ))}
              </div>
            ) : actionModal === 'cancelar' ? (
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-600">Motivo obrigatório</span>
                <textarea autoFocus rows={3} value={actionReason} onChange={(event) => setActionReason(event.target.value)} className="w-full resize-none rounded-2xl border border-solid border-slate-200 p-3 text-sm outline-none focus:border-[#F95D2A] focus:ring-2 focus:ring-orange-100" />
              </label>
            ) : (
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-slate-600">Valor</span>
                  <MoneyInput value={actionAmount} onChange={setActionAmount} />
                </label>
                {actionModal !== 'fiado' && (
                  <label className="block">
                    <span className="mb-1 block text-xs font-bold text-slate-600">Motivo obrigatório</span>
                    <textarea rows={3} value={actionReason} onChange={(event) => setActionReason(event.target.value)} className="w-full resize-none rounded-2xl border border-solid border-slate-200 p-3 text-sm outline-none focus:border-[#F95D2A] focus:ring-2 focus:ring-orange-100" />
                  </label>
                )}
              </div>
            )}

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button type="button" className="rounded-2xl border border-solid border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700" onClick={() => { setActionModal(null); setActionEntry(null); }}>
                Voltar
              </button>
              <button
                type="button"
                className="rounded-2xl border-0 bg-[#F95D2A] px-4 py-3 text-sm font-extrabold text-white disabled:opacity-40"
                disabled={actionModal === 'cancelar' ? actionReason.trim().length < 3 : actionModal === 'fechar' ? false : actionAmount <= 0 || (actionModal !== 'fiado' && actionReason.trim().length < 3)}
                onClick={() => {
                  const modal = actionModal;
                  const entry = actionEntry;
                  confirm({
                    title: 'Confirmação final',
                    message: modal === 'fechar'
                      ? 'Os lançamentos concluídos serão arquivados. Confirma o fechamento do turno?'
                      : modal === 'cancelar'
                        ? 'Esta venda ficará fora do faturamento. Deseja confirmar?'
                        : `Confirma ${modal === 'sangria' ? 'a saída de dinheiro' : 'o abatimento'} de ${brl(actionAmount)}?`,
                    confirmText: 'Confirmar ação',
                    isDestructive: true,
                    onConfirm: () => {
                      if (modal === 'fechar') {
                        onCloseRegister(counted);
                        setClosedMessage('Turno fechado. As diferenças estão disponíveis somente para a Gestão.');
                        window.setTimeout(() => setClosedMessage(null), 4000);
                      } else if (modal === 'cancelar' && entry && onCancelEntry) onCancelEntry(entry.id, actionReason.trim());
                      else if (modal === 'sangria' && onCashMovement) onCashMovement(modal, actionAmount, actionReason.trim());
                      else if (modal === 'fiado' && entry && onCreditPayment) onCreditPayment(entry.id, actionAmount);
                      setActionModal(null);
                      setActionEntry(null);
                    },
                  });
                }}
              >
                Revisar e confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {ConfirmElement}
    </div>
  );
}
