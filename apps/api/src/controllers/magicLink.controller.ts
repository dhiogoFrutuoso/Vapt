import type { Request, Response } from 'express';
import { env } from '../config/env.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { AppProject } from '../models/AppProject.js';
import { MagicLinkUse } from '../models/MagicLinkUse.js';
import { Order } from '../models/Order.js';
import { Operation } from '../models/Operation.js';
import { MAGIC_TTL_MINUTES, verifyMagicToken } from '../utils/magicLink.js';
import { emitNewOrder } from '../realtime/io.js';

/**
 * `GET /api/parse?payload=...`
 *
 * Consome o magic link e cria o pedido. Quem chega aqui é o restaurante,
 * clicando no link que veio no WhatsApp — então a resposta é uma NAVEGAÇÃO,
 * não JSON: redireciona para o painel com o resultado na querystring.
 *
 * A ordem das checagens não é arbitrária. Assinatura primeiro, porque é a
 * mais barata e a que rejeita adulteração; depois expiração; e só então a
 * consulta ao banco para uso único. Inverter faria o servidor ir ao banco por
 * causa de um link forjado.
 */

function paraPainel(res: Response, params: Record<string, string>) {
  const url = new URL(`${env.webUrl}/painel`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return res.redirect(url.toString());
}

/** Código curto que o restaurante lê em voz alta. */
function codigoDoPedido(): string {
  return String(Math.floor(1000 + Math.random() * 8999));
}

export const consumeMagicLink = asyncHandler(async (req: Request, res: Response) => {
  const token = String(req.query.payload ?? '');

  if (!token) return paraPainel(res, { pedido: 'erro', motivo: 'sem_payload' });

  const verificacao = verifyMagicToken(token);

  if (!verificacao.ok) {
    /*
     * Assinatura inválida é tentativa de adulteração — vale log. Expirado é
     * rotina: o cliente mandou, o restaurante viu depois do almoço.
     */
    if (verificacao.reason === 'assinatura') {
      console.warn('[magic] Assinatura invalida. Payload possivelmente adulterado.');
    }
    return paraPainel(res, { pedido: 'erro', motivo: verificacao.reason });
  }

  const p = verificacao.payload;

  /* Uso único: o índice do banco é a autoridade, não esta consulta. */
  const jaUsado = await MagicLinkUse.findOne({ nonce: p.n }).lean();
  if (jaUsado) {
    return paraPainel(res, {
      pedido: 'duplicado',
      ...(jaUsado.order ? { id: String(jaUsado.order) } : {}),
    });
  }

  const app = await AppProject.findById(p.a).select('_id status').lean();
  if (!app || app.status === 'pausado') {
    return paraPainel(res, { pedido: 'erro', motivo: 'restaurante_indisponivel' });
  }
  const operation = await Operation.findOne({ app: app._id }).select('cashOpen').lean();
  if (!operation || operation.cashOpen === false) {
    return paraPainel(res, { pedido: 'erro', motivo: 'caixa_fechado' });
  }

  /*
   * Os valores são RECALCULADOS a partir dos itens assinados, nunca lidos de
   * um campo "total" do payload. Assinar o total e confiar nele funcionaria,
   * mas deixa a porta aberta para uma inconsistência silenciosa se o formato
   * mudar. Somar aqui garante que o que a cozinha vê bate com o que foi pedido.
   */
  const itens = p.i.map(([name, price, quantity]) => ({
    productId: 'magic',
    name: String(name).slice(0, 120),
    price: Number(price) || 0,
    quantity: Math.max(1, Math.min(99, Number(quantity) || 1)),
  }));

  const subtotal = itens.reduce((s, i) => s + i.price * i.quantity, 0);
  const deliveryFee = Number(p.f) || 0;

  const pedido = await Order.create({
    appId: app._id,
    code: codigoDoPedido(),
    customerName: String(p.c || 'Cliente').slice(0, 80),
    phone: String(p.p || '').slice(0, 30),
    type: p.e ? 'delivery' : 'takeout',
    items: itens,
    subtotal,
    deliveryFee,
    serviceFee: 0,
    total: subtotal + deliveryFee,
    paymentMethod: 'nao_informado',
    ...(p.e
      ? { address: { mode: 'manual' as const, street: String(p.e).slice(0, 200) } }
      : {}),
    notes: String(p.o ?? '').slice(0, 300),
    source: 'magic_link',
  });

  try {
    await MagicLinkUse.create({
      nonce: p.n,
      order: pedido._id,
      app: app._id,
      expiresAt: new Date(p.x * 1000 + MAGIC_TTL_MINUTES * 60_000),
    });
  } catch (error) {
    /*
     * E11000 aqui significa que dois cliques entraram ao mesmo tempo e o
     * outro venceu a corrida. O pedido que acabamos de criar é o duplicado —
     * desfazemos, e o cliente vê o que já existia.
     */
    const codigo = (error as { code?: number }).code;
    if (codigo === 11000) {
      await Order.deleteOne({ _id: pedido._id });
      const vencedor = await MagicLinkUse.findOne({ nonce: p.n }).lean();
      return paraPainel(res, {
        pedido: 'duplicado',
        ...(vencedor?.order ? { id: String(vencedor.order) } : {}),
      });
    }
    throw error;
  }

  /*
   * Push DEPOIS de o pedido estar gravado e o uso unico registrado. Emitir
   * antes faria a cozinha ver um card que ainda poderia ser desfeito pela
   * corrida de dois cliques.
   */
  emitNewOrder(String(app._id), {
    orderId: String(pedido._id),
    code: pedido.code,
    customerName: pedido.customerName,
    status: pedido.status,
    source: 'magic_link',
  });

  return paraPainel(res, { pedido: 'criado', id: String(pedido._id), codigo: pedido.code });
});
