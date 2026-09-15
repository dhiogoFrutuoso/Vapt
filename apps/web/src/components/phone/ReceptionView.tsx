import toast from 'react-hot-toast';
import { useEffect, useState } from 'react';
import { brl } from '../../lib/format';
import { useConfirm } from '../ConfirmModal';
import { addressLabel, mapsUrl, type DeliveryOrder, type PaymentMethod, type PaymentSplit } from './types';
import { demo } from '../../data/content';
import { Printer } from 'lucide-react';
import { PrintTicket } from './PrintTicket';
import { printReceipt } from '../../lib/printReceipt';

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  pix: 'PIX',
  cartao: 'Cartão',
  dinheiro: 'Dinheiro',
  fiado: 'Fiado',
};

function formatPayments(payments: PaymentSplit): string {
  if (payments.length === 0) return 'Pendente';
  return payments.map((p) => `${PAYMENT_LABEL[p.method]} ${brl(p.amount)}`).join(' + ');
}

/** Aceita "8", "8,50" e "8.50" — o recepcionista digita como quiser. */
function parseFee(raw: string): number {
  return parseFloat(raw.trim().replace(',', '.'));
}

function feeToInput(value: number): string {
  if (!value) return '';
  return value.toFixed(2).replace('.', ',');
}

interface ReceptionViewProps {
  deliveries: DeliveryOrder[];
  /** Manda o pedido de volta para a aba Cliente, em modo edicao. */
  onEdit?: (id: string) => void;
  /** Taxa configurada no editor: entra pre-preenchida e vira atalho. */
  defaultFee?: number;
  deliveryPeople?: Array<{ id: string; name: string }>;
  onAccept: (id: string, fee: number, employeeId?: string) => void;
  onReject: (id: string) => void;
  onReassign?: (id: string, employeeId: string) => void;
  storeName?: string;
}

function ReceptionOrderItem({
  d,
  defaultFee,
  onAccept,
  onReject,
  onEdit,
  deliveryPeople,
  confirm,
}: {
  d: DeliveryOrder;
  defaultFee: number;
  onAccept: ReceptionViewProps['onAccept'];
  onReject: ReceptionViewProps['onReject'];
  onEdit?: ReceptionViewProps['onEdit'];
  deliveryPeople: Array<{ id: string; name: string }>;
  confirm: ReturnType<typeof useConfirm>['confirm'];
}) {
  const [fee, setFee] = useState(() => feeToInput(defaultFee));
  const [employeeId, setEmployeeId] = useState('');
  const [dispatchOpen, setDispatchOpen] = useState(false);

  const parsed = parseFee(fee || '0');
  const feeValid = !Number.isNaN(parsed) && parsed >= 0;
  const itemsTotal = d.items.reduce((sum, item) => sum + item.price, 0);
  const hasCredit = d.payments.some((payment) => payment.method === 'fiado');

  /** Atalhos de taxa: gratis e o valor padrao do app, sem repetir. */
  const presets = defaultFee > 0 ? [0, defaultFee] : [0];

  function handleAccept() {
    if (!feeValid) {
      toast.error('Insira um valor válido para a taxa de entrega.');
      return;
    }
    if (d.isDelivery !== false) {
      if (deliveryPeople.length === 0) {
        toast.error('Cadastre um entregador ativo antes de despachar.');
        return;
      }
      setDispatchOpen(true);
      return;
    }
    onAccept(d.id, parsed);
  }

  return (
    <li
      className="phone__delivery is-novo"
      style={hasCredit
        ? { listStyle: 'none', borderColor: '#F59E0B', background: '#FFFBEB' }
        : { listStyle: 'none' }}
    >
      <header>
        <strong>#{d.code}</strong>
        <span className="phone__delivery-badge is-novo">Novo</span>
        {hasCredit && <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-extrabold uppercase text-amber-800">Fiado</span>}
      </header>

      <p className="phone__delivery-client">
        {d.customerName} · {d.timeLabel} · {d.distanceLabel}
      </p>

      <ul className="phone__delivery-items">
        {d.items.map((item, index) => (
          <li key={`${item.name}-${index}`}>
            <span>{item.name}</span>
            <span>{brl(item.price)}</span>
          </li>
        ))}
      </ul>

      <div className="phone__delivery-pay">
        <strong>{brl(d.total)}</strong>
        <span>{formatPayments(d.payments)}</span>
      </div>

      <div className="phone__delivery-address">
        <span className="phone__delivery-mode">
          {d.address.mode === 'gps' ? demo.preview.deliveryGps : 'Endereço informado'}
        </span>
        <strong>{addressLabel(d.address)}</strong>
        {d.address.mode === 'manual' && d.address.district && (
          <span>
            {d.address.district} — {d.address.city}
          </span>
        )}
      </div>

      {d.address.reference && (
        <p className="phone__delivery-reference">
          <strong>{demo.preview.deliveryReference}:</strong> {d.address.reference}
        </p>
      )}

      {/* Taxa da entrega: definida por pedido, antes de ir para o entregador. */}
      <div className="recep-fee">
        <div className="recep-fee__row">
          <label className="recep-fee__field">
            <span>Valor da entrega</span>
            <input
              type="text"
              inputMode="decimal"
              value={fee}
              onChange={(event) => setFee(event.target.value)}
              placeholder="0,00"
              aria-label={`Valor da entrega do pedido ${d.code}`}
            />
          </label>
          <button
            type="button"
            className="recep-fee__dispatch"
            onClick={handleAccept}
            disabled={!feeValid}
          >
            Despachar
          </button>
        </div>

        <div className="recep-fee__presets">
          {presets.map((value) => (
            <button
              key={value}
              type="button"
              className={`recep-chip ${parsed === value && feeValid ? 'is-active' : ''}`}
              onClick={() => setFee(feeToInput(value))}
            >
              {value === 0 ? 'Grátis' : brl(value)}
            </button>
          ))}
          <span className="recep-fee__sum">
            Total: <strong>{brl(itemsTotal + (feeValid ? parsed : 0))}</strong>
          </span>
        </div>
      </div>

      <div className="phone__delivery-actions" style={{ marginTop: 10 }}>
        {onEdit && (
          <button type="button" className="phone__sheet-btn" onClick={() => onEdit(d.id)}>
            Editar pedido
          </button>
        )}
        <a className="phone__sheet-btn" href={mapsUrl(d.address)} target="_blank" rel="noreferrer">
          Abrir mapa
        </a>
        <button
          type="button"
          className="phone__sheet-btn"
          onClick={() => {
            confirm({
              title: 'Recusar Pedido',
              message: 'Tem certeza que deseja recusar e cancelar este pedido?',
              confirmText: 'Recusar',
              isDestructive: true,
              onConfirm: () => onReject(d.id),
            });
          }}
        >
          Recusar
        </button>
      </div>

      {dispatchOpen && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`Selecionar entregador do pedido ${d.code}`}>
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl dark:bg-slate-900">
            <h3 className="m-0 text-lg font-extrabold text-slate-950 dark:text-white">Quem sai com o pedido?</h3>
            <p className="mb-4 mt-1 text-sm text-slate-500">Pedido #{d.code} · escolha um entregador ativo.</p>
            <div className="space-y-2">
              {deliveryPeople.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  className={`flex w-full items-center gap-3 rounded-2xl border border-solid px-4 py-3 text-left text-sm font-bold ${employeeId === person.id ? 'border-[#F95D2A] bg-orange-50 text-[#C2410C]' : 'border-slate-200 bg-white text-slate-800'}`}
                  aria-pressed={employeeId === person.id}
                  onClick={() => setEmployeeId(person.id)}
                >
                  <span className={`h-3 w-3 rounded-full ${employeeId === person.id ? 'bg-[#F95D2A]' : 'bg-slate-200'}`} />
                  {person.name}
                </button>
              ))}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" className="rounded-2xl border border-solid border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700" onClick={() => setDispatchOpen(false)}>Voltar</button>
              <button type="button" className="rounded-2xl border-0 bg-[#F95D2A] px-4 py-3 text-sm font-extrabold text-white disabled:opacity-40" disabled={!employeeId} onClick={() => { onAccept(d.id, parsed, employeeId); setDispatchOpen(false); }}>Confirmar despacho</button>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

export function ReceptionView({
  deliveries,
  defaultFee = 0,
  deliveryPeople = [],
  onAccept,
  onReject,
  onEdit,
  onReassign,
  storeName = 'Vapt',
}: ReceptionViewProps) {
  const { confirm, ConfirmElement } = useConfirm();
  const [printing, setPrinting] = useState<DeliveryOrder | null>(null);
  useEffect(() => {
    if (!printing) return;
    const id = window.setTimeout(() => {
      void printReceipt().catch(() => toast.error('Não foi possível imprimir a comanda.'));
      setPrinting(null);
    }, 50);
    return () => window.clearTimeout(id);
  }, [printing]);
  const novos = deliveries.filter((d) => d.status === 'novo');
  const despachados = deliveries.filter((d) => d.status === 'aceito' || d.status === 'a_caminho').length;

  return (
    <div className="phone__body">
      <p className="phone__role">Recepção · fila de despacho</p>

      <div className="phone__section-title">
        Novos pedidos
        <span className="phone__section-count">{novos.length}</span>
      </div>

      {novos.length === 0 ? (
        <div className="phone__empty">
          <strong>Fila limpa</strong>
          <p>Os pedidos do cliente caem aqui para você definir a taxa e despachar.</p>
        </div>
      ) : (
        <ul className="phone__deliveries">
          {novos.map((d) => (
            <ReceptionOrderItem
              key={d.id}
              d={d}
              defaultFee={defaultFee}
              onAccept={onAccept}
              onReject={onReject}
              onEdit={onEdit}
              confirm={confirm}
              deliveryPeople={deliveryPeople}
            />
          ))}
        </ul>
      )}

      {despachados > 0 && (
        <p className="recep-hint">
          {despachados} {despachados === 1 ? 'pedido já está' : 'pedidos já estão'} com o entregador.
        </p>
      )}

      {onReassign && deliveries.some((d) => d.status !== 'novo') && (
        <section className="mt-5 rounded-3xl border border-solid border-slate-200 bg-white p-4">
          <h3 className="m-0 text-sm font-extrabold text-slate-900">Responsáveis pelas entregas</h3>
          <div className="mt-3 space-y-2">
            {deliveries.filter((d) => d.status !== 'novo').map((order) => (
              <div key={order.id} className="flex items-center gap-2 text-sm">
                <span className="w-16 font-bold text-slate-700">#{order.code}</span>
                <select
                  aria-label={`Entregador do pedido ${order.code}`}
                  className="min-w-0 flex-1 rounded-xl border border-solid border-slate-200 bg-white px-3 py-2"
                  value={order.deliveredById ?? ''}
                  onChange={(event) => {
                    if (event.target.value) onReassign(order.id, event.target.value);
                  }}
                >
                  <option value="">Sem entregador</option>
                  {deliveryPeople.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                </select>
                {onEdit && (
                  <button type="button" className="phone__sheet-btn" onClick={() => onEdit(order.id)}>
                    Editar
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {novos.length > 0 && (
        <div className="mt-4 grid gap-2">
          {novos.map((order) => (
            <button key={order.id} type="button" className="phone__sheet-btn" onClick={() => setPrinting(order)}>
              <Printer size={16} aria-hidden="true" /> Imprimir comanda #{order.code}
            </button>
          ))}
        </div>
      )}

      {printing && (
        <PrintTicket
          storeName={storeName}
          label={`Entrega #${printing.code}`}
          origin="delivery"
          customerName={printing.customerName}
          phone={printing.phone}
          address={addressLabel(printing.address)}
          items={printing.items}
          deliveryFee={printing.deliveryFee}
          width={80}
        />
      )}

      {ConfirmElement}
    </div>
  );
}
