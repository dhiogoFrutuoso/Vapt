/**
 * Tipos compartilhados pela simulação de celular da landing.
 *
 * ATENÇÃO: isto é uma SIMULAÇÃO ilustrativa do produto, não a implementação real.
 * O aplicativo de verdade (recepção de pedido pelo site + app do entregador) será
 * desenvolvido depois; aqui o objetivo é a pessoa entender o fluxo em 30 segundos.
 */

export type CategoryItem = {
  _id: string;
  name: string;
  image: string | null;
  itemCount?: number;
};

export type PhonePreviewProps = {
  appName?: string;
  primaryColor?: string;
  theme?: 'claro' | 'escuro';
  tagline?: string;
  logoUrl?: string | null;
  logoIcon?: string;
  categories?: CategoryItem[];
  products?: PreviewProduct[];
  promotions?: PreviewPromotion[];
  tables?: PreviewTable[];
  isFeatured?: boolean;
};

export type PreviewPromotion = {
  _id: string;
  type: 'combo' | 'discount';
  name: string;
  description: string;
  promotionalPrice: number;
  targetProductId: string | null;
  comboItems: string[];
  validUntil: string | null;
  expiresOnRegisterClose: boolean;
  active: boolean;
};

export type PreviewProduct = {
  id?: string;
  name: string;
  description?: string;
  price: number;
  pricingType?: 'unit' | 'weight';
  originalPrice?: number;
  imageUrl?: string | null;
  iconName?: string;
  category?: string;
  /** Saguão (praça de preparo) que produz o item. */
  station?: string;
  isFeatured?: boolean;
  available?: boolean;
  isPromo?: boolean;
  /** Peças do combo, quando este "produto" na verdade e uma promoção. */
  components?: ComboPart[];
};

/**
 * Peça interna de um combo/promoção, já resolvida para o produto real.
 * É por ela que a Cozinha roteia: o combo em si não tem saguão, os filhos têm.
 */
export type ComboPart = {
  name: string;
  quantity: number;
  station?: string;
};

export type OrderItem = {
  name: string;
  price: number;
  quantity?: number;
  pricingType?: 'unit' | 'weight';
  /** Copiado do produto no momento do pedido: e o que roteia para a Cozinha. */
  station?: string;
  /** Item promocional — ganha destaque no ticket da cozinha. */
  isPromo?: boolean;
  /** Preenchido quando o item e um combo: sem isso ele cairia em "Sem saguão". */
  components?: ComboPart[];
};

/* ---------------------------- Cozinha ----------------------------- */

/** Saguão cadastrado pelo dono. */
export type KitchenStation = {
  id: string;
  name: string;
  color?: string;
};

/** Rótulo usado quando o produto não foi vinculado a nenhum saguão. */
export const NO_STATION = 'Sem saguão';

export type KitchenStatus = 'recebido' | 'confeccao' | 'pronto';

export const KITCHEN_FLOW: KitchenStatus[] = ['recebido', 'confeccao', 'pronto'];

export const KITCHEN_LABEL: Record<KitchenStatus, string> = {
  recebido: 'Entregue à cozinha',
  confeccao: 'Em confecção',
  pronto: 'Pronto',
};

/**
 * Comanda como a cozinha enxerga: sem preço, sem pagamento — só quem
 * pediu, de onde veio e o que precisa ser produzido.
 */
export type KitchenTicket = {
  id: string;
  origin: OrderSource;
  /** "Mesa 03", "Retirada #12", "Entrega #1042". */
  label: string;
  customerName: string;
  items: OrderItem[];
  createdAt: number;
};


/* ----------------------------- Salão ----------------------------- */

export type TableStatus = 'livre' | 'ocupada' | 'pagamento';

export type PreviewTable = {
  id: string;
  label: string;
  seats: number;
  area: string;
  status: TableStatus;
  /** Itens lançados na comanda. Ausente na vitrine estática do hero, que usa `total`. */
  items?: OrderItem[];
  total?: number;
};

/* ---------------------------- Delivery ---------------------------- */

export type PaymentMethod = 'pix' | 'dinheiro' | 'cartao' | 'fiado';

/** `amount` é o valor da conta; `changeFor` é a nota entregue em dinheiro, nunca receita. */
export type PaymentSplitItem = { method: PaymentMethod; amount: number; changeFor?: number };
export type PaymentSplit = PaymentSplitItem[];

/** Aplica a taxa somente à primeira parcela, mantendo a ordem escolhida pelo cliente. */
export function paymentsWithDeliveryFee(payments: PaymentSplit, fee: number): PaymentSplit {
  return payments.map((payment, index) => index === 0
    ? { ...payment, amount: Math.round((payment.amount + fee) * 100) / 100 }
    : { ...payment });
}

/** Diferença entre cédulas informadas e valor efetivo devido em dinheiro. */
export function paymentCashBalance(payments: PaymentSplit, total: number): number {
  const cash = payments.filter((payment) => payment.method === 'dinheiro' && payment.changeFor != null);
  if (cash.length === 0) return 0;
  const nonCash = payments
    .filter((payment) => payment.method !== 'dinheiro')
    .reduce((sum, payment) => sum + payment.amount, 0);
  const cashTendered = payments
    .filter((payment) => payment.method === 'dinheiro')
    .reduce((sum, payment) => sum + (payment.changeFor ?? payment.amount), 0);
  return Math.round((cashTendered - Math.max(0, total - nonCash)) * 100) / 100;
}

export function paymentChangeDue(payments: PaymentSplit, total: number): number {
  return Math.max(0, paymentCashBalance(payments, total));
}

export function hasInvalidChangeFor(payments: PaymentSplit): boolean {
  return payments.some((payment) => payment.changeFor != null &&
    (payment.method !== 'dinheiro' || payment.changeFor + 0.005 < payment.amount));
}

export type DeliveryStatus = 'novo' | 'aceito' | 'a_caminho' | 'entregue';

export type DeliveryAddress = {
  /** "gps" = cliente compartilhou localização; "manual" = digitou o endereço. */
  mode: 'gps' | 'manual';
  city?: string;
  district?: string;
  street?: string;
  number?: string;
  /** Referência escrita pelo cliente: "depois da padaria vire à direita...". */
  reference?: string;
  lat?: number;
  lng?: number;
};

export type DeliveryOrder = {
  id: string;
  code: string;
  customerName: string;
  /** WhatsApp do cliente: o entregador liga daqui se nao achar o endereco. */
  phone?: string;
  items: OrderItem[];
  total: number;
  payments: PaymentSplit;
  /** Escolha do cliente no cardápio público; ainda não confirma recebimento. */
  paymentDeclaredOnly?: boolean;
  /** Taxa de entrega definida pela recepção ao despachar. */
  deliveryFee?: number;
  address: DeliveryAddress;
  status: DeliveryStatus;
  timeLabel: string;
  distanceLabel: string;
  /** Observacao escrita pelo cliente no cardapio publico. */
  notes?: string;
  /** `false` quando o cliente escolheu retirar no balcao. */
  isDelivery?: boolean;
  /** Entregador escolhido no despacho; não é autoria. */
  assignedCourierId?: string;
  assignedCourierName?: string;
  /** Autoria registrada quando o entregador sai para a entrega. */
  deliveredById?: string;
  deliveredByName?: string;
};

/** Monta o link do Google Maps a partir do endereço do pedido. */
export function mapsUrl(address: DeliveryAddress): string {
  const query =
    address.mode === 'gps' && address.lat != null && address.lng != null
      ? `${address.lat},${address.lng}`
      : [address.street, address.number, address.district, address.city].filter(Boolean).join(', ');

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/**
 * Linha principal do endereço no card do entregador.
 * Bairro e cidade saem numa segunda linha (DeliveryView), então não entram aqui.
 */
export function addressLabel(address: DeliveryAddress): string {
  if (address.mode === 'gps') {
    return address.lat != null && address.lng != null
      ? `${address.lat.toFixed(5)}, ${address.lng.toFixed(5)}`
      : 'Localização compartilhada';
  }

  return [address.street, address.number].filter(Boolean).join(', ') || 'Endereço informado';
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* Ficam aqui, e nao nos componentes, porque arquivo de componente que  */
/* exporta valor comum quebra o Fast Refresh do Vite.                   */
/* ------------------------------------------------------------------ */

/** Total lancado numa mesa. Usa `items` quando existe; senao o `total` fixo da vitrine. */
export const tableTotal = (table: PreviewTable) =>
  table.items ? table.items.reduce((sum, item) => sum + item.price, 0) : (table.total ?? 0);

/** Proximo estado do fluxo de entrega. */
export const NEXT_STATUS: Record<DeliveryStatus, DeliveryStatus> = {
  novo: 'aceito',
  aceito: 'a_caminho',
  a_caminho: 'entregue',
  entregue: 'entregue',
};

/** Link do WhatsApp do cliente, a partir do telefone digitado. */
export function whatsappUrl(phone?: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return `https://wa.me/55${digits}`;
}

/* ------------------------------------------------------------------ */
/* Atendimento no salão: mesas e retiradas no balcão                    */
/* ------------------------------------------------------------------ */

/** Origem de um pedido dentro da operação. */
export type OrderSource = 'mesa' | 'retirada' | 'delivery';

/**
 * Pedido de RETIRADA (balcão). Funciona igual a uma mesa: abre, lança itens,
 * fecha e vira lançamento no caixa. A diferença é que a "mesa" é o nome do cliente.
 */
export type TakeoutOrder = {
  id: string;
  /** Senha/numero curto mostrado no card. */
  label: string;
  customerName: string;
  phone?: string;
  status: TableStatus;
  items: OrderItem[];
  createdAt: number;
};

/* ------------------------------------------------------------------ */
/* Caixa                                                               */
/* ------------------------------------------------------------------ */

export type OrderProgress = 'feito' | 'cancelado';
export type PaymentProgress = 'pendente' | 'concluido';

/**
 * Uma linha do caixa. Mesa, retirada e delivery caem todos aqui — é o que
 * permite o fechamento contar tudo junto no fim do turno.
 */
export type CashEntry = {
  id: string;
  source: OrderSource;
  /** "Mesa 03", "Retirada #12" ou "Entrega #1042". */
  label: string;
  customerName: string;
  /** Telefone do cliente, quando informado. Usado na busca do Registro. */
  phone?: string;
  /** Cópia do destino, preservada para reimpressão mesmo após o fechamento. */
  address?: DeliveryAddress;
  notes?: string;
  items: OrderItem[];
  /** Soma dos itens. */
  subtotal: number;
  /** Taxa de serviço (10%) — só em mesa. */
  serviceFee: number;
  /** Taxa de entrega — só em delivery. */
  deliveryFee: number;
  total: number;
  /** Parcelas de pagamento (split). Vazio = ainda não pagou. */
  payments: PaymentSplit;
  orderStatus: OrderProgress;
  paymentStatus: PaymentProgress;
  /** Timestamp em ms, usado pelos filtros de tempo. */
  createdAt: number;
  closedAt: number | null;
  cashTurnId?: string;
  /** Espelha o entregador do pedido, para o Registro auditar. */
  deliveredById?: string;
  deliveredByName?: string;
  /** Trilha de correcao pos-fechamento. */
  editadoEm?: number | null;
  editadoPor?: string;
  motivoCancelamento?: string;
  creditStatus?: 'none' | 'open' | 'partial' | 'paid';
  creditOriginalAmount?: number;
  creditPaid?: number;
  creditPayments?: Array<{
    amount: number;
    operatorId: string;
    operatorName: string;
    createdAt: number;
  }>;
};

export type CashMovement = {
  id: string;
  type: 'sangria' | 'suprimento';
  amount: number;
  reason: string;
  operatorId: string;
  operatorName: string;
  createdAt: number;
};

export type CashClosure = {
  id: string;
  turnId?: string;
  openedAt?: number | null;
  openingCash?: number;
  reopenedAt?: number | null;
  counted: Record<'dinheiro' | 'cartao' | 'pix', number>;
  expected: Record<'dinheiro' | 'cartao' | 'pix', number>;
  difference: Record<'dinheiro' | 'cartao' | 'pix', number>;
  /** Saídas preservadas junto do fechamento; registros antigos podem não ter. */
  movements?: CashMovement[];
  operatorId: string;
  operatorName: string;
  createdAt: number;
};

export type AuditEntry = {
  id: string;
  action: string;
  targetId: string;
  summary: string;
  operatorId: string;
  operatorName: string;
  createdAt: number;
};

/**
 * Soma o que ENTROU de dinheiro, pulando os cancelados.
 *
 * Um pedido cancelado continua na lista para auditoria, mas nao pode inflar a
 * receita da noite. Centralizar a regra aqui evita que cada tela invente o
 * proprio `reduce` e uma delas esqueca o filtro.
 */
export function faturamento(entries: CashEntry[]): number {
  return entries
    .filter((e) => e.orderStatus !== 'cancelado')
    .reduce((total, e) => total + (e.total ?? 0), 0);
}

/** Total das entregas concluidas, para o placar da noite do entregador. */
export function totalEntregue(orders: DeliveryOrder[]): number {
  return orders
    .filter((o) => o.status === 'entregue')
    .reduce((total, o) => total + Math.max(0, Number(o.deliveryFee ?? 0)), 0);
}

/** Total dos itens de uma comanda. */
/**
 * Resolve uma promoção nas peças que a cozinha precisa produzir.
 *
 * - combo    -> cada produto de `comboItems` (repetidos viram quantidade);
 * - desconto -> o próprio produto alvo.
 *
 * Sem isto o combo chega na Cozinha como um item solto, sem saguão, e cai no
 * balde "Sem saguão" — que era exatamente o bug: ninguém via o que preparar.
 */
export function promotionParts(
  promo: PreviewPromotion,
  products: PreviewProduct[]
): ComboPart[] {
  const ids =
    promo.type === 'combo'
      ? promo.comboItems ?? []
      : promo.targetProductId
        ? [promo.targetProductId]
        : [];

  const counted = new Map<string, ComboPart>();

  for (const id of ids) {
    const product = products.find((item) => item.id === id);
    // Produto apagado depois de entrar no combo: mantemos o lugar na lista.
    const name = product?.name ?? 'Item removido';
    const key = `${id}::${name}`;
    const existing = counted.get(key);

    if (existing) existing.quantity += 1;
    else counted.set(key, { name, quantity: 1, station: product?.station || '' });
  }

  return [...counted.values()];
}

export function sumItems(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}
