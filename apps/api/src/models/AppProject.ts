import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import { env } from '../config/env.js';

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
    pricingType: { type: String, enum: ['unit', 'weight'], default: 'unit' },
    /** Imagem WEBP em base64, na colecao Image. */
    image: { type: Schema.Types.ObjectId, ref: 'Image', default: null },
    category: { type: String, trim: true, maxlength: 40, default: 'Destaques' },
    /** Saguão (praça de preparo) que produz este item. Vazio = sem roteamento. */
    station: { type: String, trim: true, maxlength: 40, default: '' },
    isFeatured: { type: Boolean, default: false },
    available: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { _id: true, timestamps: true }
);

/**
 * Saguão = praça de preparo da cozinha ("Sushi", "Chapa", "Forno").
 * Cada produto aponta para um deles pelo nome, e a aba Cozinha usa isso
 * para desmembrar um pedido entre as praças que o produzem.
 */
const stationSchema = new Schema(
  {
    name: { type: String, required: [true, 'O saguão precisa de um nome.'], trim: true, maxlength: 40 },
    color: { type: String, trim: true, maxlength: 9, default: '#F95D2A' },
    order: { type: Number, default: 0 },
  },
  { _id: true }
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
    permissions: [
      {
        type: String,
        enum: ['cliente', 'recepcao', 'salao', 'caixa', 'entregador', 'cozinha', 'administracao'],
      },
    ],
  },
  { _id: true, timestamps: true }
);

const employeeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    roleId: { type: Schema.Types.ObjectId, required: true },

    /** Espelho explícito da tag, usado somente para escalas e atribuições. */
    isDeliveryman: { type: Boolean, default: false },

    /**
     * Credencial de acesso ao app. `uppercase` porque o funcionario digita no
     * celular e o teclado sugere minusculas — normalizar aqui evita "codigo
     * invalido" por causa de caixa.
     *
     * Pode ficar NULO: bloquear um funcionario apaga o codigo, e desbloquear
     * gera outro. Um codigo que continuasse valendo apos o bloqueio seria uma
     * porta aberta esperando o token expirar.
     */
    accessCode: { type: String, uppercase: true, trim: true, maxlength: 6, default: null },

    /* --------------------- Dados do funcionario --------------------- */
    /* Preenchidos pelo proprio funcionario no onboarding. O dono ve, mas
       nao edita: sao dados pessoais de outra pessoa. */

    phone: { type: String, trim: true, maxlength: 30, default: '' },
    /** Guardado so com digitos. A mascara e responsabilidade da interface. */
    cpf: { type: String, trim: true, maxlength: 11, default: '' },
    birthDate: { type: Date, default: null },
    /** Foto e opcional: exigir camera no primeiro acesso trava o turno. */
    photo: { type: Schema.Types.ObjectId, ref: 'Image', default: null },

    /** Falso ate o funcionario completar contato, CPF e nascimento. */
    onboardingCompleted: { type: Boolean, default: false },

    /* ------------------------- Bloqueio ---------------------------- */

    blocked: { type: Boolean, default: false },
    blockedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
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

/**
 * Tracking white-label: as chaves de marketing sao DO LOJISTA, nao da Vapt.
 *
 * O app publico injeta estas tags no <head> para que ele acompanhe as
 * proprias conversoes na conta dele. Guardamos apenas os IDs publicos — os
 * mesmos que ficariam visiveis no HTML de qualquer site — nunca tokens de
 * API ou segredos de conversao.
 *
 * Os `match` recusam o formato errado na porta de entrada: e barato aqui e
 * caro depois, porque uma tag mal formada falha silenciosamente no navegador
 * e o lojista passa semanas achando que esta medindo.
 */
const trackingSchema = new Schema(
  {
    /** Meta/Facebook Pixel: so digitos, 15 a 16 no padrao atual. */
    facebookPixelId: {
      type: String,
      trim: true,
      maxlength: 32,
      default: '',
      match: [/^$|^[0-9]{10,20}$/, 'O ID do Pixel da Meta deve conter apenas numeros.'],
    },
    /** GA4 no formato G-XXXXXXXXXX. */
    googleAnalyticsId: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 24,
      default: '',
      match: [/^$|^G-[A-Z0-9]{6,14}$/, 'O ID do GA4 deve comecar com "G-".'],
    },
    /** Google Tag Manager no formato GTM-XXXXXXX. */
    googleTagManagerId: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 24,
      default: '',
      match: [/^$|^GTM-[A-Z0-9]{5,12}$/, 'O ID do GTM deve comecar com "GTM-".'],
    },
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
    stations: { type: [stationSchema], default: [] },
    /** Chaves de marketing do proprio lojista (Pixel, GA4, GTM). */
    tracking: { type: trackingSchema, default: () => ({}) },
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
    appPlanType: { 
      type: String, 
      enum: ['TESTE_DELIVERY', 'TESTE_SALAO', 'TESTE_COMPLETO', 'OFICIAL_DELIVERY', 'OFICIAL_SALAO', 'OFICIAL_COMPLETO'],
      default: 'TESTE_COMPLETO'
    },
    planRequestedAt: { type: Date, default: null },
    activatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

appProjectSchema.index({ owner: 1, updatedAt: -1 });

/**
 * Login do app: o funcionario digita SO o codigo, sem dizer o restaurante.
 * A busca precisa varrer os subdocumentos de employees de todos os apps —
 * sem este indice seria varredura completa da colecao a cada tentativa.
 */
appProjectSchema.index({ 'employees.accessCode': 1 });

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
    appPlanType: this.appPlanType,
    primaryColor: brand.primaryColor ?? '#FF6B2C',
    logoUrl: brand.logo ? `${env.publicUrl}/api/images/${String(brand.logo)}` : null,
    productCount: Array.isArray(this.products) ? this.products.length : 0,
    tableCount: Array.isArray(this.tables) ? this.tables.length : 0,
    updatedAt: this.updatedAt,
    createdAt: this.createdAt,
  };
};

export type AppProjectDoc = InferSchemaType<typeof appProjectSchema> & { _id: Types.ObjectId };
export const AppProject = model('AppProject', appProjectSchema);
