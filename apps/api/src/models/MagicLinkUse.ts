import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

/**
 * Registro de magic links já consumidos.
 *
 * É o que torna o link de uso único. A assinatura prova que o pedido não foi
 * adulterado, e a expiração limita a janela — mas nenhuma das duas impede
 * reenviar o MESMO link e criar o pedido de novo. Sem esta coleção, um clique
 * duplo na conversa do WhatsApp viraria dois pedidos idênticos na cozinha.
 *
 * Guardamos só o nonce, nunca o payload: o conteúdo do pedido já está na
 * coleção de pedidos, e repeti-lo aqui seria duplicar dado pessoal do cliente
 * sem ganho nenhum.
 *
 * O índice único no nonce é a garantia de verdade. A checagem "já existe?"
 * antes de inserir tem uma janela de corrida — dois cliques simultâneos
 * passariam os dois pelo `findOne`. Quem decide é o banco: o segundo insert
 * falha com E11000 e o controller trata como "já usado".
 */

const magicLinkUseSchema = new Schema(
  {
    /** Nonce do payload assinado. Único por construção. */
    nonce: { type: String, required: true, unique: true },
    /** Pedido gerado, para o link poder levar direto a ele quando reclicado. */
    order: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
    app: { type: Schema.Types.ObjectId, ref: 'AppProject', required: true, index: true },
    /**
     * Quando o registro pode sumir. Alinhado à expiração do link: passado o
     * prazo, o token já não valida por outros motivos, então guardar o nonce
     * deixa de ter função.
     */
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

/** TTL: o Mongo remove sozinho. Sem isto a coleção cresceria para sempre. */
magicLinkUseSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type MagicLinkUseDoc = InferSchemaType<typeof magicLinkUseSchema> & { _id: Types.ObjectId };
export const MagicLinkUse = model('MagicLinkUse', magicLinkUseSchema);
