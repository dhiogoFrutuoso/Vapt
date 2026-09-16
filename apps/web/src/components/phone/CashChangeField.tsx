import { brl } from '../../lib/format';
import { MoneyInput } from './MoneyInput';

type Props = {
  id: string;
  amount: number;
  changeFor?: number;
  onChange: (value?: number) => void;
  deliveryFeePending?: boolean;
};

/** Compartilhado pelo site, caixa e comandas do app Windows/Android. */
export function CashChangeField({ id, amount, changeFor, onChange, deliveryFeePending = false }: Props) {
  const invalid = changeFor != null && changeFor + 0.005 < amount;
  const change = changeFor == null ? 0 : Math.max(0, Math.round((changeFor - amount) * 100) / 100);

  return (
    <div className="cash-change-field">
      <label htmlFor={id}>Troco para quanto? <span>(opcional)</span></label>
      <div className="cash-change-field__input">
        <span aria-hidden="true">R$</span>
        <MoneyInput
          id={id}
          value={changeFor ?? 0}
          onChange={(value) => onChange(value > 0 ? value : undefined)}
          ariaDescribedBy={`${id}-hint`}
          ariaInvalid={invalid}
        />
      </div>
      <p id={`${id}-hint`} className={invalid ? 'cash-change-field__error' : 'cash-change-field__hint'} role={invalid ? 'alert' : undefined}>
        {invalid
          ? `Informe pelo menos ${brl(amount)} ou deixe em branco para pagar sem troco.`
          : changeFor != null
            ? `Troco previsto: ${brl(change)}${deliveryFeePending ? ' · pode mudar após a taxa de entrega.' : ''}`
            : 'Deixe em branco se vai pagar o valor exato.'}
      </p>
    </div>
  );
}
