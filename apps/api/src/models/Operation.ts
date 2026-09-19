import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * Estado operacional do restaurante: o que está acontecendo AGORA.
 *
 * Um documento por aplicativo. Guarda exatamente o que o simulador do painel
 * mantinha em memória — mesas, retiradas, entregas, caixa e o andamento da
 * cozinha — para que o app da equipe mostre a mesma coisa em todos os
 * aparelhos ao mesmo tempo.
 *
 * POR QUE UM DOCUMENTO SÓ, E NÃO CINCO COLEÇÕES
 * --------------------------------------------
 * Porque as cinco listas mudam JUNTAS e são lidas JUNTAS. Fechar uma mesa
 * mexe na mesa e cria um lançamento no caixa; despachar uma entrega mexe na
 * entrega e no caixa. Normalizado, cada ação viraria duas ou três escritas
 * sem transação entre elas, e uma falha no meio deixaria o caixa sem o
 * lançamento de uma mesa que já foi liberada — dinheiro sumindo da conta do
 * dono por causa de um erro de rede.
 *
 * Num documento só, a operação inteira é uma escrita atômica do Mongo.
 *
 * O limite disso é o tamanho: 16 MB por documento. Um turno com centenas de
 * lançamentos fica na casa das dezenas de KB, e o fechamento move o turno
 * para `cashArchive`. Se um dia o arquivo crescer demais, ele é o primeiro
 * candidato a sair para coleção própria — as outras listas são efêmeras por
 * natureza.
 *
 * CONCORRÊNCIA
 * ------------
 * Vários aparelhos escrevem ao mesmo tempo: o garçom lança um item enquanto a
 * recepção despacha uma entrega. O `versionKey` do Mongoose faz o `save()`
 * falhar quando o documento mudou no meio do caminho, e o controlador tenta
 * de novo com o estado fresco. Sem isso, a última escrita apagaria a
 * primeira em silêncio.
 */

/* ------------------------------------------------------------------ */
/* Peças                                                               */
/* ------------------------------------------------------------------ */

/** Peça de um combo, já resolvida para o produto real. */
const comboPartSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    quantity: { type: Number, required: true, min: 1, max: 99 },
    station: { type: String, trim: true, maxlength: 40, default: '' },
  },
  { _id: false }
);

/**
 * Item de um pedido.
 *
 * `station` é COPIADO do produto no momento do lançamento, e não lido do
 * cardápio na hora de exibir. Se o dono mudar o saguão de um produto no meio
 * do turno, os pedidos já em produção continuam roteados para a praça que os
 * está preparando — mudar o destino de um prato que já está na chapa é como
 * a cozinha perde um pedido.
 */
const orderItemSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    price: { type: Number, required: true, min: 0, max: 99_999 },
    quantity: { type: Number, min: 1, max: 99 },
    pricingType: { type: String, enum: ['unit', 'weight'], default: 'unit' },
    station: { type: String, trim: true, maxlength: 40, default: '' },
    isPromo: { type: Boolean, default: false },
    components: { type: [comboPartSchema], default: undefined },
  },
  { _id: false }
);

/** Uma parcela de pagamento. Várias formam o split. */
const paymentSchema = new Schema(
  {
    method: { type: String, enum: ['pix', 'dinheiro', 'cartao', 'fiado'], required: true },
    amount: { type: Number, required: true, min: 0, max: 999_999 },
    /** Valor da cédula entregue; não integra faturamento nem fechamento. */
    changeFor: { type: Number, min: 0, max: 999_999 },
  },
  { _id: false }
);

const addressSchema = new Schema(
  {
    mode: { type: String, enum: ['gps', 'manual'], default: 'manual' },
    city: { type: String, trim: true, maxlength: 80, default: '' },
    district: { type: String, trim: true, maxlength: 80, default: '' },
    street: { type: String, trim: true, maxlength: 160, default: '' },
    number: { type: String, trim: true, maxlength: 20, default: '' },
    reference: { type: String, trim: true, maxlength: 240, default: '' },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
  },
  { _id: false }
);

/* ------------------------------------------------------------------ */
/* Listas                                                              */
/* ------------------------------------------------------------------ */

/**
 * Mesa em operação.
 *
 * O cadastro da mesa (rótulo, lugares, área) mora em `AppProject.tables`,
 * porque é configuração do dono. Aqui fica só o que muda durante o turno:
 * se está ocupada e o que foi lançado nela.
 */
const tableStateSchema = new Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true, trim: true, maxlength: 10 },
    seats: { type: Number, default: 4, min: 1, max: 40 },
    area: { type: String, trim: true, maxlength: 40, default: 'Salao' },
    status: { type: String, enum: ['livre', 'ocupada', 'pagamento'], default: 'livre' },
    items: { type: [orderItemSchema], default: [] },
  },
  { _id: false }
);

/** Retirada no balcão: funciona como mesa, mas a "mesa" é o nome do cliente. */
const takeoutSchema = new Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true, trim: true, maxlength: 10 },
    customerName: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, trim: true, maxlength: 30, default: '' },
    status: { type: String, enum: ['livre', 'ocupada', 'pagamento'], default: 'ocupada' },
    items: { type: [orderItemSchema], default: [] },
    cashEntryId: { type: String, default: '' },
    notes: { type: String, default: '' },
    payments: { type: [paymentSchema], default: [] },
    paymentStatus: { type: String, enum: ['pendente', 'concluido'], default: 'pendente' },
    createdAt: { type: Number, required: true },
  },
  { _id: false }
);

const deliverySchema = new Schema(
  {
    id: { type: String, required: true },
    code: { type: String, required: true, trim: true, maxlength: 10 },
    customerName: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, trim: true, maxlength: 30, default: '' },
    items: { type: [orderItemSchema], default: [] },
    total: { type: Number, default: 0, min: 0 },
    payments: { type: [paymentSchema], default: [] },
    /** Pedido público informa preferência, não pagamento confirmado. */
    paymentDeclaredOnly: { type: Boolean, default: false },
    deliveryFee: { type: Number, default: 0, min: 0, max: 999 },
    address: { type: addressSchema, default: () => ({}) },
    status: { type: String, enum: ['novo', 'aceito', 'a_caminho', 'entregue'], default: 'novo' },
    timeLabel: { type: String, trim: true, maxlength: 30, default: 'agora' },
    distanceLabel: { type: String, trim: true, maxlength: 30, default: '' },

    /** Designação para a fila; ainda não é autoria da entrega. */
    assignedCourierId: { type: String, trim: true, maxlength: 40, default: '' },
    assignedCourierName: { type: String, trim: true, maxlength: 80, default: '' },

    /**
     * Quem iniciou a entrega, registrado somente ao sair para entrega.
     *
     * Guarda id E nome. O id liga à pessoa; o nome é uma CÓPIA do momento da
     * entrega, para o histórico não mudar quando o funcionário for renomeado
     * ou excluído. Um registro de ontem que passa a dizer "Funcionário
     * removido" perde justamente o valor de auditoria que justifica guardá-lo.
     */
    deliveredById: { type: String, trim: true, maxlength: 40, default: '' },
    deliveredByName: { type: String, trim: true, maxlength: 80, default: '' },

    /** Observação escrita pelo cliente no cardápio público. */
    notes: { type: String, trim: true, maxlength: 300, default: '' },

    /** `false` quando o cliente escolheu retirar no balcão. */
    isDelivery: { type: Boolean, default: true },

    createdAt: { type: Number, required: true },
  },
  { _id: false }
);

/**
 * Linha do caixa. Mesa, retirada e delivery caem todos aqui — é o que
 * permite o fechamento contar tudo junto no fim do turno.
 */
const cashEntrySchema = new Schema(
  {
    conversionPrevious: { type: Schema.Types.Mixed, default: undefined },
    id: { type: String, required: true },
    source: { type: String, enum: ['mesa', 'retirada', 'delivery'], required: true },
    label: { type: String, required: true, trim: true, maxlength: 120 },
    customerName: { type: String, trim: true, maxlength: 80, default: '' },
    phone: { type: String, trim: true, maxlength: 30, default: '' },
    address: { type: addressSchema, default: undefined },
    notes: { type: String, trim: true, maxlength: 300, default: '' },
    items: { type: [orderItemSchema], default: [] },
    subtotal: { type: Number, default: 0 },
    serviceFee: { type: Number, default: 0 },
    deliveryFee: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    payments: { type: [paymentSchema], default: [] },
    orderStatus: { type: String, enum: ['feito', 'cancelado'], default: 'feito' },
    paymentStatus: { type: String, enum: ['pendente', 'concluido'], default: 'pendente' },
    creditStatus: {
      type: String,
      enum: ['none', 'open', 'partial', 'paid'],
      default: 'none',
    },
    creditOriginalAmount: { type: Number, default: 0, min: 0 },
    creditPaid: { type: Number, default: 0, min: 0 },
    creditPayments: {
      type: [
        new Schema(
          {
            amount: { type: Number, required: true, min: 0.01 },
            operatorId: { type: String, required: true },
            operatorName: { type: String, default: '' },
            createdAt: { type: Number, required: true },
          },
          { _id: false }
        ),
      ],
      default: [],
    },

    /** Espelha o entregador do pedido, para o Registro auditar sem cruzar listas. */
    deliveredById: { type: String, trim: true, maxlength: 40, default: '' },
    deliveredByName: { type: String, trim: true, maxlength: 80, default: '' },

    /**
     * Trilha de quem mexeu no lançamento DEPOIS de fechado.
     *
     * Editar uma venda paga é necessário — o caixa marca dinheiro e o cliente
     * pagou PIX —, mas sem registro isso vira o buraco por onde o caixa
     * "conserta" o próprio erro de conferência. Cada alteração deixa marca.
     */
    editadoEm: { type: Number, default: null },
    editadoPor: { type: String, trim: true, maxlength: 40, default: '' },
    motivoCancelamento: { type: String, trim: true, maxlength: 200, default: '' },

    createdAt: { type: Number, required: true },
    closedAt: { type: Number, default: null },
    cashTurnId: { type: String, default: '' },
  },
  { _id: false }
);

/* ------------------------------------------------------------------ */
/* Documento                                                           */
/* ------------------------------------------------------------------ */

const operationSchema = new Schema(
  {
    app: {
      type: Schema.Types.ObjectId,
      ref: 'AppProject',
      required: true,
      unique: true,
      index: true,
    },

    tables: { type: [tableStateSchema], default: [] },
    takeouts: { type: [takeoutSchema], default: [] },
    deliveries: { type: [deliverySchema], default: [] },
    scheduledDeliveries: { type: [deliverySchema], default: [] },
    scheduledTakeouts: { type: [takeoutSchema], default: [] },
    scheduledTables: { type: [String], default: [] },
    /** Legacy operations stay open until their first explicit close. New ones start closed. */
    cashOpen: { type: Boolean, default: true },
    cashTurnId: { type: String, default: '' },
    cashOpenedAt: { type: Number, default: null },
    openingCash: { type: Number, default: 0 },
    cashEntries: { type: [cashEntrySchema], default: [] },
    cashArchive: { type: [cashEntrySchema], default: [] },

    cashMovements: {
      type: [
        new Schema(
          {
            id: { type: String, required: true },
            type: { type: String, enum: ['sangria', 'suprimento'], required: true },
            amount: { type: Number, required: true, min: 0.01 },
            reason: { type: String, required: true, trim: true, maxlength: 200 },
            operatorId: { type: String, required: true },
            operatorName: { type: String, default: '' },
            createdAt: { type: Number, required: true },
          },
          { _id: false }
        ),
      ],
      default: [],
    },

    cashClosures: {
      type: [
        new Schema(
          {
            id: { type: String, required: true },
            turnId: { type: String, default: '' },
            openedAt: { type: Number, default: null },
            openingCash: { type: Number, default: 0 },
            reopenedAt: { type: Number, default: null },
            counted: {
              dinheiro: { type: Number, default: 0 },
              cartao: { type: Number, default: 0 },
              pix: { type: Number, default: 0 },
            },
            expected: {
              dinheiro: { type: Number, default: 0 },
              cartao: { type: Number, default: 0 },
              pix: { type: Number, default: 0 },
            },
            difference: {
              dinheiro: { type: Number, default: 0 },
              cartao: { type: Number, default: 0 },
              pix: { type: Number, default: 0 },
            },
            movements: {
              type: [
                new Schema(
                  {
                    id: { type: String, required: true },
                    type: { type: String, enum: ['sangria', 'suprimento'], required: true },
                    amount: { type: Number, required: true, min: 0.01 },
                    reason: { type: String, required: true, trim: true, maxlength: 200 },
                    operatorId: { type: String, required: true },
                    operatorName: { type: String, default: '' },
                    createdAt: { type: Number, required: true },
                  },
                  { _id: false }
                ),
              ],
              default: [],
            },
            operatorId: { type: String, required: true },
            operatorName: { type: String, default: '' },
            createdAt: { type: Number, required: true },
          },
          { _id: false }
        ),
      ],
      default: [],
    },

    auditLog: {
      type: [
        new Schema(
          {
            id: { type: String, required: true },
            action: { type: String, required: true, maxlength: 60 },
            targetId: { type: String, default: '', maxlength: 80 },
            summary: { type: String, required: true, maxlength: 240 },
            operatorId: { type: String, required: true },
            operatorName: { type: String, default: '' },
            createdAt: { type: Number, required: true },
          },
          { _id: false }
        ),
      ],
      default: [],
    },

    /**
     * Andamento da produção, na chave `comandaId::saguao`.
     *
     * `Map` e não objeto solto: as chaves contêm o nome do saguão digitado
     * pelo dono, que pode ter ponto ("Praça 1.2"). Num objeto do Mongoose,
     * ponto na chave vira caminho aninhado e o valor se perde.
     */
    kitchenStatus: {
      type: Map,
      of: { type: String, enum: ['recebido', 'confeccao', 'pronto'] },
      default: () => new Map(),
    },

    /** Quem fechou o último turno e quando — o Registro precisa auditar. */
    lastClosedAt: { type: Date, default: null },
    lastClosedBy: { type: String, trim: true, maxlength: 80, default: '' },
  },
  { timestamps: true, optimisticConcurrency: true }
);

export type OperationDoc = HydratedDocument<InferSchemaType<typeof operationSchema>>;

export const Operation = model('Operation', operationSchema);
