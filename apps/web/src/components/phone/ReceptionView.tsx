import toast from 'react-hot-toast';
import { useState } from 'react';
import { brl } from '../../lib/format';
import { useConfirm } from '../ConfirmModal';
import { addressLabel, mapsUrl, type DeliveryOrder, type PaymentMethod, type PaymentSplit } from './types';
import { demo } from '../../data/content';

const PAYMENT_LABEL: Record<PaymentMethod, string> = { pix: 'PIX', cartao: 'Cartão', dinheiro: 'Dinheiro' };

function formatPayments(payments: PaymentSplit): string {
  if (payments.length === 0) return 'Pendente';
  return payments.map(p => `${PAYMENT_LABEL[p.method]} ${brl(p.amount)}`).join(' + ');
}

interface ReceptionViewProps {
  deliveries: DeliveryOrder[];
  onAccept: (id: string, fee: number) => void;
  onReject: (id: string) => void;
}

function ReceptionOrderItem({ d, onAccept, onReject, confirm }: { d: DeliveryOrder, onAccept: ReceptionViewProps['onAccept'], onReject: ReceptionViewProps['onReject'], confirm: ReturnType<typeof useConfirm>['confirm'] }) {
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
        <span className="phone__delivery-badge is-novo">
          Novo
        </span>
      </header>

      <p className="phone__delivery-client">
        {d.customerName} • {d.timeLabel} • {d.distanceLabel}
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
        <span>
          {formatPayments(d.payments)}
        </span>
      </div>

      <div className="phone__delivery-address">
        <span className="phone__delivery-mode">
          {d.address.mode === 'gps' ? `📍 ${demo.preview.deliveryGps}` : '📍 Endereço informado'}
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

      {/* AÇÕES DA RECEPÇÃO */}
      <div style={{ backgroundColor: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '12px' }}>
        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>
          Taxa de Entrega Calculada (R$):
        </label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input 
            type="text" 
            inputMode="decimal"
            value={fee} 
            onChange={e => setFee(e.target.value)}
            placeholder="0,00"
            style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '1rem', outline: 'none', color: '#000', backgroundColor: '#fff' }}
          />
          <button 
            type="button"
            className="phone__sheet-btn is-primary"
            onClick={handleAccept}
            style={{ margin: 0, padding: '0 20px', borderRadius: '6px' }}
          >
            Despachar
          </button>
        </div>
      </div>

      <div className="phone__delivery-actions" style={{ marginTop: '12px' }}>
        <a className="phone__sheet-btn" href={mapsUrl(d.address)} target="_blank" rel="noreferrer" style={{ backgroundColor: '#e2e8f0', color: '#334155' }}>
          🗺️ Abrir Mapa
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
              onConfirm: () => onReject(d.id)
            });
          }}
          style={{ backgroundColor: '#fee2e2', color: '#ef4444' }}
        >
          Recusar
        </button>
      </div>
    </li>
  );
}

export function ReceptionView({ deliveries, onAccept, onReject }: ReceptionViewProps) {
  const { confirm, ConfirmElement } = useConfirm();
  const novos = deliveries.filter(d => d.status === 'novo');

  return (
    <div className="phone__body">
      <p className="phone__role">🎧 Recepção</p>
      
      <div className="phone__section-title">
        Novos Pedidos
        <span className="phone__section-count">{novos.length}</span>
      </div>

      {novos.length === 0 ? (
        <div className="phone__empty">
          <span aria-hidden="true">🎧</span>
          <strong>Nenhum pedido novo</strong>
          <p>Os pedidos feitos pelo cliente cairão aqui para você calcular a taxa e despachar.</p>
        </div>
      ) : (
        <ul className="phone__deliveries">
          {novos.map(d => (
            <ReceptionOrderItem key={d.id} d={d} onAccept={onAccept} onReject={onReject} confirm={confirm} />
          ))}
        </ul>
      )}
      {ConfirmElement}
    </div>
  );
}
