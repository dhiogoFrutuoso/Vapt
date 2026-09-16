import { brl } from '../../lib/format';
import { NO_STATION, type ComboPart, type OrderItem, type OrderSource, type PaymentMethod, type PaymentSplit } from './types';

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
  mesa: 'Consumir no local',
  retirada: 'Retirar no balcão',
  delivery: 'Entregar no endereço',
};

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  pix: 'PIX',
  dinheiro: 'DINHEIRO',
  cartao: 'CARTÃO',
  fiado: 'FIADO',
};

export type PrintTicketProps = {
  storeName: string;
  /** "Mesa 04", "Retirada #12", "Entrega #1042". */
  label: string;
  origin: OrderSource;
  customerName: string;
  phone?: string;
  storePhone?: string;
  /** Endereço só faz sentido em delivery. */
  address?: string;
  addressReference?: string;
  notes?: string;
  items: OrderItem[];
  /** Total oficial salvo no pedido. Evita divergência com itens legados agregados. */
  subtotal?: number;
  serviceFee?: number;
  deliveryFee?: number;
  createdAt?: number;
  payments?: PaymentSplit;
  operatorName?: string;
  /** Largura da bobina. 58mm é a de balcão; 80mm a de cozinha. */
  width?: 58 | 80;
  /** Quando definido, imprime só o que esta praça produz. */
  station?: string;
};

function receiptDate(value: number): string {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function receiptTime(value: number): string {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatReceiptText(props: PrintTicketProps): string {
  const subtotal = props.subtotal ?? props.items.reduce((sum, item) => sum + item.price * (item.quantity ?? 1), 0);
  const total = subtotal + (props.serviceFee ?? 0) + (props.deliveryFee ?? 0);
  const lines = [
    props.storeName.toUpperCase(),
    props.storePhone ? `FONE ${props.storePhone}` : '',
    '------------------------------------------',
    `IMPRESSO EM ${receiptDate(Date.now())}`,
    '*** NÃO É DOCUMENTO FISCAL ***',
    '',
    props.customerName.toUpperCase(),
    '',
    `(${ORIGIN_LABEL[props.origin]})`,
    [props.address, props.phone].filter(Boolean).join(' · '),
    props.addressReference ? `REFERÊNCIA: ${props.addressReference}` : '',
    props.notes ? `OBSERVAÇÃO: ${props.notes}` : '',
    `ABERTO EM ${receiptTime(props.createdAt ?? Date.now())}`,
    `(${props.label})`,
    'ITEM (V.Unit)                       Total',
    ...props.items.flatMap((item) => {
      const quantity = item.quantity ?? 1;
      return [
        `${quantity} ${item.name.toUpperCase()} (${brl(item.price)})`,
        `${brl(item.price * quantity)}`,
        ...(item.components ?? []).map((part) => `  ${part.quantity}x ${part.name}`),
      ];
    }),
    '------------------------------------------',
    `SUBTOTAL: ${brl(subtotal)}`,
    (props.serviceFee ?? 0) > 0 ? `+ SERVIÇO: ${brl(props.serviceFee ?? 0)}` : '',
    (props.deliveryFee ?? 0) > 0 ? `+ ENTREGA: ${brl(props.deliveryFee ?? 0)}` : '',
    `= TOTAL A PAGAR: ${brl(total)}`,
    '',
    ...(props.payments?.length
      ? ['FORMA DE PAGAMENTO', ...props.payments.map((payment) => `${PAYMENT_LABEL[payment.method]} ${brl(payment.amount)}`)]
      : ['PAGAMENTO PENDENTE']),
    '',
    `USUÁRIO: ${props.operatorName || 'Equipe Vapt'}`,
    '',
    '* Pela parceria de sempre, o nosso',
    'muito obrigado! *',
    '------------------------------------------',
    'Vapt',
  ];
  return lines.filter((line, index) => line !== '' || lines[index - 1] !== '').join('\n').trim();
}

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
  storePhone,
  address,
  addressReference,
  notes,
  items,
  subtotal: savedSubtotal,
  serviceFee = 0,
  deliveryFee = 0,
  createdAt = Date.now(),
  payments = [],
  operatorName,
  width = 80,
  station,
}: PrintTicketProps) {
  const groups = groupByStation(items, station);
  const subtotal = savedSubtotal ?? items.reduce((sum, item) => sum + item.price * (item.quantity ?? 1), 0);
  const total = subtotal + serviceFee + deliveryFee;
  const stamp = new Date(createdAt);

  return (
    <div className={`print-ticket print-ticket--${width}`} role="document" aria-hidden="true">
      {/* ----------------------------- Cabeçalho ----------------------------- */}
      <p className="print-ticket__store">{storeName}</p>
      {storePhone && <p className="print-ticket__store-contact">{storePhone}</p>}
      <hr className="print-ticket__rule" />
      <p className="print-ticket__printed">IMPRESSO EM {receiptDate(Date.now())}</p>
      <p className="print-ticket__non-fiscal">*** NÃO É DOCUMENTO FISCAL ***</p>

      <p className="print-ticket__client">{customerName}</p>
      <p className="print-ticket__type">({ORIGIN_LABEL[origin]})</p>

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
        {addressReference && (
          <div><dt>Referência:</dt><dd>{addressReference}</dd></div>
        )}
        {notes && (
          <div><dt>Observação:</dt><dd>{notes}</dd></div>
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
      <div className="print-ticket__items-head"><strong>ITEM (V.Unit)</strong><strong>Total</strong></div>
      {[...groups.entries()].map(([name, lines]) => (
        <section key={name}>
          {(station || (groups.size > 1 && name !== NO_STATION)) && <p className="print-ticket__station">{name}</p>}
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

      <div className="print-ticket__payments">
        <strong>{payments.length > 0 ? 'FORMA DE PAGAMENTO' : 'PAGAMENTO PENDENTE'}</strong>
        {payments.map((payment, index) => (
          <div className="print-ticket__line" key={`${payment.method}-${index}`}>
            <span>{PAYMENT_LABEL[payment.method]}</span><span>{brl(payment.amount)}</span>
          </div>
        ))}
      </div>

      <p className="print-ticket__operator">Usuário: {operatorName || 'Equipe Vapt'}</p>

      <p className="print-ticket__footer">* Pela parceria de sempre, o nosso<br />muito obrigado! *</p>
      <p className="print-ticket__signature">Vapt</p>
      <div className="print-ticket__feed" />
    </div>
  );
}
