import { useId, useState } from 'react';
import { ArrowRight, Store } from 'lucide-react';
import { useConfirm } from '../ConfirmModal';
import { brl } from '../../lib/format';
import { sumItems, type DeliveryOrder, type PaymentSplit } from './types';
import './ConvertToTakeout.css';

export type TakeoutConversion = { paymentStatus: 'pendente' | 'concluido'; payments: PaymentSplit };
export type ConvertHandler = (id: string, data: TakeoutConversion) => Promise<boolean>;

/** Mesmo controle na recepção, entregador, agendamentos e caixa. */
export function ConvertToTakeout({ order, onConvert, scheduled = false }: {
  order: DeliveryOrder; onConvert: ConvertHandler; scheduled?: boolean;
}) {
  const id = useId();
  const [destination, setDestination] = useState('delivery');
  const [payment, setPayment] = useState('pendente');
  const [busy, setBusy] = useState(false);
  const { confirm, ConfirmElement } = useConfirm();
  const total = sumItems(order.items);
  // Remoção em centavos, inclusive quando a taxa excede a primeira parcela.
  let remaining = Math.round((order.deliveryFee ?? 0) * 100);
  const adjusted = order.payments.map(p => {
    const cents = Math.round(p.amount * 100);
    const deduction = Math.min(cents, remaining);
    remaining -= deduction;
    return { ...p, amount: (cents - deduction) / 100 };
  }).filter(p => p.amount > 0);
  const canKeep = adjusted.length > 0 && adjusted.every(p => p.method !== 'fiado') &&
    Math.abs(adjusted.reduce((s, p) => s + p.amount, 0) - total) < .005;

  function review() {
    const paid = payment !== 'pendente';
    const payments: PaymentSplit = !paid ? [] : payment === 'original' ? adjusted :
      [{ method: payment as 'pix' | 'dinheiro' | 'cartao', amount: total }];
    confirm({ title: `Converter #${order.code} para balcão?`,
      message: `${order.customerName}: o pedido sairá das entregas e irá para ${scheduled ? 'as retiradas agendadas' : 'Retirada no balcão'}. Taxa removida: ${brl(order.deliveryFee ?? 0)}. Total: ${brl(total)}. ${paid ? 'Você confirma que este total já foi recebido.' : 'Ficará aguardando pagamento na retirada. Confira o que já foi recebido antes de cobrar novamente.'} Se a taxa já foi paga, devolva-a ao cliente; esta alteração não faz um estorno bancário.`,
      confirmText: 'Confirmar conversão', cancelText: 'Voltar', isDestructive: false,
      onConfirm: async () => {
        if (busy) return;
        setBusy(true);
        try { await onConvert(order.id, { paymentStatus: paid ? 'concluido' : 'pendente', payments }); }
        finally { setBusy(false); }
      },
    });
  }
  return <section className="takeout-conversion" aria-label={`Alterar atendimento do pedido ${order.code}`}>
    <label htmlFor={id}><Store size={16} aria-hidden="true" /> Tipo de atendimento</label>
    <div className="takeout-conversion__row">
      <select id={id} value={destination} disabled={busy} onChange={e => setDestination(e.target.value)}>
        <option value="delivery">Delivery</option><option value="balcao">Retirada no balcão</option>
      </select>
      <button type="button" disabled={destination !== 'balcao' || busy} onClick={review}>
        {busy ? 'Salvando…' : 'Confirmar'}<ArrowRight size={16} aria-hidden="true" />
      </button>
    </div>
    {destination === 'balcao' && <div className="takeout-conversion__details">
      <p>Sem entrega · <strong>{brl(total)}</strong></p>
      {!scheduled && <label>Pagamento da retirada
        <select value={payment} disabled={busy} onChange={e => setPayment(e.target.value)}>
          <option value="pendente">Aguardando pagamento</option>
          {canKeep && <option value="original">Pago · manter meios informados (sem taxa)</option>}
          <option value="pix">Pago · PIX</option><option value="dinheiro">Pago · Dinheiro</option><option value="cartao">Pago · Cartão</option>
        </select>
      </label>}
      <small>{scheduled ? 'Entrará nas retiradas quando o caixa abrir.' : 'Marque pago somente após conferir o recebimento. Fiado ainda não quitado deve ficar aguardando pagamento.'}</small>
    </div>}
    {ConfirmElement}
  </section>;
}
