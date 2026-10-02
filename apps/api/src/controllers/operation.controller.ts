import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { AppProject } from '../models/AppProject.js';
import { Operation, type OperationDoc } from '../models/Operation.js';
import { HttpError } from '../utils/httpError.js';
import { emitOperationChanged } from '../realtime/io.js';
import { commandAllowed, planAccess } from '../utils/planAccess.js';

/**
 * Operação do restaurante: um endpoint de leitura e um de comando.
 *
 * POR QUE UM DESPACHANTE, E NÃO TRINTA ROTAS REST
 * ----------------------------------------------
 * Quase toda ação aqui mexe em DUAS listas ao mesmo tempo: fechar uma mesa
 * libera a mesa e cria o lançamento no caixa; despachar uma entrega muda a
 * entrega e cria o lançamento. Em rotas separadas, cada ação viraria duas
 * chamadas HTTP sem transação entre elas — e uma queda de rede no meio
 * deixaria a mesa livre sem o dinheiro ter entrado no caixa.
 *
 * Com um comando por ação, o servidor aplica a regra inteira dentro de uma
 * escrita atômica do Mongo. O aplicativo diz o QUE aconteceu; quem decide o
 * efeito é aqui.
 *
 * Isso também é o que impede o cliente de mentir: ele não manda "o caixa
 * agora tem R$ 300", manda "a mesa 4 pagou". O valor é recalculado a partir
 * dos itens que estão no banco.
 */

/* ------------------------------------------------------------------ */
/* Sanitização de texto                                                 */
/* ------------------------------------------------------------------ */

/*
 * Caracteres de controle: tudo abaixo de 0x20 menos nada, mais 0x7F.
 *
 * O texto que chega aqui vem em boa parte de MENSAGENS DE WHATSAPP coladas
 * pelo lojista e lidas pelo parser do aplicativo. É texto de terceiro,
 * atravessando o app até o banco, e depois exibido para a equipe inteira.
 *
 * Três problemas concretos que isto resolve:
 *
 *   1. `NUL` e afins quebram a impressão térmica da comanda: a impressora
 *      interpreta byte de controle como comando, e o ticket sai truncado ou
 *      a gaveta abre sozinha;
 *   2. os caracteres de direção do Unicode (U+202A a U+202E, U+2066 a
 *      U+2069) invertem a ordem visual do texto. Um nome pode ser escrito
 *      para APARECER como outro na tela da cozinha, escondendo o que foi
 *      realmente pedido;
 *   3. quebra de linha e tabulação viram uma linha só, para que um "nome"
 *      com trinta linhas não empurre o resto do card para fora da tela.
 */
const QUEBRAS = /[\t\n\r\v\f]/g;
const CONTROLE = /[\u0000-\u001F\u007F-\u009F]/g;
const DIRECAO = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
const ANGULARES = /[<>]/g;
const ESPACOS = /\s+/g;

/**
 * Limpa uma linha de texto vinda de fora.
 *
 * A ORDEM DAS OPERAÇÕES IMPORTA
 * -----------------------------
 * Quebra de linha e tabulação são caracteres de controle, e removê-las junto
 * com o resto COLA as palavras: "Ana\n\nCosta" viraria "AnaCosta", e o nome
 * do cliente chegaria errado na cozinha. Por isso elas viram espaço primeiro;
 * só depois o resto dos controles é descartado e os espaços são colapsados.
 *
 * Isso foi descoberto testando, não lendo — a primeira versão colava os
 * nomes e parecia certa no código.
 *
 * SOBRE `<` E `>`
 * ---------------
 * Não têm uso legítimo em nome, telefone ou endereço. O React escapa o que
 * renderiza, mas o texto daqui também vai para a COMANDA IMPRESSA, que não
 * passa por React nenhum, e para qualquer consumidor futuro. Remover na
 * entrada custa nada e fecha a classe inteira em vez de contar com o escape
 * correto em todos os pontos de saída.
 *
 * O que NÃO fazemos é escapar para `&lt;`: gravar entidade HTML no banco faz
 * o nome sair escapado na impressora térmica.
 */
function limparTexto(valor: string): string {
  return valor
    .replace(QUEBRAS, ' ')
    .replace(CONTROLE, '')
    .replace(DIRECAO, '')
    .replace(ANGULARES, '')
    .replace(ESPACOS, ' ')
    .trim();
}

/** Aplica a limpeza dentro do Zod, antes de qualquer validação de tamanho. */
const textoLimpo = (max: number) =>
  z
    .string()
    .max(max * 4, 'Texto longo demais.')
    .transform(limparTexto)
    .pipe(z.string().max(max));

/* ------------------------------------------------------------------ */
/* Validação                                                           */
/* ------------------------------------------------------------------ */

const comboPart = z.object({
  name: textoLimpo(80).pipe(z.string().min(1)),
  quantity: z.number().int().min(1).max(99),
  station: z.string().trim().max(40).optional().default(''),
});

const orderItem = z.object({
  name: textoLimpo(120).pipe(z.string().min(1)),
  price: z.number().min(0).max(99_999),
  quantity: z.number().int().min(1).max(99).optional(),
  pricingType: z.enum(['unit', 'weight']).optional(),
  station: z.string().trim().max(40).optional().default(''),
  isPromo: z.boolean().optional(),
  components: z.array(comboPart).max(30).optional(),
});

const payment = z.object({
  method: z.enum(['pix', 'dinheiro', 'cartao', 'fiado']),
  amount: z.number().min(0).max(999_999),
  changeFor: z.number().min(0).max(999_999).optional(),
});

const address = z.object({
  mode: z.enum(['gps', 'manual']).default('manual'),
  city: textoLimpo(80).optional().default(''),
  district: textoLimpo(80).optional().default(''),
  street: textoLimpo(160).optional().default(''),
  number: textoLimpo(20).optional().default(''),
  reference: textoLimpo(240).optional().default(''),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
});

const comandoSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('mesa.abrir'), mesaId: z.string().min(1) }),
  z.object({ tipo: z.literal('mesa.agendar'), mesaId: z.string().min(1) }),
  z.object({
    tipo: z.literal('mesa.status'),
    mesaId: z.string().min(1),
    status: z.enum(['livre', 'ocupada', 'pagamento']),
  }),
  z.object({ tipo: z.literal('mesa.item.adicionar'), mesaId: z.string().min(1), item: orderItem }),
  z.object({
    tipo: z.literal('mesa.item.remover'),
    mesaId: z.string().min(1),
    indice: z.number().int().min(0).max(499),
  }),

  z.object({
    tipo: z.literal('retirada.criar'),
    customerName: textoLimpo(80).pipe(z.string().min(1, 'Informe o nome.')),
    phone: textoLimpo(30)
      .transform((t) => t.replace(/[^\d+()\- ]/g, ''))
      .optional()
      .default(''),
  }),
  z.object({
    tipo: z.literal('retirada.agendar'),
    customerName: textoLimpo(80).pipe(z.string().min(1)),
    phone: textoLimpo(30).optional().default(''),
  }),
  z.object({
    tipo: z.literal('retirada.status'),
    retiradaId: z.string().min(1),
    status: z.enum(['livre', 'ocupada', 'pagamento']),
  }),
  z.object({ tipo: z.literal('retirada.remover'), retiradaId: z.string().min(1) }),
  z.object({
    tipo: z.literal('retirada.item.adicionar'),
    retiradaId: z.string().min(1),
    item: orderItem,
  }),
  z.object({
    tipo: z.literal('retirada.item.remover'),
    retiradaId: z.string().min(1),
    indice: z.number().int().min(0).max(499),
  }),

  z.object({
    tipo: z.literal('comanda.pagar'),
    alvo: z.enum(['mesa', 'retirada']),
    alvoId: z.string().min(1),
    payments: z.array(payment).max(6),
  }),
  z.object({
    tipo: z.literal('comanda.cancelar'),
    alvo: z.enum(['mesa', 'retirada']),
    alvoId: z.string().min(1),
  }),

  z.object({
    tipo: z.literal('pedido.criar'),
    customerName: textoLimpo(80).pipe(z.string().min(1, 'Informe o nome.')),
    phone: textoLimpo(30)
      .transform((t) => t.replace(/[^\d+()\- ]/g, ''))
      .optional()
      .default(''),
    items: z.array(orderItem).min(1).max(80),
    payments: z.array(payment).max(6).default([]),
    address,
    notes: textoLimpo(300).optional().default(''),
    isDelivery: z.boolean().optional().default(true),
  }),
  z.object({
    tipo: z.literal('pedido.agendar'),
    customerName: textoLimpo(80).pipe(z.string().min(1)),
    phone: textoLimpo(30).optional().default(''),
    items: z.array(orderItem).min(1).max(80),
    payments: z.array(payment).max(6).default([]),
    address,
    notes: textoLimpo(300).optional().default(''),
    isDelivery: z.boolean().optional().default(true),
  }),
  z.object({
    tipo: z.literal('pedido.atualizar'),
    pedidoId: z.string().min(1),
    customerName: textoLimpo(80).pipe(z.string().min(1, 'Informe o nome.')),
    phone: textoLimpo(30)
      .transform((t) => t.replace(/[^\d+()\- ]/g, ''))
      .optional()
      .default(''),
    items: z.array(orderItem).min(1).max(80),
    payments: z.array(payment).max(6).default([]),
    address,
    notes: textoLimpo(300).optional().default(''),
    isDelivery: z.boolean().optional().default(true),
  }),
  z.object({
    tipo: z.literal('pedido.aceitar'),
    pedidoId: z.string().min(1),
    fee: z.number().min(0).max(999),
    employeeId: z.string().min(1).optional(),
  }),
  z.object({ tipo: z.literal('pedido.rejeitar'), pedidoId: z.string().min(1) }),
  z.object({ tipo: z.literal('pedido.avancar'), pedidoId: z.string().min(1) }),
  z.object({ tipo: z.literal('pedido.voltar'), pedidoId: z.string().min(1) }),
  z.object({
    tipo: z.literal('pedido.balcao'), pedidoId: z.string().min(1),
    paymentStatus: z.enum(['pendente', 'concluido']),
    payments: z.array(payment).max(6).default([]),
  }),
  z.object({ tipo: z.literal('retirada.entregar'), retiradaId: z.string().min(1) }),
  z.object({ tipo: z.literal('pedido.cancelar'), pedidoId: z.string().min(1) }),

  z.object({
    tipo: z.literal('caixa.pagamento'),
    lancamentoId: z.string().min(1),
    payments: z.array(payment).min(1).max(6),
  }),

  /**
   * Edição de lançamento JÁ FECHADO.
   *
   * O comércio erra: o cliente pagou PIX e o caixa marcou dinheiro. Sem isto,
   * a única saída seria lançar um estorno falso, que suja o histórico mais do
   * que a correção.
   *
   * Procura no turno E no arquivo — a correção costuma aparecer depois do
   * fechamento, quando alguém confere o extrato.
   */
  z.object({
    tipo: z.literal('caixa.editar'),
    lancamentoId: z.string().min(1),
    payments: z.array(payment).max(6).optional(),
    items: z.array(orderItem).max(80).optional(),
    deliveryFee: z.number().min(0).max(999).optional(),
  }),

  /**
   * Cancelamento de venda: o "fantasma".
   *
   * O lançamento CONTINUA na lista, para auditoria, mas sai do faturamento.
   * Apagá-lo esconderia o erro; deixá-lo somando inflaria a receita da noite.
   */
  z.object({
    tipo: z.literal('caixa.cancelar'),
    lancamentoId: z.string().min(1),
    motivo: textoLimpo(200).optional().default(''),
  }),

  z.object({
    tipo: z.literal('caixa.fechar'),
    counted: z.object({
      dinheiro: z.number().min(0).max(999_999),
      cartao: z.number().min(0).max(999_999),
      pix: z.number().min(0).max(999_999),
    }),
  }),
  z.object({ tipo: z.literal('caixa.abrir'), openingCash: z.number().min(0).max(999_999) }),
  z.object({ tipo: z.literal('caixa.turno.reabrir'), closureId: z.string().min(1) }),
  z.object({
    tipo: z.literal('caixa.movimento'),
    movementType: z.literal('sangria'),
    amount: z.number().positive().max(999_999),
    reason: textoLimpo(200).pipe(z.string().min(3)),
  }),
  z.object({ tipo: z.literal('caixa.reabrir'), lancamentoId: z.string().min(1) }),
  z.object({
    tipo: z.literal('fiado.abater'),
    lancamentoId: z.string().min(1),
    amount: z.number().positive().max(999_999),
  }),

  /**
   * Troca do entregador de um pedido já entregue.
   *
   * Acontece toda noite: o João pegou a entrega, o Marcos é quem foi. Sem
   * isto, o placar da noite premia a pessoa errada.
   */
  z.object({
    tipo: z.literal('pedido.entregador'),
    pedidoId: z.string().min(1),
    employeeId: z.string().min(1),
  }),

  z.object({
    tipo: z.literal('cozinha.status'),
    comandaId: z.string().min(1),
    saguoes: z.array(z.string().max(40)).min(1).max(20),
    status: z.enum(['recebido', 'confeccao', 'pronto']),
  }),
]);

type Comando = z.infer<typeof comandoSchema>;

/**
 * Qual permissão cada comando exige.
 *
 * A tabela fica separada da lógica de propósito: dá para auditar quem pode o
 * quê lendo vinte linhas, em vez de caçar `requirePermission` espalhado por
 * trinta rotas. Um comando sem entrada aqui é RECUSADO — esquecer de
 * cadastrar a permissão fecha a porta em vez de abrir.
 */
const PERMISSAO: Record<Comando['tipo'], string[]> = {
  'mesa.abrir': ['salao'],
  'mesa.agendar': ['salao'],
  'mesa.status': ['salao'],
  'mesa.item.adicionar': ['salao'],
  'mesa.item.remover': ['administracao'],

  'retirada.criar': ['recepcao'],
  'retirada.agendar': ['recepcao'],
  'retirada.status': ['recepcao'],
  'retirada.entregar': ['recepcao', 'caixa'],
  'retirada.remover': ['administracao'],
  'retirada.item.adicionar': ['recepcao'],
  'retirada.item.remover': ['administracao'],

  'comanda.pagar': ['salao', 'recepcao', 'caixa'],
  'comanda.cancelar': ['administracao'],

  'pedido.criar': ['cliente', 'recepcao'],
  'pedido.agendar': ['cliente', 'recepcao'],
  'pedido.atualizar': ['administracao'],
  'pedido.aceitar': ['administracao'],
  'pedido.rejeitar': ['administracao'],
  'pedido.avancar': ['entregador'],
  'pedido.voltar': ['administracao'],
  'pedido.balcao': ['recepcao', 'caixa'],
  'pedido.cancelar': ['administracao'],

  'caixa.pagamento': ['caixa'],
  'caixa.editar': ['administracao'],
  'caixa.cancelar': ['administracao'],
  'caixa.fechar': ['caixa'],
  'caixa.abrir': ['caixa'],
  'caixa.turno.reabrir': ['caixa'],
  'caixa.movimento': ['caixa'],
  'caixa.reabrir': ['administracao'],
  'fiado.abater': ['caixa'],

  /* Autoria financeira e operacional: somente a Gestão pode alterar. */
  'pedido.entregador': ['administracao'],

  'cozinha.status': ['cozinha'],
};

/* ------------------------------------------------------------------ */
/* Ajudantes                                                           */
/* ------------------------------------------------------------------ */

const agora = () => Date.now();

/** Soma dos itens da comanda. A lista tem um item por unidade. */
function somarItens(itens: Array<{ price: number }>): number {
  return itens.reduce((total, item) => total + Number(item.price ?? 0), 0);
}

/** A taxa entra uma vez, na primeira forma escolhida; as demais parcelas não mudam. */
function pagamentosComTaxa(
  pagamentos: ReadonlyArray<{ method: string; amount: number; changeFor?: number | null }>,
  taxa: number
) {
  return pagamentos.map((pagamento, indice) => indice === 0
    ? { method: pagamento.method, amount: Math.round((pagamento.amount + taxa) * 100) / 100, changeFor: pagamento.changeFor ?? undefined }
    : { method: pagamento.method, amount: pagamento.amount, changeFor: pagamento.changeFor ?? undefined });
}

function validarPagamentos(total: number, pagamentos: Array<{ method: string; amount: number; changeFor?: number }>): void {
  if (pagamentos.length === 0) return;
  for (const pagamento of pagamentos) {
    if (pagamento.changeFor != null && pagamento.method !== 'dinheiro') {
      throw new HttpError(400, 'Troco só pode ser informado para pagamento em dinheiro.');
    }
    if (pagamento.changeFor != null && pagamento.changeFor + 0.005 < pagamento.amount) {
      throw new HttpError(400, 'O valor entregue em dinheiro não cobre a parcela em dinheiro.');
    }
  }
  const informado = pagamentos.reduce((soma, pagamento) => soma + Number(pagamento.amount ?? 0), 0);
  if (informado + 0.005 < total) throw new HttpError(400, 'O pagamento não cobre o total do pedido.');
  if (informado > total + 0.005) throw new HttpError(400, 'Registre o troco no campo próprio, sem aumentar o valor da venda.');
}

/** Número curto mostrado ao cliente. Não é identificador — só rótulo. */
function codigoCurto(): string {
  return String(Math.floor(1000 + Math.random() * 8999));
}

const proximoStatus: Record<string, 'novo' | 'aceito' | 'a_caminho' | 'entregue'> = {
  novo: 'aceito',
  aceito: 'a_caminho',
  a_caminho: 'entregue',
  entregue: 'entregue',
};

/**
 * Carrega a operação do restaurante, criando na primeira vez.
 *
 * As mesas são copiadas do cadastro do dono (`AppProject.tables`) e
 * sincronizadas a cada leitura: mesa nova cadastrada no painel aparece no
 * app, e mesa apagada some — mas uma mesa OCUPADA nunca perde os itens, pois
 * o estado dela vem daqui, não do cadastro.
 */
type Carregada = {
  operacao: OperationDoc;
  /** Fração da taxa de serviço da casa (0.1 = 10%). Vem do cadastro do dono. */
  taxaServico: number;
  /** id do funcionário -> nome, para carimbar autoria de entrega. */
  nomes: Map<string, string>;
  entregadores: Set<string>;
};

async function carregar(appId: string): Promise<Carregada> {
  const app = await AppProject.findById(appId).select('tables dining employees roles appPlanType').lean();
  if (!app) throw new HttpError(404, 'Aplicativo nao encontrado.');

  /*
   * A taxa vem do cadastro, nunca do cliente.
   *
   * Aceitar o percentual vindo do aparelho deixaria qualquer funcionário
   * fechar uma mesa de R$ 400 cobrando 0% de serviço — e a diferença sairia
   * do bolso de quem trabalhou na mesa.
   */
  const dining = (app.dining ?? {}) as Record<string, unknown>;
  const taxaServico =
    dining.isWaiterCommissionEnabled === true
      ? Number(dining.waiterCommissionPercentage ?? 10) / 100
      : 0;

  let operacao = await Operation.findOne({ app: appId });
  if (!operacao) operacao = new Operation({ app: appId, tables: [], cashOpen: false });
  // Delivery has no cash-register module: active restaurants can serve orders.
  if (!planAccess(app.appPlanType).cash && planAccess(app.appPlanType).delivery) {
    operacao.cashOpen = true;
    // Release orders scheduled under the old cash-dependent Delivery policy.
    if (operacao.scheduledTakeouts.length) {
      operacao.set('takeouts', [...operacao.scheduledTakeouts, ...operacao.takeouts]);
      operacao.set('scheduledTakeouts', []);
    }
    if (operacao.scheduledDeliveries.length) {
      operacao.set('deliveries', [...operacao.scheduledDeliveries, ...operacao.deliveries]);
      operacao.set('scheduledDeliveries', []);
    }
  }

  const cadastradas = (app.tables ?? []) as unknown as Array<Record<string, unknown>>;
  const porId = new Map(operacao.tables.map((t) => [t.id, t]));

  const sincronizadas = cadastradas.map((mesa) => {
    const id = String(mesa._id);
    const viva = porId.get(id);
    return {
      id,
      label: String(mesa.label ?? ''),
      seats: Number(mesa.seats ?? 4),
      area: String(mesa.area ?? 'Salao'),
      /* O que muda no turno vem da operação; o resto, do cadastro. */
      status: viva?.status ?? 'livre',
      items: viva?.items ?? [],
    };
  });

  const mudou =
    sincronizadas.length !== operacao.tables.length ||
    sincronizadas.some((m, i) => operacao!.tables[i]?.id !== m.id);

  if (mudou) operacao.set('tables', sincronizadas);

  // Pedidos antigos usavam a designação como autoria. Migre apenas os que
  // ainda não saíram, preservando a autoria real dos pedidos em andamento.
  for (const pedido of operacao.deliveries) {
    if (pedido.status !== 'aceito' || pedido.assignedCourierId || !pedido.deliveredById) continue;
    pedido.assignedCourierId = pedido.deliveredById;
    pedido.assignedCourierName = pedido.deliveredByName;
    pedido.deliveredById = '';
    pedido.deliveredByName = '';
    const lancamento = operacao.cashEntries.find((entry) => entry.id === `c-${pedido.id}`)
      ?? operacao.cashArchive.find((entry) => entry.id === `c-${pedido.id}`);
    if (lancamento) {
      lancamento.deliveredById = '';
      lancamento.deliveredByName = '';
    }
  }

  /*
   * Só id e nome. Puxar `employees` inteiro traria os códigos de acesso para
   * a memória de um controlador que não tem nada a ver com autenticação.
   */
  const nomes = new Map<string, string>();
  const roles = new Map(
    ((app as unknown as { roles?: Array<Record<string, unknown>> }).roles ?? []).map((role) => [
      String(role._id),
      ((role.permissions ?? []) as unknown[]).map(String),
    ])
  );
  const entregadores = new Set<string>();
  for (const e of (app.employees ?? []) as unknown as Array<Record<string, unknown>>) {
    const id = String(e._id);
    nomes.set(id, String(e.name ?? ''));
    if (
      e.blocked !== true &&
      (e.isDeliveryman === true || (roles.get(String(e.roleId)) ?? []).includes('entregador'))
    ) {
      entregadores.add(id);
    }
  }

  return { operacao, taxaServico, nomes, entregadores };
}

/** Devolve o estado como o aplicativo espera consumir. */
export function serializar(operacao: OperationDoc, permissions: string[] = [], employeeId = '', planType?: string) {
  const access = planAccess(planType);
  const admin = permissions.includes('administracao');
  const can = (...needed: string[]) => admin || needed.some((permission) => permissions.includes(permission));
  const deliveries = access.delivery && can('cliente', 'recepcao', 'cozinha', 'entregador')
    ? permissions.includes('entregador') && !admin && !permissions.includes('recepcao') && !permissions.includes('cozinha')
      ? operacao.deliveries.filter((delivery) => delivery.assignedCourierId === employeeId || (!delivery.assignedCourierId && delivery.deliveredById === employeeId))
      : operacao.deliveries
    : [];
  return {
    tables: access.dining && can('salao', 'cozinha') ? operacao.tables : [],
    takeouts: can('recepcao', 'cozinha') ? operacao.takeouts : [],
    deliveries,
    cashEntries: access.cash && can('caixa') ? operacao.cashEntries : [],
    cashArchive: access.cash && can('caixa') ? operacao.cashArchive : [],
    cashMovements: access.cash && can('caixa') ? operacao.cashMovements : [],
    cashClosures: access.cash && can('caixa') ? operacao.cashClosures : [],
    cashOpen: operacao.cashOpen,
    cashOpenedAt: operacao.cashOpenedAt,
    openingCash: access.cash ? operacao.openingCash : 0,
    scheduledTables: access.dining && can('salao') ? operacao.scheduledTables : [],
    scheduledTakeouts: can('recepcao') ? operacao.scheduledTakeouts : [],
    scheduledDeliveries: access.delivery && can('recepcao') ? operacao.scheduledDeliveries : [],
    auditLog: admin ? operacao.auditLog.filter(event =>
      (access.cash || !/^(caixa|fiado)[.:]/.test(event.action)) &&
      (access.delivery || !/^(pedido|entrega)[.:]/.test(event.action)) &&
      (access.dining || !/^mesa[.:]/.test(event.action))) : [],
    kitchenStatus: can('cozinha') ? Object.fromEntries([...(operacao.kitchenStatus ?? new Map())].filter(([key]) =>
      (access.dining || !key.startsWith('k-mesa-')) && (access.delivery || !key.startsWith('k-delivery-')))) : {},
    lastClosedAt: operacao.lastClosedAt,
    lastClosedBy: operacao.lastClosedBy,
  };
}

/* ------------------------------------------------------------------ */
/* GET /api/device/operation                                           */
/* ------------------------------------------------------------------ */

export const getOperation = asyncHandler(async (req: Request, res: Response) => {
  const appId = req.device!.app;
  let { operacao } = await carregar(appId);

  // A sincronização das mesas pode ter alterado o documento.
  if (operacao.isNew || operacao.isModified()) {
    try {
      await operacao.save();
    } catch (error) {
      if (!['VersionError', 'ParallelSaveError'].includes((error as { name?: string }).name ?? '')
        && (error as { code?: number }).code !== 11000) throw error;
      // Another device initialized or changed the same operation first.
      ({ operacao } = await carregar(appId));
    }
  }

  return res.json({ ok: true, data: serializar(operacao, req.device!.perms, req.device!.sub, req.device!.planType) });
});

/* ------------------------------------------------------------------ */
/* POST /api/device/operation                                          */
/* ------------------------------------------------------------------ */

/**
 * Aplica o comando ao documento. Puro: só mexe no objeto recebido.
 *
 * Devolve uma mensagem para a tela quando há algo a dizer ao funcionário.
 */
export function aplicar(
  operacao: OperationDoc,
  comando: Comando,
  quem: string,
  taxaServico: number,
  nomes: Map<string, string>,
  entregadores: Set<string>,
  permissoes: string[]
): string | null {
  /* Nome do funcionário, ou vazio se ele já foi removido do cadastro. */
  const nomeDe = (id: string) => nomes.get(id) ?? '';
  const auditar = (action: string, targetId: string, summary: string) => {
    operacao.auditLog.unshift({
      id: `a-${agora()}-${Math.floor(Math.random() * 1000)}`,
      action,
      targetId,
      summary,
      operatorId: quem,
      operatorName: nomeDe(quem),
      createdAt: agora(),
    } as never);
    if (operacao.auditLog.length > 1000) operacao.auditLog.splice(1000);
  };

  // Every operational entry point is checked here, not only hidden in the UI.
  // Historical corrections and scheduling remain possible after closing.
  const permitidoFechado: Comando['tipo'][] = [
    'caixa.abrir', 'caixa.turno.reabrir', 'caixa.editar', 'caixa.cancelar',
    'mesa.agendar', 'retirada.agendar', 'pedido.agendar', 'pedido.balcao',
  ];
  if (!operacao.cashOpen && !permitidoFechado.includes(comando.tipo)) {
    throw new HttpError(409, 'Caixa fechado. Abra o caixa ou agende para a próxima abertura.');
  }

  switch (comando.tipo) {
    /* ----------------------------- Mesas ----------------------------- */

    case 'mesa.abrir': {
      const mesa = operacao.tables.find((m) => m.id === comando.mesaId);
      if (!mesa) throw new HttpError(404, 'Mesa nao encontrada.');
      if (mesa.status === 'livre') {
        mesa.status = 'ocupada';
        mesa.set('items', []);
      }
      return null;
    }

    case 'mesa.agendar': {
      if (operacao.cashOpen) throw new HttpError(409, 'Caixa aberto. Abra a mesa normalmente.');
      if (!operacao.tables.some((m) => m.id === comando.mesaId)) throw new HttpError(404, 'Mesa não encontrada.');
      if (!operacao.scheduledTables.includes(comando.mesaId)) operacao.scheduledTables.push(comando.mesaId);
      auditar('mesa.agendada', comando.mesaId, 'Mesa agendada para a próxima abertura.');
      return 'Mesa agendada para a próxima abertura.';
    }

    case 'mesa.status': {
      const mesa = operacao.tables.find((m) => m.id === comando.mesaId);
      if (!mesa) throw new HttpError(404, 'Mesa nao encontrada.');
      mesa.status = comando.status;
      // Liberar a mesa zera a comanda: o que ficou pendente virou lançamento.
      if (comando.status === 'livre') mesa.set('items', []);
      return null;
    }

    case 'mesa.item.adicionar': {
      const mesa = operacao.tables.find((m) => m.id === comando.mesaId);
      if (!mesa) throw new HttpError(404, 'Mesa nao encontrada.');
      mesa.items.push(comando.item as never);
      mesa.status = 'ocupada';
      return null;
    }

    case 'mesa.item.remover': {
      const mesa = operacao.tables.find((m) => m.id === comando.mesaId);
      if (!mesa) throw new HttpError(404, 'Mesa nao encontrada.');
      if (comando.indice >= mesa.items.length) {
        // Dois garçons removendo ao mesmo tempo: o índice do segundo já não
        // aponta para o item que ele viu. Recusar é melhor que apagar outro.
        throw new HttpError(409, 'Este item ja foi removido. Recarregue a comanda.');
      }
      mesa.items.splice(comando.indice, 1);
      return null;
    }

    /* --------------------------- Retiradas --------------------------- */

    case 'retirada.criar': {
      operacao.takeouts.unshift({
        id: `t-${agora()}-${Math.floor(Math.random() * 1000)}`,
        label: codigoCurto().slice(0, 2),
        customerName: comando.customerName,
        phone: comando.phone,
        status: 'ocupada',
        items: [],
        createdAt: agora(),
      } as never);
      return null;
    }

    case 'retirada.agendar': {
      if (operacao.cashOpen) throw new HttpError(409, 'Caixa aberto. Abra a retirada normalmente.');
      operacao.scheduledTakeouts.push({
        id: `t-${agora()}-${Math.floor(Math.random() * 1000)}`,
        label: codigoCurto().slice(0, 2),
        customerName: comando.customerName, phone: comando.phone,
        status: 'ocupada', items: [], createdAt: agora(),
      } as never);
      auditar('retirada.agendada', '', `Retirada de ${comando.customerName} agendada.`);
      return 'Retirada agendada para a próxima abertura.';
    }

    case 'retirada.status': {
      const retirada = operacao.takeouts.find((t) => t.id === comando.retiradaId);
      if (!retirada) throw new HttpError(404, 'Retirada nao encontrada.');
      if (retirada.cashEntryId && comando.status === 'livre') {
        throw new HttpError(409, 'Abra a comanda para confirmar a retirada ou cancelar a venda.');
      }
      retirada.status = comando.status;
      if (comando.status === 'livre') retirada.set('items', []);
      return null;
    }

    case 'retirada.remover': {
      const retirada = operacao.takeouts.find((t) => t.id === comando.retiradaId);
      if (retirada?.cashEntryId) {
        return aplicar(operacao, { tipo: 'comanda.cancelar', alvo: 'retirada', alvoId: retirada.id }, quem, taxaServico, nomes, entregadores, permissoes);
      }
      operacao.set(
        'takeouts',
        operacao.takeouts.filter((t) => t.id !== comando.retiradaId)
      );
      return null;
    }

    case 'retirada.item.adicionar': {
      const retirada = operacao.takeouts.find((t) => t.id === comando.retiradaId);
      if (!retirada) throw new HttpError(404, 'Retirada nao encontrada.');
      if (retirada.cashEntryId) throw new HttpError(409, 'Pedido convertido: corrija os itens no caixa antes de concluir a retirada.');
      retirada.items.push(comando.item as never);
      retirada.status = 'ocupada';
      return null;
    }

    case 'retirada.item.remover': {
      const retirada = operacao.takeouts.find((t) => t.id === comando.retiradaId);
      if (!retirada) throw new HttpError(404, 'Retirada nao encontrada.');
      if (retirada.cashEntryId) throw new HttpError(409, 'Pedido convertido: corrija os itens no caixa antes de concluir a retirada.');
      if (comando.indice >= retirada.items.length) {
        throw new HttpError(409, 'Este item ja foi removido. Recarregue a comanda.');
      }
      retirada.items.splice(comando.indice, 1);
      return null;
    }

    /* --------------------------- Fechamento -------------------------- */

    case 'comanda.pagar':
    case 'comanda.cancelar': {
      const pagando = comando.tipo === 'comanda.pagar';
      const naMesa = comando.alvo === 'mesa';

      const mesa = naMesa ? operacao.tables.find((m) => m.id === comando.alvoId) : null;
      const retirada = !naMesa ? operacao.takeouts.find((t) => t.id === comando.alvoId) : null;
      const origem = mesa ?? retirada;
      if (!origem) throw new HttpError(404, 'Comanda nao encontrada.');

      const itens = origem.items ?? [];
      const subtotal = somarItens(itens);

      /*
       * A taxa de serviço é recalculada AQUI, com a regra que está no banco.
       * Aceitar o valor do cliente deixaria qualquer aparelho fechar uma
       * mesa de R$ 400 cobrando 0% de serviço.
       */
      const taxa = pagando && naMesa ? subtotal * taxaServico : 0;
      if (pagando) validarPagamentos(subtotal + taxa, comando.payments);

      // Uma conversão já tem lançamento: atualizar, nunca cobrar/criar duas vezes.
      if (retirada?.cashEntryId) {
        const entry = operacao.cashEntries.find((e) => e.id === retirada.cashEntryId);
        if (!entry) throw new HttpError(409, 'Lançamento não encontrado no caixa atual. Recarregue a operação.');
        if (pagando && entry.paymentStatus === 'concluido') throw new HttpError(409, 'Este pedido já está pago. Confirme apenas a retirada.');
        if (pagando && subtotal > 0 && comando.payments.length === 0) throw new HttpError(400, 'Informe o pagamento recebido.');
        const credito = pagando ? comando.payments.filter(p => p.method === 'fiado').reduce((s, p) => s + p.amount, 0) : 0;
        entry.set({ payments: pagando ? comando.payments : entry.payments,
          orderStatus: pagando ? 'feito' : 'cancelado', paymentStatus: pagando ? 'concluido' : 'pendente',
          creditOriginalAmount: credito, creditPaid: 0, creditStatus: credito > 0 ? 'open' : 'none',
          closedAt: agora(), editadoEm: agora(), editadoPor: nomeDe(quem) });
        operacao.set('takeouts', operacao.takeouts.filter(t => t.id !== retirada.id));
        auditar(pagando ? 'retirada.paga' : 'retirada.cancelada', retirada.id, 'Retirada convertida: lançamento original atualizado, sem duplicação.');
        return pagando ? 'Pagamento registrado e retirada concluída.' : 'Retirada e venda canceladas. Confira eventual devolução ao cliente.';
      }

      // Cancelamento sem consumo não vira lançamento: não houve dinheiro.
      if (pagando || subtotal > 0) {
        const credito = pagando
          ? comando.payments.filter((p) => p.method === 'fiado').reduce((soma, p) => soma + p.amount, 0)
          : 0;
        operacao.cashEntries.unshift({
          id: `c-${agora()}-${Math.floor(Math.random() * 1000)}`,
          source: naMesa ? 'mesa' : 'retirada',
          label: naMesa ? `Mesa ${mesa!.label}` : `Retirada #${retirada!.label} · ${retirada!.customerName}`,
          customerName: retirada?.customerName ?? 'Consumo no salão',
          phone: retirada?.phone ?? '',
          items: itens,
          subtotal,
          serviceFee: taxa,
          deliveryFee: 0,
          total: subtotal + taxa,
          payments: pagando ? comando.payments : [],
          orderStatus: pagando ? 'feito' : 'cancelado',
          paymentStatus: pagando ? 'concluido' : 'pendente',
          creditStatus: credito > 0 ? 'open' : 'none',
          creditOriginalAmount: credito,
          creditPaid: 0,
          createdAt: agora(),
          closedAt: agora(),
        } as never);
        if (credito > 0) {
          auditar('fiado.criado', comando.alvoId, `Crédito de R$ ${credito.toFixed(2)} registrado.`);
        }
      }

      if (mesa) {
        mesa.status = 'livre';
        mesa.set('items', []);
      } else {
        operacao.set(
          'takeouts',
          operacao.takeouts.filter((t) => t.id !== comando.alvoId)
        );
      }

      return pagando ? 'Pagamento registrado.' : 'Comanda cancelada.';
    }

    /* ---------------------------- Entregas --------------------------- */

    case 'retirada.entregar': {
      const retirada = operacao.takeouts.find(t => t.id === comando.retiradaId);
      if (!retirada) throw new HttpError(404, 'Retirada não encontrada.');
      const entry = operacao.cashEntries.find(e => e.id === retirada.cashEntryId);
      if (!entry || entry.paymentStatus !== 'concluido' || entry.orderStatus !== 'feito') {
        throw new HttpError(409, 'Confirme o pagamento na comanda antes de entregar.');
      }
      operacao.set('takeouts', operacao.takeouts.filter(t => t.id !== retirada.id));
      auditar('retirada.entregue', retirada.id, 'Retirada concluída; pagamento já registrado, sem nova cobrança.');
      return 'Retirada concluída.';
    }

    case 'pedido.balcao': {
      const scheduled = operacao.scheduledDeliveries.find(d => d.id === comando.pedidoId);
      let pedido = scheduled ?? operacao.deliveries.find(d => d.id === comando.pedidoId);
      // Reabrir um turno recupera o livro-caixa, não recria entregas. Permitir
      // converter esse lançamento também, sem tocar em turnos ainda fechados.
      if (!pedido && operacao.cashOpen) {
        const saved = operacao.cashEntries.find(e => e.id === `c-${comando.pedidoId}` && e.source === 'delivery' && e.orderStatus !== 'cancelado');
        if (saved) {
          operacao.deliveries.push({ id: comando.pedidoId, code: saved.label.replace(/^.*#/, '').slice(0, 10),
            customerName: saved.customerName, phone: saved.phone, items: saved.items, total: saved.total,
            payments: saved.payments, deliveryFee: saved.deliveryFee, address: saved.address, notes: saved.notes,
            status: 'entregue', isDelivery: true, createdAt: saved.createdAt } as never);
          pedido = operacao.deliveries[operacao.deliveries.length - 1];
        }
      }
      if (!pedido) {
        if ([...operacao.takeouts, ...operacao.scheduledTakeouts].some(t => t.id === `t-${comando.pedidoId}`)) return 'Este pedido já foi convertido para balcão.';
        throw new HttpError(404, 'Pedido não está na operação. Para corrigir um dia encerrado, reabra o respectivo caixa no Registro.');
      }
      if (!scheduled && !operacao.cashOpen) throw new HttpError(409, 'Abra o caixa antes de converter este pedido.');
      if (scheduled && comando.paymentStatus === 'concluido') throw new HttpError(409, 'Agendamentos aguardam pagamento na abertura do caixa.');
      const total = somarItens(pedido.items);
      if (comando.paymentStatus === 'concluido') {
        if ((total > 0 && !comando.payments.length) || comando.payments.some(p => p.method === 'fiado')) {
          throw new HttpError(400, 'Para marcar como pago, informe o meio efetivamente recebido, sem fiado.');
        }
        validarPagamentos(total, comando.payments);
      }
      const cashId = `c-${pedido.id}`;
      if (operacao.cashArchive.some(e => e.id === cashId)) throw new HttpError(409, 'Reabra o caixa original no Registro antes de converter.');
      let entry = operacao.cashEntries.find(e => e.id === cashId);
      const previous = { delivery: pedido.toObject(), cashEntry: entry?.toObject(), operatorId: quem, createdAt: agora() };
      const takeoutId = `t-${pedido.id}`;
      const label = `Retirada #${pedido.code}`;
      if (!scheduled) {
        if (!entry) {
          operacao.cashEntries.unshift({ id: cashId, source: 'retirada', label, customerName: pedido.customerName,
            items: pedido.items, createdAt: pedido.createdAt } as never);
          entry = operacao.cashEntries[0];
        }
        entry.set({ source: 'retirada', label, customerName: pedido.customerName, phone: pedido.phone,
          notes: pedido.notes, items: pedido.items, subtotal: total, total, serviceFee: 0, deliveryFee: 0,
          payments: comando.paymentStatus === 'concluido' ? comando.payments : [],
          paymentStatus: comando.paymentStatus, orderStatus: 'feito', creditStatus: 'none',
          creditOriginalAmount: 0, creditPaid: 0,
          deliveredById: '', deliveredByName: '', address: {},
          conversionPrevious: previous, editadoEm: agora(), editadoPor: nomeDe(quem),
          closedAt: comando.paymentStatus === 'concluido' ? agora() : null });
      }
      (scheduled ? operacao.scheduledTakeouts : operacao.takeouts).unshift({
        id: takeoutId, label: pedido.code, customerName: pedido.customerName, phone: pedido.phone,
        status: 'ocupada', items: pedido.items, createdAt: pedido.createdAt, notes: pedido.notes,
        cashEntryId: scheduled ? '' : cashId, paymentStatus: comando.paymentStatus,
        payments: comando.paymentStatus === 'concluido' ? comando.payments : [],
      } as never);
      for (const [key, value] of operacao.kitchenStatus) {
        const prefix = `k-delivery-${pedido.id}::`;
        if (key.startsWith(prefix)) {
          operacao.kitchenStatus.set(`k-retirada-${takeoutId}::${key.slice(prefix.length)}`, value);
          operacao.kitchenStatus.delete(key);
        }
      }
      const list = scheduled ? 'scheduledDeliveries' : 'deliveries';
      operacao.set(list, operacao[list].filter(d => d.id !== pedido.id));
      auditar('pedido.convertido.balcao', pedido.id, `Entrega #${pedido.code} → balcão. Taxa removida: R$ ${Number(pedido.deliveryFee ?? 0).toFixed(2)}. Novo total: R$ ${total.toFixed(2)}. ${comando.paymentStatus === 'concluido' ? 'Pago' : 'Aguardando pagamento; conferir valores já recebidos'}.`);
      return scheduled ? 'Retirada agendada para a próxima abertura.' : 'Pedido movido para as retiradas. Taxa removida; confira eventual devolução e valores já recebidos.';
    }

    case 'pedido.criar':
    case 'pedido.agendar': {
      if (comando.tipo === 'pedido.agendar' && operacao.cashOpen) {
        throw new HttpError(409, 'Caixa aberto. Envie o pedido normalmente.');
      }
      const total = somarItens(comando.items);
      validarPagamentos(total, comando.payments);
      const destino = comando.tipo === 'pedido.agendar' ? operacao.scheduledDeliveries : operacao.deliveries;
      destino.unshift({
        id: `d-${agora()}-${Math.floor(Math.random() * 1000)}`,
        code: codigoCurto(),
        customerName: comando.customerName,
        phone: comando.phone,
        items: comando.items,
        total,
        payments: comando.payments,
        deliveryFee: 0,
        address: comando.address,
        notes: comando.notes,
        isDelivery: comando.isDelivery,
        status: 'novo',
        timeLabel: 'agora',
        distanceLabel: comando.address.mode === 'gps' ? '1,2 km' : '',
        createdAt: agora(),
      } as never);
      /*
       * O pedido nasce visível para a Recepção E para a Cozinha ao mesmo
       * tempo. A cozinha deriva a fila das entregas com status diferente de
       * "entregue", então não há nada a sincronizar: o pedido novo já está lá
       * antes de a recepção decidir a taxa, e a chapa começa a trabalhar.
       */
      return comando.tipo === 'pedido.agendar'
        ? 'Pedido agendado. Entrará na recepção e cozinha na próxima abertura.'
        : 'Pedido enviado para a recepção.';
    }

    case 'pedido.atualizar': {
      const pedido = operacao.deliveries.find((d) => d.id === comando.pedidoId);
      if (!pedido) throw new HttpError(404, 'Pedido nao encontrado.');
      if (pedido.isDelivery !== false && comando.isDelivery === false) {
        throw new HttpError(409, 'Para mudar para balcão, use Tipo de atendimento e confirme o pagamento na Recepção ou no Entregador.');
      }
      if (pedido.status === 'entregue' && !permissoes.includes('administracao')) {
        throw new HttpError(409, 'Pedido ja entregue nao pode ser alterado.');
      }

      pedido.customerName = comando.customerName;
      pedido.phone = comando.phone;
      pedido.set('items', comando.items);
      pedido.set('payments', comando.payments);
      pedido.paymentDeclaredOnly = false;
      pedido.set('address', comando.address);
      pedido.notes = comando.notes;
      pedido.isDelivery = comando.isDelivery;
      pedido.total = somarItens(comando.items) + Number(pedido.deliveryFee ?? 0);
      validarPagamentos(Number(pedido.total), comando.payments);

      /*
       * O lançamento no caixa acompanha a edição.
       *
       * Se o pedido já foi despachado, existe uma linha no caixa com os itens
       * antigos. Deixá-la para trás faria a Coca-Cola acrescentada aparecer
       * na cozinha e não no faturamento — o restaurante produziria de graça.
       */
      const noCaixa = operacao.cashEntries.find((e) => e.id === `c-${pedido.id}`);
      const noArquivo = operacao.cashArchive.find((e) => e.id === `c-${pedido.id}`);
      for (const lancamento of [noCaixa, noArquivo]) {
        if (!lancamento) continue;
        const subtotal = somarItens(comando.items);
        lancamento.set('items', comando.items);
        lancamento.set('payments', comando.payments);
        const credito = comando.payments
          .filter((payment) => payment.method === 'fiado')
          .reduce((sum, payment) => sum + payment.amount, 0);
        lancamento.creditOriginalAmount = credito;
        lancamento.creditPaid = Math.min(Number(lancamento.creditPaid ?? 0), credito);
        lancamento.creditStatus = credito <= 0
          ? 'none'
          : lancamento.creditPaid + 0.005 >= credito
            ? 'paid'
            : lancamento.creditPaid > 0
              ? 'partial'
              : 'open';
        lancamento.subtotal = subtotal;
        lancamento.total = subtotal + Number(lancamento.deliveryFee ?? 0);
        lancamento.customerName = comando.customerName;
        lancamento.phone = comando.phone;
        lancamento.set('address', comando.address);
        lancamento.notes = comando.notes;
        lancamento.editadoEm = agora();
        lancamento.editadoPor = quem;
      }

      auditar('pedido.editado', pedido.id, `Pedido #${pedido.code} editado.`);

      return 'Pedido atualizado.';
    }

    case 'pedido.aceitar': {
      const pedido = operacao.deliveries.find((d) => d.id === comando.pedidoId);
      if (!pedido) throw new HttpError(404, 'Pedido nao encontrado.');
      if (pedido.status !== 'novo') {
        // Duas recepções despachando o mesmo pedido criariam dois lançamentos.
        throw new HttpError(409, 'Este pedido ja foi despachado.');
      }

      const subtotal = somarItens(pedido.items);
      const total = Math.round((subtotal + comando.fee) * 100) / 100;
      const pagamentosAtualizados = pagamentosComTaxa(pedido.payments, comando.fee);
      if (pagamentosAtualizados.length > 0) {
        const soma = pagamentosAtualizados.reduce((valor, pagamento) => valor + pagamento.amount, 0);
        if (Math.abs(soma - total) > 0.005) {
          throw new HttpError(409, 'As formas de pagamento não correspondem ao total do pedido. Corrija o pedido antes de despachar.');
        }
      }
      pedido.deliveryFee = comando.fee;
      pedido.total = total;
      pedido.set('payments', pagamentosAtualizados);
      pedido.status = pedido.isDelivery === false ? 'entregue' : 'aceito';

      let entregadorId = comando.employeeId ?? '';
      if (pedido.isDelivery && !entregadorId) {
        throw new HttpError(400, 'Selecione um entregador ativo antes de despachar.');
      }
      if (pedido.isDelivery && entregadorId) {
        if (!entregadores.has(entregadorId)) {
          throw new HttpError(400, 'Selecione um entregador ativo com a tag Entregador.');
        }
        pedido.assignedCourierId = entregadorId;
        pedido.assignedCourierName = nomeDe(entregadorId);
      }

      /* Pago só no PIX já entra fechado; o resto fica pendente até a entrega. */
      const pagoAntes =
        comando.fee === 0 && !pedido.paymentDeclaredOnly && pedido.payments.length > 0 && pedido.payments.every((p) => p.method === 'pix');
      const credito = pedido.payments
        .filter((payment) => payment.method === 'fiado')
        .reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);

      operacao.cashEntries.unshift({
        id: `c-${pedido.id}`,
        source: pedido.isDelivery === false ? 'retirada' : 'delivery',
        label: `${pedido.isDelivery === false ? 'Retirada' : 'Entrega'} #${pedido.code}`,
        customerName: pedido.customerName,
        phone: pedido.phone,
        address: pedido.address,
        notes: pedido.notes,
        items: pedido.items,
        subtotal,
        serviceFee: 0,
        deliveryFee: comando.fee,
        total,
        payments: pagamentosAtualizados,
        orderStatus: 'feito',
        paymentStatus: pagoAntes ? 'concluido' : 'pendente',
        creditStatus: credito > 0 ? 'open' : 'none',
        creditOriginalAmount: credito,
        creditPaid: 0,
        deliveredById: '',
        deliveredByName: '',
        createdAt: agora(),
        closedAt: pagoAntes ? agora() : null,
      } as never);

      if (credito > 0) auditar('fiado.criado', pedido.id, `Crédito de R$ ${credito.toFixed(2)} registrado.`);
      auditar('pedido.despachado', pedido.id, `Pedido #${pedido.code} despachado.`);

      return 'Pedido despachado para o entregador!';
    }

    case 'pedido.rejeitar':
    case 'pedido.cancelar': {
      operacao.set(
        'deliveries',
        operacao.deliveries.filter((d) => d.id !== comando.pedidoId)
      );
      return comando.tipo === 'pedido.rejeitar' ? 'Pedido recusado.' : 'Pedido excluído!';
    }

    case 'pedido.avancar': {
      const pedido = operacao.deliveries.find((d) => d.id === comando.pedidoId);
      if (!pedido) throw new HttpError(404, 'Pedido nao encontrado.');

      const admin = permissoes.includes('administracao');
      const designado = pedido.assignedCourierId || pedido.deliveredById;
      if (!admin && designado !== quem) {
        throw new HttpError(403, 'Esta entrega está atribuída a outro entregador.');
      }
      if (pedido.status === 'novo') {
        throw new HttpError(409, 'A Gestão precisa atribuir um entregador antes de iniciar a entrega.');
      }
      if (pedido.status === 'entregue') {
        throw new HttpError(409, 'Esta entrega já foi concluída.');
      }

      const proximo = proximoStatus[pedido.status];
      if (pedido.status === 'aceito') {
        if (!designado) throw new HttpError(409, 'Entrega sem responsável. A Gestão precisa atribuir um entregador.');
        // A autoria não é inferida no despacho: ela nasce nesta transição.
        const autorId = admin ? designado : quem;
        pedido.deliveredById = autorId;
        pedido.deliveredByName = nomeDe(autorId) || pedido.assignedCourierName;
        pedido.assignedCourierId = designado;
        pedido.assignedCourierName = pedido.deliveredByName;
        const lancamento = operacao.cashEntries.find((e) => e.id === `c-${pedido.id}`)
          ?? operacao.cashArchive.find((e) => e.id === `c-${pedido.id}`);
        if (lancamento) {
          lancamento.deliveredById = autorId;
          lancamento.deliveredByName = pedido.deliveredByName;
        }
        auditar('entrega.iniciada', pedido.id, `Entrega #${pedido.code} iniciada por ${pedido.deliveredByName}.`);
      }
      pedido.status = proximo;

      /* Entregue quita o lançamento pendente: o entregador recebeu na porta. */
      if (proximo === 'entregue') {
        /* A autoria foi registrada na saída; concluir não a substitui. */
        if (!pedido.deliveredById) throw new HttpError(409, 'Entrega sem responsável. A Gestão precisa atribuir um entregador.');

        const lancamento = operacao.cashEntries.find(
          (e) => e.id === `c-${pedido.id}` && e.paymentStatus === 'pendente'
        );
        if (lancamento) {
          lancamento.paymentStatus = 'concluido';
          lancamento.closedAt = agora();
          lancamento.deliveredById = pedido.deliveredById;
          lancamento.deliveredByName = pedido.deliveredByName;
        }
      }
      return null;
    }

    case 'pedido.voltar': {
      const pedido = operacao.deliveries.find((d) => d.id === comando.pedidoId);
      if (!pedido) throw new HttpError(404, 'Pedido nao encontrado.');
      const taxaAnterior = Number(pedido.deliveryFee ?? 0);
      if (pedido.payments.length > 0 && Number(pedido.payments[0].amount) + 0.005 < taxaAnterior) {
        throw new HttpError(409, 'Corrija a primeira forma de pagamento antes de devolver o pedido à recepção.');
      }
      pedido.set('payments', pagamentosComTaxa(pedido.payments, -taxaAnterior));
      pedido.status = 'novo';
      pedido.assignedCourierId = '';
      pedido.assignedCourierName = '';
      pedido.deliveredById = '';
      pedido.deliveredByName = '';
      pedido.deliveryFee = 0;
      pedido.total = somarItens(pedido.items);

      /* O lançamento sai do caixa junto: o pedido voltou a não existir para
         o financeiro, e deixá-lo lá inflaria o faturamento do turno. */
      operacao.set(
        'cashEntries',
        operacao.cashEntries.filter((e) => e.id !== `c-${pedido.id}`)
      );
      return 'De volta à recepção!';
    }

    /* ------------------------------ Caixa ---------------------------- */

    case 'caixa.pagamento': {
      const lancamento = operacao.cashEntries.find((e) => e.id === comando.lancamentoId);
      if (!lancamento) throw new HttpError(404, 'Lancamento nao encontrado.');
      if (lancamento.paymentStatus === 'concluido') {
        throw new HttpError(409, 'Venda já concluída. Somente a Gestão pode corrigi-la.');
      }
      validarPagamentos(Number(lancamento.total ?? 0), comando.payments);
      lancamento.set('payments', comando.payments);
      lancamento.paymentStatus = 'concluido';
      lancamento.closedAt = agora();
      const fiado = comando.payments
        .filter((p) => p.method === 'fiado')
        .reduce((total, p) => total + p.amount, 0);
      lancamento.creditOriginalAmount = fiado;
      lancamento.creditPaid = 0;
      lancamento.creditStatus = fiado > 0 ? 'open' : 'none';
      const retiradaPaga = operacao.takeouts.find(t => t.cashEntryId === lancamento.id);
      if (retiradaPaga) retiradaPaga.set({ paymentStatus: 'concluido', payments: lancamento.payments });
      auditar(fiado > 0 ? 'fiado.criado' : 'caixa.pagamento', lancamento.id, fiado > 0
        ? `Crédito de R$ ${fiado.toFixed(2)} registrado para ${lancamento.customerName || lancamento.label}.`
        : `Pagamento de ${lancamento.label} registrado.`);
      return null;
    }

    case 'caixa.fechar': {
      if (!operacao.cashOpen) throw new HttpError(409, 'O caixa já está fechado.');
      const turnId = operacao.cashTurnId || `legacy-${agora()}`;
      const fechados = operacao.cashEntries.filter((e) => e.paymentStatus === 'concluido');

      const expected = { dinheiro: Number(operacao.openingCash ?? 0), cartao: 0, pix: 0 };
      for (const entry of fechados) {
        if (entry.orderStatus === 'cancelado') continue;
        let nonCash = 0;
        let hasCash = false;
        for (const p of entry.payments) {
          if (p.method === 'dinheiro') hasCash = true;
          else if (p.method !== 'fiado') {
            expected[p.method] += Number(p.amount ?? 0);
            nonCash += Number(p.amount ?? 0);
          } else nonCash += Number(p.amount ?? 0);
        }
        if (hasCash) expected.dinheiro += Math.max(0, Number(entry.total ?? 0) - nonCash);
      }
      for (const movement of operacao.cashMovements) {
        if (movement.type === 'suprimento') expected.dinheiro += Number(movement.amount ?? 0);
        else expected.dinheiro -= Number(movement.amount ?? 0);
      }
      const difference = {
        dinheiro: comando.counted.dinheiro - expected.dinheiro,
        cartao: comando.counted.cartao - expected.cartao,
        pix: comando.counted.pix - expected.pix,
      };
      operacao.cashClosures.unshift({
        id: `f-${agora()}-${Math.floor(Math.random() * 1000)}`,
        turnId,
        openedAt: operacao.cashOpenedAt,
        openingCash: operacao.openingCash,
        counted: comando.counted,
        expected,
        difference,
        movements: operacao.cashMovements.map((movement) => ({
          id: movement.id,
          type: movement.type,
          amount: movement.amount,
          reason: movement.reason,
          operatorId: movement.operatorId,
          operatorName: movement.operatorName,
          createdAt: movement.createdAt,
        })),
        operatorId: quem,
        operatorName: nomeDe(quem),
        createdAt: agora(),
      } as never);

      // Orders not yet dispatched/paid still need an auditable Register row.
      // They are canceled by the close, never counted as revenue.
      const archivedIds = new Set(operacao.cashEntries.map((entry) => entry.id));
      for (const delivery of operacao.deliveries) {
        const id = `c-${delivery.id}`;
        if (archivedIds.has(id)) continue;
        operacao.cashEntries.push({
          id, source: 'delivery', label: `Entrega #${delivery.code}`,
          customerName: delivery.customerName, phone: delivery.phone,
          address: delivery.address, notes: delivery.notes,
          items: delivery.items, subtotal: Number(delivery.total ?? 0) - Number(delivery.deliveryFee ?? 0),
          serviceFee: 0, deliveryFee: delivery.deliveryFee, total: delivery.total,
          payments: delivery.payments, orderStatus: 'cancelado', paymentStatus: 'pendente',
          motivoCancelamento: 'Pedido encerrado com o caixa, sem pagamento confirmado.',
          createdAt: delivery.createdAt, closedAt: agora(), cashTurnId: turnId,
        } as never);
        archivedIds.add(id);
      }
      for (const table of operacao.tables) {
        if (table.items.length === 0) continue;
        operacao.cashEntries.push({
          id: `c-fechamento-mesa-${table.id}-${agora()}`,
          source: 'mesa', label: `Mesa ${table.label}`, customerName: `Mesa ${table.label}`,
          items: table.items, subtotal: somarItens(table.items), serviceFee: 0, deliveryFee: 0,
          total: somarItens(table.items), payments: [], orderStatus: 'cancelado', paymentStatus: 'pendente',
          motivoCancelamento: 'Comanda pendente encerrada com o caixa.', createdAt: agora(),
          closedAt: agora(), cashTurnId: turnId,
        } as never);
      }
      for (const takeout of operacao.takeouts) {
        if (takeout.cashEntryId && archivedIds.has(takeout.cashEntryId)) continue;
        if (takeout.items.length === 0) continue;
        operacao.cashEntries.push({
          id: `c-fechamento-retirada-${takeout.id}`, source: 'retirada',
          label: `Retirada #${takeout.label}`, customerName: takeout.customerName, phone: takeout.phone,
          items: takeout.items, subtotal: somarItens(takeout.items), serviceFee: 0, deliveryFee: 0,
          total: somarItens(takeout.items), payments: [], orderStatus: 'cancelado', paymentStatus: 'pendente',
          motivoCancelamento: 'Comanda pendente encerrada com o caixa.', createdAt: takeout.createdAt,
          closedAt: agora(), cashTurnId: turnId,
        } as never);
      }

      /* Inclusive pendências ficam no histórico, mas fora do faturamento. */
      for (const entry of operacao.cashEntries) {
        entry.cashTurnId = turnId;
        if (entry.paymentStatus !== 'concluido') {
          entry.orderStatus = 'cancelado';
          entry.motivoCancelamento = 'Encerrado sem pagamento no fechamento do caixa.';
        }
      }
      operacao.set('cashArchive', [...operacao.cashEntries, ...operacao.cashArchive]);
      operacao.set('cashEntries', []);
      operacao.set('deliveries', []);
      operacao.set('takeouts', []);
      operacao.set('tables', operacao.tables.map((table) => ({
        id: table.id, label: table.label, seats: table.seats, area: table.area,
        status: 'livre', items: [],
      })));
      operacao.set('kitchenStatus', new Map());
      operacao.cashOpen = false;
      operacao.cashTurnId = '';
      operacao.cashOpenedAt = null;
      operacao.openingCash = 0;
      operacao.lastClosedAt = new Date();
      operacao.lastClosedBy = quem;
      operacao.set('cashMovements', []);
      auditar('caixa.fechado', '', `Turno fechado com ${fechados.length} lançamento(s).`);
      return `Turno fechado com ${fechados.length} lançamento(s).`;
    }

    case 'caixa.abrir': {
      if (operacao.cashOpen) throw new HttpError(409, 'Já existe um caixa aberto neste restaurante.');
      operacao.cashOpen = true;
      operacao.cashTurnId = `turno-${agora()}-${Math.floor(Math.random() * 1000)}`;
      operacao.cashOpenedAt = agora();
      operacao.openingCash = comando.openingCash;
      for (const id of operacao.scheduledTables) {
        const table = operacao.tables.find((t) => t.id === id);
        if (table) { table.status = 'ocupada'; table.set('items', []); }
      }
      operacao.set('scheduledTables', []);
      operacao.set('takeouts', [...operacao.scheduledTakeouts, ...operacao.takeouts]);
      operacao.set('scheduledTakeouts', []);
      operacao.set('deliveries', [...operacao.scheduledDeliveries, ...operacao.deliveries]);
      const scheduled = operacao.scheduledDeliveries.length;
      operacao.set('scheduledDeliveries', []);
      auditar('caixa.aberto', operacao.cashTurnId, `Caixa aberto com R$ ${comando.openingCash.toFixed(2)} em espécie; ${scheduled} pedido(s) agendado(s) liberado(s).`);
      return `Caixa aberto. ${scheduled} pedido(s) agendado(s) liberado(s).`;
    }

    case 'caixa.turno.reabrir': {
      if (operacao.cashOpen) throw new HttpError(409, 'Feche o caixa atual antes de reabrir um turno anterior.');
      const closure = operacao.cashClosures.find((c) => c.id === comando.closureId);
      if (!closure) throw new HttpError(404, 'Fechamento não encontrado.');
      if (closure.reopenedAt) throw new HttpError(409, 'Este fechamento já foi reaberto.');
      const turnId = closure.turnId || `legacy-${closure.createdAt}`;
      operacao.cashOpen = true;
      operacao.cashTurnId = turnId;
      operacao.cashOpenedAt = closure.openedAt ?? closure.createdAt;
      operacao.openingCash = closure.openingCash ?? 0;
      const previousClosure = operacao.cashClosures
        .filter((c) => c.createdAt < closure.createdAt)
        .sort((a, b) => b.createdAt - a.createdAt)[0];
      const belongsToTurn = (entry: (typeof operacao.cashArchive)[number]) =>
        entry.cashTurnId === turnId || (!entry.cashTurnId
          && entry.createdAt > (closure.openedAt ?? previousClosure?.createdAt ?? 0)
          && entry.createdAt <= closure.createdAt);
      const entries = operacao.cashArchive.filter(belongsToTurn);
      operacao.set('cashEntries', entries);
      operacao.set('cashArchive', operacao.cashArchive.filter((e) => !belongsToTurn(e)));
      closure.reopenedAt = agora();
      auditar('caixa.turno.reaberto', closure.id, `Fechamento de ${new Date(closure.createdAt).toLocaleDateString('pt-BR')} reaberto.`);
      return 'Caixa reaberto. Pedidos agendados permanecem aguardando a próxima abertura normal.';
    }

    case 'caixa.movimento': {
      operacao.cashMovements.unshift({
        id: `m-${agora()}-${Math.floor(Math.random() * 1000)}`,
        type: comando.movementType,
        amount: comando.amount,
        reason: comando.reason,
        operatorId: quem,
        operatorName: nomeDe(quem),
        createdAt: agora(),
      } as never);
      auditar(
        'caixa.saida',
        '',
        `Saída de dinheiro de R$ ${comando.amount.toFixed(2)}: ${comando.reason}`
      );
      return 'Saída de dinheiro registrada.';
    }

    case 'caixa.reabrir': {
      const index = operacao.cashArchive.findIndex((e) => e.id === comando.lancamentoId);
      if (index < 0) throw new HttpError(404, 'Lançamento arquivado não encontrado.');
      const [lancamento] = operacao.cashArchive.splice(index, 1);
      operacao.cashEntries.unshift(lancamento);
      auditar('caixa.reaberto', lancamento.id, `${lancamento.label} reaberto para correção.`);
      return 'Lançamento reaberto.';
    }

    case 'fiado.abater': {
      const lancamento =
        operacao.cashEntries.find((e) => e.id === comando.lancamentoId) ??
        operacao.cashArchive.find((e) => e.id === comando.lancamentoId);
      if (!lancamento || !['open', 'partial'].includes(lancamento.creditStatus)) {
        throw new HttpError(404, 'Crédito em aberto não encontrado.');
      }
      const restante = Number(lancamento.creditOriginalAmount ?? 0) - Number(lancamento.creditPaid ?? 0);
      if (comando.amount > restante + 0.005) throw new HttpError(400, 'O abatimento excede o saldo devedor.');
      lancamento.creditPaid = Number(lancamento.creditPaid ?? 0) + comando.amount;
      lancamento.creditStatus = lancamento.creditPaid + 0.005 >= lancamento.creditOriginalAmount ? 'paid' : 'partial';
      lancamento.creditPayments.push({
        amount: comando.amount,
        operatorId: quem,
        operatorName: nomeDe(quem),
        createdAt: agora(),
      } as never);
      auditar('fiado.abatido', lancamento.id, `Abatimento de R$ ${comando.amount.toFixed(2)} em ${lancamento.label}.`);
      return lancamento.creditStatus === 'paid' ? 'Dívida quitada.' : 'Abatimento registrado.';
    }

    case 'pedido.entregador': {
      const pedido = operacao.deliveries.find((d) => d.id === comando.pedidoId);
      if (!pedido) throw new HttpError(404, 'Pedido nao encontrado.');
      if (pedido.status === 'novo' || pedido.isDelivery === false) {
        throw new HttpError(409, 'Somente entregas despachadas podem ser atribuídas.');
      }

      if (!entregadores.has(comando.employeeId)) {
        throw new HttpError(400, 'O funcionário selecionado não possui a tag Entregador.');
      }
      pedido.assignedCourierId = comando.employeeId;
      pedido.assignedCourierName = nomeDe(comando.employeeId);
      // Após a saída, somente a Gestão pode corrigir a autoria efetiva.
      if (pedido.status === 'a_caminho' || pedido.status === 'entregue') {
        pedido.deliveredById = comando.employeeId;
        pedido.deliveredByName = pedido.assignedCourierName;
      }

      /* O caixa espelha, senão o placar e o extrato discordariam. */
      const lancamento =
        operacao.cashEntries.find((e) => e.id === `c-${pedido.id}`) ??
        operacao.cashArchive.find((e) => e.id === `c-${pedido.id}`);
      if (lancamento && (pedido.status === 'a_caminho' || pedido.status === 'entregue')) {
        lancamento.deliveredById = pedido.deliveredById;
        lancamento.deliveredByName = pedido.deliveredByName;
      }
      auditar('entrega.reatribuida', pedido.id, `Entrega #${pedido.code} atribuída a ${pedido.assignedCourierName}.`);
      return `Entrega atribuída a ${pedido.assignedCourierName || 'outro entregador'}.`;
    }

    /* ------------------------- Caixa: correções ---------------------- */

    case 'caixa.editar': {
      /*
       * Procura no turno E no arquivo. A correção quase sempre aparece depois
       * do fechamento, quando alguém confere o extrato do dia seguinte.
       */
      const lancamento =
        operacao.cashEntries.find((e) => e.id === comando.lancamentoId) ??
        operacao.cashArchive.find((e) => e.id === comando.lancamentoId);

      if (!lancamento) throw new HttpError(404, 'Lancamento nao encontrado.');

      if (comando.items) {
        lancamento.set('items', comando.items);
        lancamento.subtotal = somarItens(comando.items);
      }
      if (lancamento.source === 'retirada' && comando.deliveryFee) throw new HttpError(400, 'Retirada no balcão não tem taxa de entrega.');
      if (comando.deliveryFee !== undefined) lancamento.deliveryFee = comando.deliveryFee;
      if (comando.payments) {
        lancamento.set('payments', comando.payments);
        const credito = comando.payments
          .filter((payment) => payment.method === 'fiado')
          .reduce((sum, payment) => sum + payment.amount, 0);
        lancamento.creditOriginalAmount = credito;
        lancamento.creditPaid = Math.min(Number(lancamento.creditPaid ?? 0), credito);
        lancamento.creditStatus = credito <= 0
          ? 'none'
          : lancamento.creditPaid + 0.005 >= credito
            ? 'paid'
            : lancamento.creditPaid > 0
              ? 'partial'
              : 'open';
      }

      /* O total é sempre RECALCULADO, nunca recebido do cliente. */
      lancamento.total =
        Number(lancamento.subtotal ?? 0) +
        Number(lancamento.serviceFee ?? 0) +
        Number(lancamento.deliveryFee ?? 0);
      if (comando.payments) validarPagamentos(Number(lancamento.total ?? 0), comando.payments);
      const retiradaEditada = operacao.takeouts.find(t => t.cashEntryId === lancamento.id);
      if (retiradaEditada) {
        if (comando.items && !comando.payments) validarPagamentos(Number(lancamento.total), lancamento.payments as never);
        retiradaEditada.set({ items: lancamento.items, payments: lancamento.payments, paymentStatus: lancamento.paymentStatus });
      }

      lancamento.editadoEm = agora();
      lancamento.editadoPor = quem;
      auditar('caixa.editado', lancamento.id, `${lancamento.label} corrigido.`);
      return 'Lançamento corrigido.';
    }

    case 'caixa.cancelar': {
      const lancamento =
        operacao.cashEntries.find((e) => e.id === comando.lancamentoId) ??
        operacao.cashArchive.find((e) => e.id === comando.lancamentoId);

      if (!lancamento) throw new HttpError(404, 'Lancamento nao encontrado.');

      /*
       * O lançamento vira FANTASMA: continua na lista, com a marca de
       * cancelado, e some do faturamento. Apagá-lo esconderia o erro de quem
       * confere; deixá-lo somando inflaria a receita da noite.
       */
      lancamento.orderStatus = 'cancelado';
      lancamento.paymentStatus = 'pendente';
      lancamento.motivoCancelamento = comando.motivo;
      operacao.set('takeouts', operacao.takeouts.filter(t => t.cashEntryId !== lancamento.id));
      lancamento.editadoEm = agora();
      lancamento.editadoPor = quem;
      auditar('caixa.cancelado', lancamento.id, `${lancamento.label} cancelado: ${comando.motivo || 'sem motivo'}.`);
      return 'Venda cancelada. Ela continua no Registro, fora do faturamento.';
    }

    /* ----------------------------- Cozinha --------------------------- */

    case 'cozinha.status': {
      for (const saguao of comando.saguoes) {
        operacao.kitchenStatus.set(`${comando.comandaId}::${saguao}`, comando.status);
      }
      return null;
    }
  }
}

export const runOperationCommand = asyncHandler(async (req: Request, res: Response) => {
  const comando = comandoSchema.parse(req.body);
  if (!commandAllowed(req.device!.planType, comando)) throw new HttpError(403, 'Esta função não está incluída no plano do restaurante.');

  const exigidas = PERMISSAO[comando.tipo];
  const minhas = req.device!.perms ?? [];
  if (!exigidas || (!minhas.includes('administracao') && !exigidas.some((p) => minhas.includes(p)))) {
    throw new HttpError(403, 'Sua funcao nao permite esta acao.');
  }

  const appId = req.device!.app;
  /*
   * O token guarda o id do funcionário, não o nome — nome muda e o token é
   * assinado. Para a auditoria do fechamento o id é o que importa: ele liga
   * o turno à pessoa mesmo depois de uma troca de nome.
   */
  const quem = req.device!.sub;

  /*
   * Tentativas contra conflito de versão.
   *
   * Dois aparelhos salvando ao mesmo tempo fazem o Mongoose recusar a segunda
   * escrita (`VersionError`), porque o documento mudou depois da leitura.
   * Recarregar e reaplicar é o certo: o comando é uma intenção ("mesa 4
   * pagou"), não um retrato do estado, então reaplicá-lo sobre o estado novo
   * dá o resultado correto. Sem isso, a última escrita apagaria a primeira em
   * silêncio — o item que o outro garçom acabou de lançar sumiria.
   */
  let mensagem: string | null = null;

  for (let tentativa = 0; tentativa < 4; tentativa += 1) {
    const { operacao, taxaServico, nomes, entregadores } = await carregar(appId);
    mensagem = aplicar(operacao, comando, quem, taxaServico, nomes, entregadores, minhas);

    try {
      await operacao.save();
      emitOperationChanged(appId, { tipo: comando.tipo, por: quem });
      return res.json({ ok: true, data: { ...serializar(operacao, minhas, quem, req.device!.planType), mensagem } });
    } catch (erro) {
      const nome = (erro as { name?: string })?.name;
      if (nome !== 'VersionError' && nome !== 'ParallelSaveError') throw erro;
      // Conflito: recarrega e tenta de novo.
    }
  }

  throw new HttpError(
    409,
    'O restaurante esta com muitas alteracoes ao mesmo tempo. Tente novamente.'
  );
});
