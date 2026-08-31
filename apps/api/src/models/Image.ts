import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

/**
 * Imagem guardada NO PROPRIO BANCO, em base64, sempre no formato WEBP.
 *
 * Por que uma colecao separada em vez de um campo dentro de User/AppProject:
 *  - o documento do usuario e do app continuam pequenos e rapidos de listar
 *    (uma listagem de "Meus Aplicativos" nao arrasta megabytes de imagem);
 *  - o teto de 16MB por documento do MongoDB nunca e ameacado;
 *  - a imagem pode ser servida por uma rota propria com cache (/api/images/:id),
 *    em vez de trafegar dentro de todo JSON.
 *
 * O campo `data` guarda base64 PURO (sem o prefixo "data:image/webp;base64,").
 */

/** ~2.8MB de base64 ≈ 2MB de binario: o mesmo teto aplicado na conversao. */
const MAX_BASE64_LENGTH = 2_900_000;

const imageSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    kind: {
      type: String,
      enum: ['avatar', 'logo', 'capa', 'categoria', 'produto', 'outro'],
      default: 'outro',
      index: true,
    },
    /** Fixo: o sistema so grava WEBP. */
    mimeType: {
      type: String,
      required: true,
      default: 'image/webp',
      enum: {
        values: ['image/webp'],
        message: 'Somente imagens WEBP podem ser gravadas.',
      },
    },
    data: {
      type: String,
      required: [true, 'Conteudo da imagem ausente.'],
      validate: [
        {
          validator: (value: string) => value.length <= MAX_BASE64_LENGTH,
          message: 'Imagem muito pesada para o banco.',
        },
        {
          // Base64 puro: nada de data:URL entrando por engano.
          validator: (value: string) => !value.startsWith('data:'),
          message: 'Grave apenas o base64 puro, sem o prefixo data:URL.',
        },
      ],
    },
    width: { type: Number, default: 0, min: 0 },
    height: { type: Number, default: 0, min: 0 },
    /** Tamanho do binario convertido, em bytes (nao do base64). */
    bytes: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

imageSchema.index({ owner: 1, kind: 1, createdAt: -1 });

export type ImageDoc = InferSchemaType<typeof imageSchema> & { _id: Types.ObjectId };
export const Image = model('Image', imageSchema);
export { MAX_BASE64_LENGTH };
