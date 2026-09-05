import crypto from 'node:crypto';
import { env } from '../config/env.js';

/**
 * Magic Link: pedido assinado que vira registro com um clique.
 *
 * O cliente monta o carrinho numa pagina publica e manda tudo pelo WhatsApp.
 * No fim do texto vai um link — se o restaurante clicar, o pedido entra no
 * banco sem ninguem redigitar nada.
 *
 * POR QUE ASSINAR
 * ---------------
 * O payload viaja pela URL, onde o cliente pode edita-lo antes de enviar.
 * Sem assinatura, qualquer pessoa montaria um link com "Total: R$ 0,01" ou
 * encheria a fila do restaurante com pedidos falsos — seria um endpoint de
 * escrita aberto disfarcado de link.
 *
 * Base64 NAO e criptografia: e codificacao, e qualquer um decodifica e
 * reescreve. O que impede a adulteracao e o HMAC calculado com um segredo que
 * so o servidor tem.
 *
 * TRES CONTROLES, CADA UM CONTRA UM ATAQUE DIFERENTE
 * -------------------------------------------------
 *   assinatura  -> impede alterar valores e itens;
 *   expiracao   -> limita a janela de um link vazado (30 min por padrao);
 *   uso unico   -> impede reenviar o mesmo link e duplicar o pedido, seja por
 *                  ma-fe ou por alguem clicando duas vezes na conversa.
 */

/** Vida do link. Curta: e para ser clicado durante a conversa. */
export const MAGIC_TTL_MINUTES = 30;

export type MagicPayload = {
  /** Aplicativo (restaurante) de destino. */
  a: string;
  /** Nome do cliente. */
  c: string;
  /** Telefone. */
  p: string;
  /** Itens: [nome, preco unitario, quantidade]. Abreviado para encurtar a URL. */
  i: Array<[string, number, number]>;
  /** Taxa de entrega. */
  f: number;
  /** Endereco (vazio = retirada). */
  e: string;
  /** Observacao. */
  o: string;
  /** Nonce: identifica o link para o controle de uso unico. */
  n: string;
  /** Expiracao, em segundos desde a epoca. */
  x: number;
};

/**
 * Chave derivada do JWT_SECRET com separacao de dominio.
 *
 * Reutilizar o segredo cru em dois contextos e receita para o dia em que uma
 * assinatura de um vira valida no outro. O rotulo garante que a chave do
 * magic link nao serve para assinar sessao, e vice-versa.
 */
function chave(): Buffer {
  return crypto.createHash('sha256').update(`${env.auth.jwtSecret}::magic-link::v1`).digest();
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function assinar(corpo: string): string {
  return crypto.createHmac('sha256', chave()).update(corpo).digest('base64url');
}

/** Monta o token assinado: `<payload base64url>.<assinatura>`. */
export function signMagicPayload(dados: Omit<MagicPayload, 'n' | 'x'>): string {
  const payload: MagicPayload = {
    ...dados,
    n: crypto.randomBytes(9).toString('base64url'),
    x: Math.floor(Date.now() / 1000) + MAGIC_TTL_MINUTES * 60,
  };

  const corpo = b64url(JSON.stringify(payload));
  return `${corpo}.${assinar(corpo)}`;
}

export type VerifyResult =
  | { ok: true; payload: MagicPayload }
  | { ok: false; reason: 'malformado' | 'assinatura' | 'expirado' };

export function verifyMagicToken(token: string): VerifyResult {
  const partes = token.split('.');
  if (partes.length !== 2) return { ok: false, reason: 'malformado' };

  const [corpo, assinatura] = partes;
  const esperada = assinar(corpo);

  /*
   * Comparacao em tempo constante. `a === b` sai no primeiro byte diferente,
   * e essa diferenca de tempo, medida em muitas tentativas, permite descobrir
   * a assinatura correta byte a byte.
   */
  const recebida = Buffer.from(assinatura);
  const calculada = Buffer.from(esperada);
  if (recebida.length !== calculada.length) return { ok: false, reason: 'assinatura' };
  if (!crypto.timingSafeEqual(recebida, calculada)) return { ok: false, reason: 'assinatura' };

  let payload: MagicPayload;
  try {
    payload = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8')) as MagicPayload;
  } catch {
    return { ok: false, reason: 'malformado' };
  }

  if (
    typeof payload.a !== 'string' ||
    !Array.isArray(payload.i) ||
    typeof payload.n !== 'string' ||
    typeof payload.x !== 'number'
  ) {
    return { ok: false, reason: 'malformado' };
  }

  if (payload.x * 1000 < Date.now()) return { ok: false, reason: 'expirado' };

  return { ok: true, payload };
}
