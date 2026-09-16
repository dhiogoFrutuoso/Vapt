import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { AppProject } from '../models/AppProject.js';
import { HttpError } from '../utils/httpError.js';
import { signMagicPayload, MAGIC_TTL_MINUTES } from '../utils/magicLink.js';
import { z } from 'zod';
import { Operation } from '../models/Operation.js';
import { emitNewOrder } from '../realtime/io.js';

/**
 * Cardapio publico do restaurante — o que o cliente final ve.
 *
 * Rota SEM autenticacao: qualquer pessoa com o link abre. Por isso a montagem
 * da resposta e por LISTA BRANCA, campo a campo, e nunca por exclusao.
 *
 * A diferenca importa: com `.select('-employees -roles')` bastaria alguem
 * adicionar um campo sensivel ao schema para ele vazar em silencio no dia
 * seguinte. Montando explicitamente, um campo novo so aparece aqui se alguem
 * escrever a linha — o vazamento passa a exigir uma acao, nao um esquecimento.
 *
 * NAO sai daqui, em nenhuma hipotese:
 *   employees (com os codigos de acesso), roles, owner, tracking, selectedPlan.
 */

const imageUrl = (id: unknown) => (id ? `${env.publicUrl}/api/images/${String(id)}` : null);

/**
 * Portao do cardapio publico.
 *
 * O criterio e o PLANO, nao o `status`. `status` nasce `rascunho` e nada no
 * painel o promove, entao amarrar a ele fazia TODO cardapio responder 404 —
 * inclusive o de quem ja e cliente oficial. O plano e a decisao comercial e
 * so ele deveria mandar aqui.
 *
 * Aplicativo de TESTE nao tem cardapio publico por definicao: ele existe para
 * o dono ver como ficaria, nao para receber pedido de cliente real.
 *
 * `pausado` continua fechando a loja — e o dono dizendo "hoje nao atendo", e
 * um pedido que ninguem recebe e pior do que a pagina nao abrir.
 */
function garantirCardapioPublico(app: Record<string, any>): void {
  if (!String(app.appPlanType ?? '').startsWith('OFICIAL')) {
    throw new HttpError(404, 'Este cardapio ainda nao foi publicado.');
  }
  if (app.status === 'pausado') {
    throw new HttpError(404, 'Este cardapio nao esta disponivel no momento.');
  }
}

export const getPublicApp = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  /*
   * Aceita id ou slug. O dono divulga o link nas redes; um slug legivel
   * ("bar-do-cais") converte melhor que um ObjectId de 24 caracteres.
   */
  const filtro = mongoose.isValidObjectId(id) ? { _id: id } : { slug: String(id).toLowerCase() };

  /*
   * `lean()` devolve os subdocumentos com os tipos do schema. Aqui eles sao
   * lidos como dados crus e remapeados campo a campo, entao um tipo indexavel
   * expressa melhor a intencao do que repetir a forma inteira do schema.
   */
  const app = (await AppProject.findOne(filtro)
    .select('name slug code businessType brand delivery categories products promotions status appPlanType')
    .lean()) as Record<string, any> | null;

  if (!app) throw new HttpError(404, 'Restaurante nao encontrado.');

  garantirCardapioPublico(app);

  const brand = (app.brand ?? {}) as Record<string, unknown>;
  const delivery = (app.delivery ?? {}) as Record<string, unknown>;

  return res.json({
    ok: true,
    data: {
      id: String(app._id),
      slug: app.slug,
      name: app.name,
      businessType: app.businessType,

      branding: {
        storeName: app.name,
        tagline: (brand.tagline as string) ?? '',
        logoUrl: imageUrl(brand.logo),
        coverUrl: imageUrl(brand.cover),
        primaryColor: (brand.primaryColor as string) ?? '#FF6B2C',
        secondaryColor: (brand.secondaryColor as string) ?? '#111827',
        theme: (brand.theme as string) ?? 'claro',
      },

      delivery: {
        enabled: delivery.enabled !== false,
        fee: Number(delivery.fee ?? 0),
        minOrder: Number(delivery.minOrder ?? 0),
        estimatedMinutes: Number(delivery.estimatedMinutes ?? 35),
        /*
         * O numero e publico por natureza: e para ele que o cliente manda o
         * pedido. So os digitos, para montar o link do wa.me sem tratar
         * formatacao no navegador.
         */
        whatsapp: String(delivery.whatsapp ?? '').replace(/\D/g, ''),
      },

      categories: (app.categories ?? []).map((c: Record<string, any>) => ({
        id: String(c._id),
        name: c.name,
        imageUrl: imageUrl(c.image),
      })),

      products: (app.products ?? []).map((p: Record<string, any>) => ({
          id: String(p._id),
          name: p.name,
          description: p.description ?? '',
          price: Number(p.price ?? 0),
          pricingType: p.pricingType ?? 'unit',
          category: p.category ?? '',
          imageUrl: imageUrl(p.image),
          isFeatured: p.isFeatured === true,
          available: p.available !== false,
        })),

      promotions: (app.promotions ?? [])
        .filter((p: Record<string, any>) => p.active === true)
        .map((p: Record<string, any>) => ({
          id: String(p._id),
          type: p.type,
          name: p.name,
          description: p.description ?? '',
          promotionalPrice: Number(p.promotionalPrice ?? 0),
          comboItems: (p.comboItems ?? []).map((x: unknown) => String(x)),
          targetProductId: p.targetProductId ? String(p.targetProductId) : null,
        })),
    },
  });
});

/* ------------------------------------------------------------------ */
/* POST /api/public/apps/:id/magic-link                                */
/* ------------------------------------------------------------------ */

const rascunhoSchema = z.object({
  customerName: z.string().trim().min(2, 'Informe o nome.').max(80),
  phone: z.string().trim().min(10, 'Informe o telefone com DDD.').max(30),
  address: z.string().trim().max(200).optional().default(''),
  notes: z.string().trim().max(300).optional().default(''),
  items: z
    .array(
      z.object({
        productId: z.string().trim().min(1),
        quantity: z.number().int().min(1).max(99),
      })
    )
    .min(1, 'O pedido esta vazio.')
    .max(40, 'Pedido muito grande para um link.'),
});

/**
 * Assina o rascunho do pedido e devolve o magic link.
 *
 * O PONTO CRITICO desta rota: ela recebe ID e QUANTIDADE, nunca preco. Os
 * valores sao lidos do cardapio no banco e so entao assinados.
 *
 * Aceitar preco do cliente anularia a assinatura inteira — bastaria pedir um
 * link de "Picanha por R$ 0,01" e o servidor carimbaria como legitimo. A
 * assinatura garante que ninguem altera o payload DEPOIS; garantir que ele
 * nasce correto e trabalho desta funcao.
 */
export const createMagicLink = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = rascunhoSchema.parse(req.body);

  const filtro = mongoose.isValidObjectId(id) ? { _id: id } : { slug: String(id).toLowerCase() };

  const app = (await AppProject.findOne(filtro)
    .select('_id status appPlanType products delivery')
    .lean()) as Record<string, any> | null;

  if (!app) throw new HttpError(404, 'Restaurante nao encontrado.');
  garantirCardapioPublico(app);

  const disponiveis = new Map<string, { name: string; price: number }>();
  for (const p of app.products ?? []) {
    if (p.available === false) continue;
    disponiveis.set(String(p._id), { name: String(p.name), price: Number(p.price ?? 0) });
  }

  const itens: Array<[string, number, number]> = [];

  for (const pedido of body.items) {
    const produto = disponiveis.get(pedido.productId);
    // Item que saiu do cardapio entre a montagem e o envio: recusa alto, em
    // vez de assinar um pedido que a cozinha nao consegue produzir.
    if (!produto) {
      throw new HttpError(409, `Um item do pedido nao esta mais disponivel.`, [
        { field: 'items', message: pedido.productId },
      ]);
    }
    itens.push([produto.name, produto.price, pedido.quantity]);
  }

  const taxa = body.address.trim() && app.delivery?.enabled !== false ? Number(app.delivery?.fee ?? 0) : 0;

  const token = signMagicPayload({
    a: String(app._id),
    c: body.customerName,
    p: body.phone,
    i: itens,
    f: taxa,
    e: body.address.trim(),
    o: body.notes.trim(),
  });

  const subtotal = itens.reduce((s, [, preco, qtd]) => s + preco * qtd, 0);

  return res.json({
    ok: true,
    data: {
      url: `${env.publicUrl}/api/parse?payload=${encodeURIComponent(token)}`,
      expiraEmMinutos: MAGIC_TTL_MINUTES,
      /* Devolvemos os valores calculados pelo servidor para a tela conferir:
         se divergirem do que o cliente ve, algo mudou no cardapio. */
      subtotal,
      deliveryFee: taxa,
      total: subtotal + taxa,
      itens: itens.map(([name, price, quantity]) => ({ name, price, quantity })),
    },
  });
});

/* ------------------------------------------------------------------ */
/* POST /api/public/apps/:id/orders                                    */
/* ------------------------------------------------------------------ */

const pedidoPublicoSchema = z.object({
  customerName: z.string().trim().min(2, 'Informe o nome.').max(80),
  phone: z.string().trim().min(10, 'Informe o telefone com DDD.').max(30),
  notes: z.string().trim().max(300).optional().default(''),
  isDelivery: z.boolean().optional().default(true),
  address: z
    .object({
      mode: z.enum(['gps', 'manual']).optional().default('manual'),
      street: z.string().trim().max(160).optional().default(''),
      number: z.string().trim().max(20).optional().default(''),
      district: z.string().trim().max(80).optional().default(''),
      city: z.string().trim().max(80).optional().default(''),
      reference: z.string().trim().max(240).optional().default(''),
      lat: z.number().min(-90).max(90).optional(),
      lng: z.number().min(-180).max(180).optional(),
    })
    .optional()
    .default({}),
  items: z
    .array(
      z.object({
        productId: z.string().trim().min(1),
        quantity: z.number().int().min(1).max(99),
      })
    )
    .min(1, 'O pedido esta vazio.')
    .max(40),
  payments: z.array(z.object({
    method: z.enum(['pix', 'dinheiro', 'cartao']),
    amount: z.number().positive().max(999_999),
    changeFor: z.number().positive().max(999_999).optional(),
  })).max(6).optional().default([]),
});

/**
 * Pedido feito pelo CLIENTE FINAL, direto do cardapio publico.
 *
 * O pedido nasce na operacao com status `novo`, o que significa: aparece na
 * Recepcao para definir a taxa E na Cozinha ao mesmo tempo, porque a fila de
 * producao deriva das entregas que ainda nao foram entregues. A chapa comeca
 * a trabalhar enquanto a recepcao ainda decide o frete.
 *
 * PRECO NUNCA VEM DO CLIENTE
 * --------------------------
 * O corpo traz productId e quantidade. Nome e preco sao lidos do cardapio no
 * banco. Aceitar o preco do navegador deixaria qualquer pessoa pedir uma
 * picanha por um centavo — e o pedido chegaria na cozinha com aparencia
 * legitima.
 */
export const createPublicOrder = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = pedidoPublicoSchema.parse(req.body);

  const filtro = mongoose.isValidObjectId(id) ? { _id: id } : { slug: String(id).toLowerCase() };

  const app = (await AppProject.findOne(filtro)
    .select('_id status appPlanType products delivery')
    .lean()) as Record<string, any> | null;

  if (!app) throw new HttpError(404, 'Restaurante nao encontrado.');
  garantirCardapioPublico(app);

  const disponiveis = new Map<string, { name: string; price: number; station: string }>();
  for (const p of app.products ?? []) {
    if (p.available === false) continue;
    disponiveis.set(String(p._id), {
      name: String(p.name),
      price: Number(p.price ?? 0),
      /* O saguao viaja com o item: e ele que roteia para a praca certa. */
      station: String(p.station ?? ''),
    });
  }

  const itens: Array<{ name: string; price: number; station: string }> = [];

  for (const pedido of body.items) {
    const produto = disponiveis.get(pedido.productId);
    if (!produto) {
      throw new HttpError(409, 'Um item do pedido nao esta mais disponivel.', [
        { field: 'items', message: pedido.productId },
      ]);
    }
    /* Uma linha por unidade: e o formato que o resto da operacao usa. */
    for (let i = 0; i < pedido.quantity; i += 1) itens.push({ ...produto });
  }

  const subtotal = itens.reduce((soma, item) => soma + item.price, 0);
  if (body.isDelivery && body.address.mode === 'gps' && (body.address.lat == null || body.address.lng == null)) {
    throw new HttpError(400, 'Confirme a localização no mapa antes de enviar o pedido.');
  }
  if (body.payments.length > 0) {
    const pago = body.payments.reduce((soma, payment) => soma + payment.amount, 0);
    if (Math.abs(pago - subtotal) > 0.01) {
      throw new HttpError(400, 'A soma das formas de pagamento deve corresponder ao subtotal do pedido.');
    }
    for (const payment of body.payments) {
      if (payment.changeFor != null && (payment.method !== 'dinheiro' || payment.changeFor + 0.005 < payment.amount)) {
        throw new HttpError(400, 'Informe um valor de troco válido somente para dinheiro.');
      }
    }
  }
  const agora = Date.now();
  const code = String(Math.floor(1000 + Math.random() * 8999));
  const orderId = `d-${agora}-${Math.floor(Math.random() * 1000)}`;

  const operacao =
    (await Operation.findOne({ app: app._id })) ?? new Operation({ app: app._id });

  operacao.deliveries.unshift({
    id: orderId,
    code,
    customerName: body.customerName,
    phone: body.phone,
    items: itens,
    total: subtotal,
    payments: body.payments,
    /** Forma escolhida pelo cliente não comprova recebimento de PIX. */
    paymentDeclaredOnly: true,
    deliveryFee: 0,
    address: body.address,
    notes: body.notes,
    isDelivery: body.isDelivery,
    status: 'novo',
    timeLabel: 'agora',
    distanceLabel: '',
    createdAt: agora,
  } as never);

  await operacao.save();

  /* Acorda a Recepcao e a Cozinha sem esperar a sondagem de 30 segundos. */
  emitNewOrder(String(app._id), {
    orderId,
    code,
    customerName: body.customerName,
    status: 'novo',
    source: 'cardapio',
  });

  return res.json({
    ok: true,
    data: { id: orderId, code, subtotal, items: itens.map(({ name, price }) => ({ name, price })) },
  });
});
