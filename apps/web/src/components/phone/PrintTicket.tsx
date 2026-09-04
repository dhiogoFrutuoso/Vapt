import { brl } from '../../lib/format';
import { NO_STATION, type ComboPart, type OrderItem, type OrderSource } from './types';

/**
 * Comanda de expedição para impressora térmica.
 *
 * Fica escondida na tela (`.print-ticket { display: none }`) e só aparece no
 * papel. Pensada para o Chrome em `--kiosk-printing`: chamar `window.print()`
 * imprime direto, sem diálogo — por isso a página inteira precisa sumir e
 * sobrar só este bloco, o que o print.css garante.
 *
 * O agrupamento por saguão é o mesmo do KDS: cada praça lê o seu pedaço na
 * via impressa exatamente como leria na tela.
 */

const ORIGIN_LABEL: Record<OrderSource, string> = {
  mesa: 'PEDIDO MESA',
  retirada: 'RETIRADA BALCAO',
  delivery: 'DELIVERY',
};

export type PrintTicketProps = {
  storeName: string;
  /** "Mesa 04", "Retirada #12", "Entrega #1042". */
  label: string;
  origin: OrderSource;
  customerName: string;
  phone?: string;
  /** Endereço só faz sentido em delivery. */
  address?: string;
  items: OrderItem[];
  serviceFee?: number;
  deliveryFee?: number;
  createdAt?: number;
  /** Largura da bobina. 58mm é a de balcão; 80mm a de cozinha. */
  width?: 58 | 80;
  /** Quando definido, imprime só o que esta praça produz. */
  station?: string;
};

type Line = {
  key: string;
  name: string;
  quantity: number;
  price?: number;
  parts?: ComboPart[];
};

function normalizeStation(value?: string): string {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : NO_STATION;
}

/**
 * Agrupa por saguão respeitando o filtro de praça.
 * Combo entra pelas peças: o nome dele vira contexto, e sob ele ficam só as
 * peças daquela praça — igual à tela da Cozinha.
 */
function groupByStation(items: OrderItem[], station?: string): Map<string, Line[]> {
  const groups = new Map<string, Line[]>();

  const push = (key: string, line: Line) => {
    const bucket = groups.get(key);
    if (bucket) bucket.push(line);
    else groups.set(key, [line]);
  };

  items.forEach((item, index) => {
    const parts = item.components && item.components.length > 0 ? item.components : null;

    if (!parts) {
      const own = normalizeStation(item.station);
      if (station && own !== station) return;
      push(own, {
        key: `i${index}`,
        name: item.name,
        quantity: item.quantity ?? 1,
        price: item.price,
      });
      return;
    }

    const visible = station
      ? parts.filter((part) => normalizeStation(part.station) === station)
      : parts;
    if (visible.length === 0) return;

    if (station) {
      push(station, { key: `c${index}`, name: item.name, quantity: 1, price: item.price, parts: visible });
      return;
    }

    // Sem filtro, o combo sai inteiro sob a praça da primeira peça.
    push(normalizeStation(visible[0].station), {
      key: `c${index}`,
      name: item.name,
      quantity: 1,
      price: item.price,
      parts: visible,
    });
  });

  return groups;
}

export function PrintTicket({
  storeName,
  label,
  origin,
  customerName,
  phone,
  address,
  items,
  serviceFee = 0,
  deliveryFee = 0,
  createdAt = Date.now(),
  width = 80,
  station,
}: PrintTicketProps) {
  const groups = groupByStation(items, station);
  const subtotal = items.reduce((sum, item) => sum + item.price * (item.quantity ?? 1), 0);
  const total = subtotal + serviceFee + deliveryFee;
  const stamp = new Date(createdAt);

  return (
    <div className={`print-ticket print-ticket--${width}`} role="document" aria-hidden="true">
      {/* ----------------------------- Cabeçalho ----------------------------- */}
      <p className="print-ticket__store">{storeName}</p>
      <p className="print-ticket__type">{ORIGIN_LABEL[origin]}</p>

      <p className="print-ticket__client">{customerName}</p>

      <dl className="print-ticket__meta">
        <div>
          <dt>Pedido:</dt>
          <dd>{label}</dd>
        </div>
        <div>
          <dt>Hora:</dt>
          <dd>
            {stamp.toLocaleDateString('pt-BR')} {stamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </dd>
        </div>
        {phone && (
          <div>
            <dt>Fone:</dt>
            <dd>{phone}</dd>
          </div>
        )}
        {origin === 'delivery' && address && (
          <div>
            <dt>Endereco:</dt>
            <dd>{address}</dd>
          </div>
        )}
        {station && (
          <div>
            <dt>Praca:</dt>
            <dd>{station}</dd>
          </div>
        )}
      </dl>

      <hr className="print-ticket__rule" />

      {/* ------------------------- Itens por saguão -------------------------- */}
      {[...groups.entries()].map(([name, lines]) => (
        <section key={name}>
          <p className="print-ticket__station">{name}</p>
          <ul className="print-ticket__items">
            {lines.map((line) =>
              line.parts ? (
                <li key={line.key}>
                  <p className="print-ticket__combo">
                    {line.quantity}x {line.name}
                  </p>
                  <ul className="print-ticket__items">
                    {line.parts.map((part, index) => (
                      <li key={`${line.key}-p${index}`} className="print-ticket__item print-ticket__item--part">
                        <span className="print-ticket__qty">{part.quantity}x</span>
                        <span className="print-ticket__name">{part.name}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ) : (
                <li key={line.key} className="print-ticket__item">
                  <span className="print-ticket__qty">{line.quantity}x</span>
                  <span className="print-ticket__name">{line.name}</span>
                  {typeof line.price === 'number' && (
                    <span className="print-ticket__price">{brl(line.price * line.quantity)}</span>
                  )}
                </li>
              )
            )}
          </ul>
        </section>
      ))}

      {/* ------------------------------- Total ------------------------------- */}
      <div className="print-ticket__totals">
        <div className="print-ticket__line">
          <span>Subtotal</span>
          <span>{brl(subtotal)}</span>
        </div>
        {serviceFee > 0 && (
          <div className="print-ticket__line">
            <span>Servico</span>
            <span>{brl(serviceFee)}</span>
          </div>
        )}
        {deliveryFee > 0 && (
          <div className="print-ticket__line">
            <span>Entrega</span>
            <span>{brl(deliveryFee)}</span>
          </div>
        )}
        <div className="print-ticket__line print-ticket__line--total">
          <span>TOTAL</span>
          <span>{brl(total)}</span>
        </div>
      </div>

      <p className="print-ticket__footer">Vapt · obrigado pela preferencia</p>
      <div className="print-ticket__feed" />
    </div>
  );
}
