import { useState, useEffect } from 'react';

type Props = {
  value: number;
  onChange: (val: number) => void;
};

export function MoneyInput({ value, onChange }: Props) {
  // Guarda o que o usuário está digitando (em formato de string)
  const [local, setLocal] = useState<string | null>(null);

  // Se o componente re-renderizar por fora, verifica se precisa descartar o local state
  // Mas como value só muda através do onChange no fluxo normal, deixamos controlado apenas no blur.
  // Se o valor mudar programaticamente (ex: auto-completar falta), o local é ignorado.
  useEffect(() => {
    // Se o valor for forçado por fora e for diferente do que digitamos, reseta o local
    if (local !== null) {
      const currentLocalNum = parseFloat(local.replace(',', '.')) || 0;
      if (Math.abs(currentLocalNum - value) > 0.001) {
        setLocal(null);
      }
    }
  }, [value]);

  const display = local !== null ? local : (value > 0 ? value.toFixed(2).replace('.', ',') : '');

  return (
    <input
      type="text"
      inputMode="decimal"
      value={display}
      onChange={(e) => {
        let val = e.target.value;
        // Remove tudo que não for número ou vírgula
        val = val.replace(/[^0-9,]/g, '');
        // Se houver mais de uma vírgula, mantém só a primeira
        const parts = val.split(',');
        if (parts.length > 2) {
          val = parts[0] + ',' + parts.slice(1).join('');
        }

        setLocal(val);
        const parsed = parseFloat(val.replace(',', '.')) || 0;
        onChange(parsed);
      }}
      onBlur={() => {
        setLocal(null);
      }}
      style={{
        width: '100%',
        padding: '6px 8px 6px 30px',
        borderRadius: '6px',
        border: '1px solid #cbd5e1',
        fontSize: '0.85rem',
        color: '#000',
        backgroundColor: '#fff'
      }}
    />
  );
}
