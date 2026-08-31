import { Schema, model, type InferSchemaType } from 'mongoose';

/** Pedido de ajuda da secao "Suporte Humanizado". Vira atendimento no WhatsApp. */
const supportRequestSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    whatsapp: { type: String, required: true, trim: true, maxlength: 30 },
    restaurantName: { type: String, trim: true, maxlength: 120 },
    topic: {
      type: String,
      enum: ['montagem', 'cardapio', 'fotos', 'pagamentos', 'app_equipe', 'outro'],
      default: 'montagem',
    },
    message: { type: String, trim: true, maxlength: 1000 },
    bestTime: { type: String, enum: ['manha', 'tarde', 'noite', 'qualquer'], default: 'qualquer' },
    status: { type: String, enum: ['aberto', 'em_atendimento', 'resolvido'], default: 'aberto' },
    assignedTo: { type: String, default: null },
  },
  { timestamps: true }
);

export type SupportRequestDoc = InferSchemaType<typeof supportRequestSchema>;
export const SupportRequest = model('SupportRequest', supportRequestSchema);
