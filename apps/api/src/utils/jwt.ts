import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';

/**
 * Token de sessao. Curto e sem dados sensiveis: so o id e o papel do usuario.
 * Tudo que o front precisa exibir vem de GET /api/auth/me, nunca do payload do token.
 */

export type TokenPayload = {
  sub: string;
  role: 'owner' | 'admin';
};

export function signAccessToken(payload: TokenPayload): string {
  const options: SignOptions = {
    expiresIn: env.auth.expiresIn as SignOptions['expiresIn'],
    issuer: 'vaptapp-api',
  };
  return jwt.sign(payload, env.auth.jwtSecret, options);
}

/** Devolve o payload, ou null quando o token e invalido/expirado. */
export function verifyAccessToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.auth.jwtSecret, { issuer: 'vaptapp-api' });
    if (typeof decoded === 'string') return null;

    const { sub, role } = decoded as jwt.JwtPayload & { role?: string };
    if (!sub || (role !== 'owner' && role !== 'admin')) return null;

    return { sub: String(sub), role };
  } catch (error) {
    /*
     * Token invalido ou expirado e evento ESPERADO, nao falha do servidor:
     * acontece a cada sessao que vence e a cada conexao de socket com
     * credencial errada. Antes isso saia como `console.error` com a pilha
     * inteira — em producao, dezenas de rastros por minuto que parecem
     * incidente e escondem os erros de verdade.
     *
     * Fica em `warn`, com a mensagem e sem a pilha.
     */
    const motivo = error instanceof Error ? error.message : String(error);
    console.warn(`[jwt] Token recusado: ${motivo}`);
    return null;
  }
}
