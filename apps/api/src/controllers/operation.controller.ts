import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { AppProject } from '../models/AppProject.js';
import { Operation, type OperationDoc } from '../models/Operation.js';
import { HttpError } from '../utils/httpError.js';
import { emitOperationChanged } from '../realtime/io.js';

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
  'mesa.status': ['salao'],
  'mesa.item.adicionar': ['salao'],
  'mesa.item.remover': ['administracao'],

  'retirada.criar': ['recepcao'],
  'retirada.status': ['recepcao'],
  'retirada.remover': ['administracao'],
  'retirada.item.adicionar': ['recepcao'],
  'retirada.item.remover': ['administracao'],

  'comanda.pagar': ['salao', 'recepcao', 'caixa'],
  'comanda.cancelar': ['administracao'],

  'pedido.criar': ['cliente', 'recepcao'],
  'pedido.atualizar': ['administracao'],
  'pedido.aceitar': ['administracao'],
  'pedido.rejeitar': ['administracao'],
  'pedido.avancar': ['entregador'],
  'pedido.voltar': ['administracao'],
  'pedido.cancelar': ['administracao'],

  'caixa.pagamento': ['caixa'],
  'caixa.editar': ['administracao'],
  'caixa.cancelar': ['administracao'],
  'caixa.fechar': ['caixa'],
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
  const app = await AppProject.findById(appId).select('tables dining employees roles').lean();
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
  if (!operacao) operacao = new Operation({ app: appId, tables: [] });

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
function serializar(operacao: OperationDoc, permissions: string[] = [], employeeId = '') {
  const admin = permissions.includes('administracao');
  const can = (...needed: string[]) => admin || needed.some((permission) => permissions.includes(permission));
  const deliveries = can('cliente', 'recepcao', 'cozinha', 'entregador')
    ? permissions.includes('entregador') && !admin && !permissions.includes('recepcao') && !permissions.includes('cozinha')
      ? operacao.deliveries.filter((delivery) => delivery.deliveredById === employeeId)
      : operacao.deliveries
    : [];
  return {
    tables: can('salao', 'cozinha') ? operacao.tables : [],
    takeouts: can('recepcao', 'cozinha') ? operacao.takeouts : [],
    deliveries,
    cashEntries: can('caixa') ? operacao.cashEntries : [],
    cashArchive: can('caixa') ? operacao.cashArchive : [],
    cashMovements: can('caixa') ? operacao.cashMovements : [],
    cashClosures: admin ? operacao.cashClosures : [],
    auditLog: admin ? operacao.auditLog : [],
    kitchenStatus: can('cozinha') ? Object.fromEntries(operacao.kitchenStatus ?? new Map()) : {},
    lastClosedAt: operacao.lastClosedAt,
    lastClosedBy: operacao.lastClosedBy,
  };
}

/* ------------------------------------------------------------------ */
/* GET /api/device/operation                                           */
/* ------------------------------------------------------------------ */

export const getOperation = asyncHandler(async (req: Request, res: Response) => {
  const appId = req.device!.app;
  const { operacao } = await carregar(appId);

  // A sincronização das mesas pode ter alterado o documento.
  if (operacao.isNew || operacao.isModified()) await operacao.save();

  return res.json({ ok: true, data: serializar(operacao, req.device!.perms, req.device!.sub) });
});

/* ------------------------------------------------------------------ */
/* POST /api/device/operation                                          */
/* ------------------------------------------------------------------ */

/**
 * Aplica o comando ao documento. Puro: só mexe no objeto recebido.
 *
 * Devolve uma mensagem para a tela quando há algo a dizer ao funcionário.
 */
function aplicar(
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

    case 'retirada.status': {
      const retirada = operacao.takeouts.find((t) => t.id === comando.retiradaId);
      if (!retirada) throw new HttpError(404, 'Retirada nao encontrada.');
      retirada.status = comando.status;
      if (comando.status === 'livre') retirada.set('items', []);
      return null;
    }

    case 'retirada.remover': {
      operacao.set(
        'takeouts',
        operacao.takeouts.filter((t) => t.id !== comando.retiradaId)
      );
      return null;
    }

    case 'retirada.item.adicionar': {
      const retirada = operacao.takeouts.find((t) => t.id === comando.retiradaId);
      if (!retirada) throw new HttpError(404, 'Retirada nao encontrada.');
      retirada.items.push(comando.item as never);
      retirada.status = 'ocupada';
      return null;
    }

    case 'retirada.item.remover': {
      const retirada = operacao.takeouts.find((t) => t.id === comando.retiradaId);
      if (!retirada) throw new HttpError(404, 'Retirada nao encontrada.');
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

    case 'pedido.criar': {
      const total = somarItens(comando.items);
      validarPagamentos(total, comando.payments);
      operacao.deliveries.unshift({
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
      return 'Pedido enviado para a recepção.';
    }

    case 'pedido.atualizar': {
      const pedido = operacao.deliveries.find((d) => d.id === comando.pedidoId);
      if (!pedido) throw new HttpError(404, 'Pedido nao encontrado.');
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
        pedido.deliveredById = entregadorId;
        pedido.deliveredByName = nomeDe(entregadorId);
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
        deliveredById: pedido.deliveredById,
        deliveredByName: pedido.deliveredByName,
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
      if (!admin && pedido.deliveredById !== quem) {
        throw new HttpError(403, 'Esta entrega está atribuída a outro entregador.');
      }
      if (pedido.status === 'novo') {
        throw new HttpError(409, 'A Gestão precisa atribuir um entregador antes de iniciar a entrega.');
      }

      const proximo = proximoStatus[pedido.status];
      pedido.status = proximo;

      /* Entregue quita o lançamento pendente: o entregador recebeu na porta. */
      if (proximo === 'entregue') {
        /* A autoria é definida pela Gestão no despacho e nunca é inferida
           pelo aparelho que avançou o status. */
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
      auditar(fiado > 0 ? 'fiado.criado' : 'caixa.pagamento', lancamento.id, fiado > 0
        ? `Crédito de R$ ${fiado.toFixed(2)} registrado para ${lancamento.customerName || lancamento.label}.`
        : `Pagamento de ${lancamento.label} registrado.`);
      return null;
    }

    case 'caixa.fechar': {
      const fechados = operacao.cashEntries.filter((e) => e.paymentStatus === 'concluido');
      if (fechados.length === 0) throw new HttpError(409, 'Nao ha lancamentos concluidos para fechar.');

      const expected = { dinheiro: 0, cartao: 0, pix: 0 };
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
        id: `f-${agora()}`,
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

      /* O turno sai da tela, mas continua auditável no Registro. */
      operacao.set('cashArchive', [...fechados, ...operacao.cashArchive]);
      operacao.set(
        'cashEntries',
        operacao.cashEntries.filter((e) => e.paymentStatus !== 'concluido')
      );
      /* O fechamento encerra também a fila diária do entregador. O histórico
         financeiro continua preservado em cashArchive. */
      operacao.set(
        'deliveries',
        operacao.deliveries.filter((delivery) => delivery.status !== 'entregue')
      );
      operacao.lastClosedAt = new Date();
      operacao.lastClosedBy = quem;
      operacao.set('cashMovements', []);
      auditar('caixa.fechado', '', `Turno fechado com ${fechados.length} lançamento(s).`);
      return `Turno fechado com ${fechados.length} lançamento(s).`;
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

      pedido.deliveredById = comando.employeeId;
      pedido.deliveredByName = nomeDe(comando.employeeId);
      if (!entregadores.has(comando.employeeId)) {
        throw new HttpError(400, 'O funcionário selecionado não possui a tag Entregador.');
      }

      /* O caixa espelha, senão o placar e o extrato discordariam. */
      const lancamento =
        operacao.cashEntries.find((e) => e.id === `c-${pedido.id}`) ??
        operacao.cashArchive.find((e) => e.id === `c-${pedido.id}`);
      if (lancamento) {
        lancamento.deliveredById = pedido.deliveredById;
        lancamento.deliveredByName = pedido.deliveredByName;
      }
      auditar('entrega.reatribuida', pedido.id, `Entrega #${pedido.code} atribuída a ${pedido.deliveredByName}.`);
      return `Entrega atribuída a ${pedido.deliveredByName || 'outro entregador'}.`;
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
      return res.json({ ok: true, data: { ...serializar(operacao, minhas, quem), mensagem } });
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
