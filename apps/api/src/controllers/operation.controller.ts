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
  method: z.enum(['pix', 'dinheiro', 'cartao']),
  amount: z.number().min(0).max(999_999),
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
  }),
  z.object({
    tipo: z.literal('pedido.aceitar'),
    pedidoId: z.string().min(1),
    fee: z.number().min(0).max(999),
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
  z.object({ tipo: z.literal('caixa.fechar') }),

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
  'mesa.item.remover': ['salao'],

  'retirada.criar': ['salao'],
  'retirada.status': ['salao'],
  'retirada.remover': ['salao'],
  'retirada.item.adicionar': ['salao'],
  'retirada.item.remover': ['salao'],

  'comanda.pagar': ['salao', 'caixa'],
  'comanda.cancelar': ['salao', 'caixa'],

  'pedido.criar': ['cliente', 'recepcao'],
  'pedido.atualizar': ['cliente', 'recepcao'],
  'pedido.aceitar': ['recepcao'],
  'pedido.rejeitar': ['recepcao'],
  'pedido.avancar': ['entregador', 'recepcao'],
  'pedido.voltar': ['entregador', 'recepcao'],
  'pedido.cancelar': ['entregador', 'recepcao'],

  'caixa.pagamento': ['caixa'],
  'caixa.fechar': ['caixa'],

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
};

async function carregar(appId: string): Promise<Carregada> {
  const app = await AppProject.findById(appId).select('tables dining').lean();
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

  return { operacao, taxaServico };
}

/** Devolve o estado como o aplicativo espera consumir. */
function serializar(operacao: OperationDoc) {
  return {
    tables: operacao.tables,
    takeouts: operacao.takeouts,
    deliveries: operacao.deliveries,
    cashEntries: operacao.cashEntries,
    cashArchive: operacao.cashArchive,
    kitchenStatus: Object.fromEntries(operacao.kitchenStatus ?? new Map()),
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

  return res.json({ ok: true, data: serializar(operacao) });
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
  taxaServico: number
): string | null {
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

      // Cancelamento sem consumo não vira lançamento: não houve dinheiro.
      if (pagando || subtotal > 0) {
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
          createdAt: agora(),
          closedAt: agora(),
        } as never);
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
        status: 'novo',
        timeLabel: 'agora',
        distanceLabel: comando.address.mode === 'gps' ? '1,2 km' : '',
        createdAt: agora(),
      } as never);
      return 'Pedido enviado para a recepção.';
    }

    case 'pedido.atualizar': {
      const pedido = operacao.deliveries.find((d) => d.id === comando.pedidoId);
      if (!pedido) throw new HttpError(404, 'Pedido nao encontrado.');
      if (pedido.status === 'entregue') {
        throw new HttpError(409, 'Pedido ja entregue nao pode ser alterado.');
      }

      pedido.customerName = comando.customerName;
      pedido.phone = comando.phone;
      pedido.set('items', comando.items);
      pedido.set('payments', comando.payments);
      pedido.set('address', comando.address);
      pedido.total = somarItens(comando.items) + Number(pedido.deliveryFee ?? 0);
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
      pedido.deliveryFee = comando.fee;
      pedido.total = subtotal + comando.fee;
      pedido.status = 'aceito';

      /* Pago só no PIX já entra fechado; o resto fica pendente até a entrega. */
      const pagoAntes =
        pedido.payments.length > 0 && pedido.payments.every((p) => p.method === 'pix');

      operacao.cashEntries.unshift({
        id: `c-${pedido.id}`,
        source: 'delivery',
        label: `Entrega #${pedido.code}`,
        customerName: pedido.customerName,
        phone: pedido.phone,
        items: pedido.items,
        subtotal,
        serviceFee: 0,
        deliveryFee: comando.fee,
        total: subtotal + comando.fee,
        payments: pedido.payments,
        orderStatus: 'feito',
        paymentStatus: pagoAntes ? 'concluido' : 'pendente',
        createdAt: agora(),
        closedAt: pagoAntes ? agora() : null,
      } as never);

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

      const proximo = proximoStatus[pedido.status];
      pedido.status = proximo;

      /* Entregue quita o lançamento pendente: o entregador recebeu na porta. */
      if (proximo === 'entregue') {
        const lancamento = operacao.cashEntries.find(
          (e) => e.id === `c-${pedido.id}` && e.paymentStatus === 'pendente'
        );
        if (lancamento) {
          lancamento.paymentStatus = 'concluido';
          lancamento.closedAt = agora();
        }
      }
      return null;
    }

    case 'pedido.voltar': {
      const pedido = operacao.deliveries.find((d) => d.id === comando.pedidoId);
      if (!pedido) throw new HttpError(404, 'Pedido nao encontrado.');
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
      lancamento.set('payments', comando.payments);
      lancamento.paymentStatus = 'concluido';
      lancamento.closedAt = agora();
      return null;
    }

    case 'caixa.fechar': {
      const fechados = operacao.cashEntries.filter((e) => e.paymentStatus === 'concluido');
      if (fechados.length === 0) throw new HttpError(409, 'Nao ha lancamentos concluidos para fechar.');

      /* O turno sai da tela, mas continua auditável no Registro. */
      operacao.set('cashArchive', [...fechados, ...operacao.cashArchive]);
      operacao.set(
        'cashEntries',
        operacao.cashEntries.filter((e) => e.paymentStatus !== 'concluido')
      );
      operacao.lastClosedAt = new Date();
      operacao.lastClosedBy = quem;
      return `Turno fechado com ${fechados.length} lançamento(s).`;
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
  if (!exigidas || !exigidas.some((p) => minhas.includes(p))) {
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
    const { operacao, taxaServico } = await carregar(appId);
    mensagem = aplicar(operacao, comando, quem, taxaServico);

    try {
      await operacao.save();
      emitOperationChanged(appId, { tipo: comando.tipo, por: quem });
      return res.json({ ok: true, data: { ...serializar(operacao), mensagem } });
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
