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

interface ReceptionViewProps {
  deliveries: DeliveryOrder[];
  onAccept: (id: string, fee: number) => void;
  onReject: (id: string) => void;
}

function ReceptionOrderItem({
  d,
  onAccept,
  onReject,
  confirm,
}: {
  d: DeliveryOrder;
  onAccept: ReceptionViewProps['onAccept'];
  onReject: ReceptionViewProps['onReject'];
  confirm: ReturnType<typeof useConfirm>['confirm'];
}) {
  const [fee, setFee] = useState('');

  function handleAccept() {
    const feeRaw = fee || '0';
    const feeNum = parseFloat(feeRaw.replace(',', '.'));
    if (isNaN(feeNum) || feeNum < 0) {
      toast.error('Insira um valor válido para a taxa.');
      return;
    }
    onAccept(d.id, feeNum);
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

      <div className="takeout-form mx-auto flex w-full max-w-sm flex-col gap-3" style={{ marginTop: 12 }}>
        <label className="takeout-form__field w-full">
          <span>Taxa de entrega (R$)</span>
          <input
            type="text"
            inputMode="decimal"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            placeholder="0,00"
          />
        </label>
        <button type="button" className="takeout-form__submit w-full" onClick={handleAccept}>
          Despachar
        </button>
      </div>

      <div className="phone__delivery-actions" style={{ marginTop: 12 }}>
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

export function ReceptionView({ deliveries, onAccept, onReject }: ReceptionViewProps) {
  const { confirm, ConfirmElement } = useConfirm();
  const novos = deliveries.filter((d) => d.status === 'novo');

  return (
    <div className="phone__body" style={{ flex: '0 0 auto', paddingBottom: 8 }}>
      <p className="phone__role">Recepção · novos pedidos</p>

      <div className="phone__section-title">
        Novos pedidos
        <span className="phone__section-count">{novos.length}</span>
      </div>

      {novos.length === 0 ? (
        <div className="phone__empty">
          <strong>Fila limpa</strong>
          <p>Os pedidos do cliente caem aqui para você calcular a taxa e despachar.</p>
        </div>
      ) : (
        <ul className="phone__deliveries">
          {novos.map((d) => (
            <ReceptionOrderItem key={d.id} d={d} onAccept={onAccept} onReject={onReject} confirm={confirm} />
          ))}
        </ul>
      )}
      {ConfirmElement}
    </div>
  );
}
