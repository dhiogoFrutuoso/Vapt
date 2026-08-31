import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Loja de demonstracao criada pelo visitante direto na landing.
 * E o "momento uau": ele monta a marca, cadastra um produto
 * e recebe o CODIGO DO RESTAURANTE para usar no app VaptApp Parceiro.
 *
 * IMPORTANTE: `logoUrl` e `products.imageUrl` guardam SEMPRE uma URL
 * (Cloudinary ou /uploads) — nunca base64. Quem converte e o
 * services/imageStorage.ts, chamado pelo controller antes de salvar.
 * Os campos `*PublicId` existem para conseguirmos apagar o arquivo depois.
 */
const demoProductSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 240, default: '' },
    price: { type: Number, required: true, min: 0 },
    imageUrl: { type: String, trim: true, default: null },
    imagePublicId: { type: String, trim: true, default: null },
    category: { type: String, trim: true, default: 'Destaques' },
    available: { type: Boolean, default: true },
  },
  { _id: true, timestamps: true }
);

/** Mesa desenhada pelo dono no passo "salao" da demonstracao. */
const demoTableSchema = new Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 10 },
    seats: { type: Number, required: true, min: 1, max: 40 },
    area: { type: String, trim: true, default: 'Salao', maxlength: 40 },
    status: { type: String, enum: ['livre', 'ocupada', 'pagamento'], default: 'livre' },
  },
  { _id: true }
);

const demoStoreSchema = new Schema(
  {
    /** Codigo do restaurante: o funcionario digita isso no app. Ex.: FW-8K2M4 */
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    restaurantName: { type: String, required: true, trim: true, maxlength: 80 },
    businessType: {
      type: String,
      enum: ['restaurante', 'bar', 'lanchonete', 'pizzaria', 'cafeteria', 'mercado'],
      default: 'restaurante',
    },
    tagline: { type: String, trim: true, maxlength: 120, default: '' },
    logoUrl: { type: String, default: null },
    logoPublicId: { type: String, default: null },
    brandColor: { type: String, default: '#FF6B2C' },
    accentColor: { type: String, default: '#111827' },
    theme: { type: String, enum: ['claro', 'escuro'], default: 'claro' },
    whatsapp: { type: String, trim: true, default: null },
    deliveryFee: { type: Number, default: 0, min: 0 },
    minOrder: { type: Number, default: 0, min: 0 },
    products: { type: [demoProductSchema], default: [] },
    tables: { type: [demoTableSchema], default: [] },
    ownerEmail: { type: String, trim: true, lowercase: true, default: null },
    leadId: { type: Schema.Types.ObjectId, ref: 'Lead', default: null },
    isDemo: { type: Boolean, default: true },
    /** Demos expiram em 30 dias; conta paga converte em loja real. */
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      expires: 0,
    },
  },
  { timestamps: true }
);

demoStoreSchema.index({ createdAt: -1 });

export type DemoStoreDoc = InferSchemaType<typeof demoStoreSchema>;
export const DemoStore = model('DemoStore', demoStoreSchema);
