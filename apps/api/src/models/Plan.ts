import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Planos exibidos na secao de precos da landing.
 * Ficam no banco para que o time comercial mude preco sem novo deploy.
 */
const planSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    tagline: { type: String, required: true, trim: true },
    monthlyPrice: { type: Number, required: true, min: 0 },
    annualPrice: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'BRL' },
    badge: { type: String, default: null },
    highlighted: { type: Boolean, default: false },
    ctaLabel: { type: String, default: 'Comecar teste gratis' },
    features: [{ type: String, trim: true }],
    notIncluded: [{ type: String, trim: true }],
    comparison: { type: String, default: null },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

planSchema.index({ order: 1 });

export type PlanDoc = InferSchemaType<typeof planSchema>;
export const Plan = model('Plan', planSchema);
