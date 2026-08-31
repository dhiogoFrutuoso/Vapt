import { Schema, model, type InferSchemaType } from 'mongoose';

/** Lead capturado em qualquer CTA da landing. */
const leadSchema = new Schema(
  {
    name: { type: String, trim: true, maxlength: 120 },
    email: { type: String, trim: true, lowercase: true, maxlength: 160 },
    whatsapp: { type: String, trim: true, maxlength: 30 },
    restaurantName: { type: String, trim: true, maxlength: 120 },
    city: { type: String, trim: true, maxlength: 120 },
    segment: {
      type: String,
      enum: ['restaurante', 'lanchonete', 'pizzaria', 'cafeteria', 'mercado', 'outro'],
      default: 'restaurante',
    },
    interestedPlan: { type: String, trim: true, default: null },
    source: { type: String, trim: true, default: 'landing' },
    demoStoreCode: { type: String, trim: true, default: null },
    status: {
      type: String,
      enum: ['novo', 'em_contato', 'testando', 'convertido', 'perdido'],
      default: 'novo',
    },
    notes: { type: String, trim: true, maxlength: 1000 },
    meta: {
      utmSource: { type: String, default: null },
      utmMedium: { type: String, default: null },
      utmCampaign: { type: String, default: null },
      userAgent: { type: String, default: null },
    },
  },
  { timestamps: true }
);

leadSchema.index({ email: 1, createdAt: -1 });
leadSchema.index({ whatsapp: 1 });

export type LeadDoc = InferSchemaType<typeof leadSchema>;
export const Lead = model('Lead', leadSchema);
