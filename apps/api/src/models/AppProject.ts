import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

/**
 * O "aplicativo" que o dono monta no painel — o que aparece em "Meus Aplicativos".
 *
 * Nesta fase ele e uma PECA DE APRESENTACAO: guarda marca, cardapio, mesas e
 * configuracoes para renderizar o mockup na tela do painel. A operacao real
 * (pedido, comanda, entrega) vem na proxima fase, reaproveitando estes mesmos dados.
 *
 * Ciclo de vida:
 *   rascunho -> aguardando_contato (usuario escolheu o plano e foi para o WhatsApp) -> ativo
 */

const categorySchema = new Schema(
  {
    name: { type: String, required: [true, 'A categoria precisa de um nome.'], trim: true, maxlength: 40 },
    image: { type: Schema.Types.ObjectId, ref: 'Image', default: null },
  },
  { _id: true, timestamps: true }
);

const productSchema = new Schema(
  {
    name: { type: String, required: [true, 'O produto precisa de um nome.'], trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 240, default: '' },
    price: { type: Number, required: [true, 'O produto precisa de um preco.'], min: 0, max: 99_999 },
    /** Imagem WEBP em base64, na colecao Image. */
    image: { type: Schema.Types.ObjectId, ref: 'Image', default: null },
    category: { type: String, trim: true, maxlength: 40, default: 'Destaques' },
    isFeatured: { type: Boolean, default: false },
    available: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { _id: true, timestamps: true }
);

const promotionSchema = new Schema(
  {
    type: { type: String, enum: ['combo', 'discount'], required: true },
    name: { type: String, required: [true, 'A promoção precisa de um nome.'], trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 240, default: '' },
    promotionalPrice: { type: Number, required: [true, 'Informe o preço promocional.'], min: 0, max: 99_999 },
    targetProductId: { type: Schema.Types.ObjectId, default: null },
    comboItems: { type: [Schema.Types.ObjectId], default: [] },
    validUntil: { type: Date, default: null },
    expiresOnRegisterClose: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
  },
  { _id: true, timestamps: true }
);

const tableSchema = new Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 10 },
    seats: { type: Number, required: true, min: 1, max: 40 },
    area: { type: String, trim: true, maxlength: 40, default: 'Salao' },
  },
  { _id: true }
);

const roleSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 40 },
    permissions: [{ type: String, enum: ['pedidos', 'entregas', 'mesas', 'cardapio'] }],
  },
  { _id: true, timestamps: true }
);

const employeeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    roleId: { type: Schema.Types.ObjectId, required: true },
    accessCode: { type: String, required: true, maxlength: 6, minlength: 6 },
  },
  { _id: true, timestamps: true }
);

const brandSchema = new Schema(
  {
    logo: { type: Schema.Types.ObjectId, ref: 'Image', default: null },
    cover: { type: Schema.Types.ObjectId, ref: 'Image', default: null },
    primaryColor: {
      type: String,
      default: '#FF6B2C',
      match: [/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Cor invalida.'],
    },
    secondaryColor: {
      type: String,
      default: '#111827',
      match: [/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Cor invalida.'],
    },
    theme: { type: String, enum: ['claro', 'escuro'], default: 'claro' },
    tagline: { type: String, trim: true, maxlength: 120, default: '' },
  },
  { _id: false }
);

const deliverySchema = new Schema(
  {
    enabled: { type: Boolean, default: true },
    fee: { type: Number, default: 0, min: 0, max: 999 },
    minOrder: { type: Number, default: 0, min: 0, max: 9999 },
    estimatedMinutes: { type: Number, default: 35, min: 5, max: 240 },
    /** Pedido cai no WhatsApp do restaurante, no painel proprio, ou nos dois. */
    channel: { type: String, enum: ['whatsapp', 'painel', 'ambos'], default: 'ambos' },
    whatsapp: { type: String, trim: true, maxlength: 30, default: '' },
    /**
     * Entregador recebe POR ENTREGA (nao tem salario fixo).
     * Quando ligado, o fechamento de caixa separa o valor dos pedidos do valor
     * das taxas de entrega: o recepcionista acerta essa parte com o entregador.
     */
    courierPaidPerDelivery: { type: Boolean, default: false },
  },
  { _id: false }
);

const diningSchema = new Schema(
  {
    isWaiterCommissionEnabled: { type: Boolean, default: false },
    waiterCommissionPercentage: { type: Number, default: 10, min: 0, max: 100 },
  },
  { _id: false }
);

const appProjectSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: [true, 'O aplicativo precisa de um nome.'], trim: true, maxlength: 80 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 60 },
    /** Codigo do restaurante, gerado quando o app e ativado. Ex.: FW-8K2M4 */
    code: { type: String, uppercase: true, trim: true, sparse: true, unique: true },
    businessType: {
      type: String,
      enum: ['restaurante', 'bar', 'lanchonete', 'pizzaria', 'cafeteria', 'mercado'],
      default: 'restaurante',
    },
    brand: { type: brandSchema, default: () => ({}) },
    delivery: { type: deliverySchema, default: () => ({}) },
    dining: { type: diningSchema, default: () => ({}) },
    categories: { type: [categorySchema], default: [] },
    products: { type: [productSchema], default: [] },
    promotions: { type: [promotionSchema], default: [] },
    tables: { type: [tableSchema], default: [] },
    roles: { type: [roleSchema], default: [] },
    employees: { type: [employeeSchema], default: [] },
    status: {
      type: String,
      enum: ['rascunho', 'aguardando_contato', 'ativo', 'pausado'],
      default: 'rascunho',
      index: true,
    },
    /** Plano escolhido na tela de checkout (o fechamento e manual, pelo WhatsApp). */
    selectedPlan: { type: String, trim: true, default: null },
    planRequestedAt: { type: Date, default: null },
    activatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

appProjectSchema.index({ owner: 1, updatedAt: -1 });

/** Resumo leve para a listagem "Meus Aplicativos" — sem arrastar cardapio inteiro. */
appProjectSchema.methods.toSummary = function toSummary(this: Record<string, unknown>) {
  const brand = (this.brand ?? {}) as { logo?: Types.ObjectId | null; primaryColor?: string };
  return {
    id: String(this._id),
    name: this.name,
    slug: this.slug,
    code: this.code,
    businessType: this.businessType,
    status: this.status,
    selectedPlan: this.selectedPlan,
    primaryColor: brand.primaryColor ?? '#FF6B2C',
    logoUrl: brand.logo ? `/api/images/${String(brand.logo)}` : null,
    productCount: Array.isArray(this.products) ? this.products.length : 0,
    tableCount: Array.isArray(this.tables) ? this.tables.length : 0,
    updatedAt: this.updatedAt,
    createdAt: this.createdAt,
  };
};

export type AppProjectDoc = InferSchemaType<typeof appProjectSchema> & { _id: Types.ObjectId };
export const AppProject = model('AppProject', appProjectSchema);
