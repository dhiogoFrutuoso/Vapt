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
  isFeatured?: boolean;
  isPromo?: boolean;
};

export type OrderItem = {
  name: string;
  price: number;
  quantity?: number;
  pricingType?: 'unit' | 'weight';
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

export type PaymentMethod = 'pix' | 'dinheiro' | 'cartao';

/** Uma parcela de pagamento. Vários itens formam um split (ex.: parte PIX, parte dinheiro). */
export type PaymentSplitItem = { method: PaymentMethod; amount: number };
export type PaymentSplit = PaymentSplitItem[];

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
  /** Taxa de entrega definida pela recepção ao despachar. */
  deliveryFee?: number;
  address: DeliveryAddress;
  status: DeliveryStatus;
  timeLabel: string;
  distanceLabel: string;
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
};

/** Total dos itens de uma comanda. */
export function sumItems(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}
