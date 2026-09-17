import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

/**
 * Sessao do app da equipe (Capacitor / WebView).
 *
 * A sessao do painel web e um cookie httpOnly. No app isso nao funciona: a
 * WebView roda em `capacitor://localhost`, origem diferente do dominio da API,
 * e o cookie nao viaja. Entao o app usa Bearer token, e este documento e o
 * lado do servidor dessa sessao.
 *
 * POR QUE GUARDAR SESSAO NO BANCO
 * -------------------------------
 * JWT e stateless por definicao: emitido, vale ate expirar, e nao ha como
 * cancelar. "Bloquear o funcionario derruba o acesso" exige algo que o
 * servidor consiga apagar. A saida padrao, e a adotada aqui:
 *
 *   - o ACCESS token continua stateless e curto (minutos). Nenhuma consulta
 *     ao banco por requisicao — o custo por chamada segue zero;
 *   - o REFRESH token vive AQUI, e e ele que pode ser revogado. Revogado o
 *     refresh, a sessao morre no maximo em uma vida de access token.
 *
 * O refresh e gravado como HASH, nunca em texto. Vazamento do banco nao
 * entrega sessoes ativas — mesma logica da senha.
 *
 * ROTACAO E DETECCAO DE ROUBO
 * ---------------------------
 * Cada uso do refresh queima o token e emite outro, na mesma `family`. Se um
 * token ja usado reaparecer, so ha duas explicacoes: cópia em transito ou
 * roubo do armazenamento. Nos dois casos a familia inteira e revogada — e
 * melhor derrubar o funcionario legitimo do que manter o invasor dentro.
 */

const deviceSessionSchema = new Schema(
  {
    /** Aplicativo (restaurante) ao qual esta sessao pertence. */
    app: { type: Schema.Types.ObjectId, ref: 'AppProject', required: true, index: true },
    /** `_id` do subdocumento employee dentro do AppProject. */
    employeeId: { type: Schema.Types.ObjectId, required: true, index: true },

    /**
     * Device binding: identificador fisico do aparelho, vindo do Capacitor.
     *
     * O codigo de 6 digitos e curto e circula no balcao — sem vinculo, um
     * funcionario passa o codigo adiante e a conta vira compartilhada. Preso
     * ao aparelho, o mesmo codigo em outro device gera OUTRA sessao, que o
     * dono ve e pode derrubar.
     */
    deviceId: { type: String, required: true, trim: true, maxlength: 128, index: true },
    /** Rotulo legivel do aparelho, para o dono reconhecer na lista. */
    deviceName: { type: String, trim: true, maxlength: 80, default: '' },
    platform: { type: String, enum: ['android', 'ios', 'web', 'desconhecido'], default: 'desconhecido' },

    /** SHA-256 do refresh token corrente. O token em si nunca e persistido. */
    refreshTokenHash: { type: String, required: true, select: false },

    /**
     * Hash da geracao anterior, mantido por uma rodada.
     *
     * E o que permite rotacionar NO MESMO documento em vez de criar um novo a
     * cada renovacao. A versao anterior inseria um documento por rotacao: com
     * access token de 10 minutos sao 144 por dia por aparelho, ~4.300 vivos
     * por aparelho numa janela longa — dezenas de milhares de linhas numa equipe
     * de 50 pessoas, para representar 50 sessoes.
     *
     * Guardando so a geracao anterior, a deteccao de reuso continua igual (o
     * token queimado ainda e reconhecido) e a colecao passa a ter uma linha
     * por sessao viva.
     */
    previousTokenHash: { type: String, default: null, select: false },

    /**
     * Linhagem da sessao. Toda rotacao mantem a mesma family; reuso de um
     * token ja rotacionado derruba a family inteira.
     */
    family: { type: String, required: true, index: true },

    /** Preenchido quando o token e rotacionado — marca que este ja foi usado. */
    rotatedAt: { type: Date, default: null },
    /** Preenchido na revogacao. Sessao revogada nunca mais renova. */
    revokedAt: { type: Date, default: null },
    revokedReason: {
      type: String,
      enum: ['logout', 'bloqueio', 'reuso_detectado', 'troca_de_codigo', 'admin', null],
      default: null,
    },

    lastUsedAt: { type: Date, default: Date.now },
    userAgent: { type: String, trim: true, maxlength: 300, default: '' },
    ip: { type: String, trim: true, maxlength: 60, default: '' },

    /** Fim de vida do refresh. O indice TTL abaixo limpa o documento sozinho. */
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

/*
 * TTL do MongoDB: remove o documento quando `expiresAt` passa. Sem isto a
 * colecao cresce para sempre com sessoes mortas.
 */
deviceSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/** Consulta mais quente: "as sessoes vivas deste funcionario neste aparelho". */
deviceSessionSchema.index({ employeeId: 1, deviceId: 1, revokedAt: 1 });

/** Usada ao bloquear um funcionario e ao listar aparelhos de um app. */
deviceSessionSchema.index({ app: 1, revokedAt: 1 });

export type DeviceSessionDoc = InferSchemaType<typeof deviceSessionSchema> & { _id: Types.ObjectId };
export const DeviceSession = model('DeviceSession', deviceSessionSchema);
