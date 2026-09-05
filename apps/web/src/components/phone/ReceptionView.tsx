import toast from 'react-hot-toast';
import { useState } from 'react';
import { brl } from '../../lib/format';
import { useConfirm } from '../ConfirmModal';
import { addressLabel, mapsUrl, type DeliveryOrder, type PaymentMethod, type PaymentSplit } from './types';
import { demo } from '../../data/content';

const PAYMENT_LABEL: Record<PaymentMethod, string> = { pix: 'PIX', cartao: 'Cartão', dinheiro: 'Dinheiro' };

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
  onAccept: (id: string, fee: number) => void;
  onReject: (id: string) => void;
}

function ReceptionOrderItem({
  d,
  defaultFee,
  onAccept,
  onReject,
  onEdit,
  confirm,
}: {
  d: DeliveryOrder;
  defaultFee: number;
  onAccept: ReceptionViewProps['onAccept'];
  onReject: ReceptionViewProps['onReject'];
  onEdit?: ReceptionViewProps['onEdit'];
  confirm: ReturnType<typeof useConfirm>['confirm'];
}) {
  const [fee, setFee] = useState(() => feeToInput(defaultFee));

  const parsed = parseFee(fee || '0');
  const feeValid = !Number.isNaN(parsed) && parsed >= 0;
  const itemsTotal = d.items.reduce((sum, item) => sum + item.price, 0);

  /** Atalhos de taxa: gratis e o valor padrao do app, sem repetir. */
  const presets = defaultFee > 0 ? [0, defaultFee] : [0];

  function handleAccept() {
    if (!feeValid) {
      toast.error('Insira um valor válido para a taxa de entrega.');
      return;
    }
    onAccept(d.id, parsed);
  }

  return (
    <li className="phone__delivery is-novo" style={{ listStyle: 'none' }}>
      <header>
        <strong>#{d.code}</strong>
        <span className="phone__delivery-badge is-novo">Novo</span>
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
    </li>
  );
}

export function ReceptionView({ deliveries, defaultFee = 0, onAccept, onReject, onEdit }: ReceptionViewProps) {
  const { confirm, ConfirmElement } = useConfirm();
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
            />
          ))}
        </ul>
      )}

      {despachados > 0 && (
        <p className="recep-hint">
          {despachados} {despachados === 1 ? 'pedido já está' : 'pedidos já estão'} com o entregador.
        </p>
      )}

      {ConfirmElement}
    </div>
  );
}
