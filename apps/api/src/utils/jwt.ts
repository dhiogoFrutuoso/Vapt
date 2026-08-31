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
    console.error('[JWT Error]:', error);
    return null;
  }
}
