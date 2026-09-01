import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { HttpError } from '../utils/httpError.js';
import { verifyAccessToken } from '../utils/jwt.js';

/**
 * Sessao do painel.
 *
 * O token chega pelo cookie httpOnly (caminho normal do navegador) ou pelo header
 * Authorization: Bearer (util para testes e para clientes que nao usam cookie).
 */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Preenchido por requireAuth. */
      user?: {
        id: string;
        role: 'owner' | 'admin';
        email: string;
        username?: string | null;
        isAdmin?: boolean;
      };
    }
  }
}

function extractToken(req: Request): string | null {
  const cookieToken = (req.cookies as Record<string, string> | undefined)?.[env.auth.cookieName];
  if (cookieToken) return cookieToken;

  const header = req.get('authorization');
  if (header?.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();

  return null;
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = extractToken(req);
    if (!token) throw new HttpError(401, 'Faca login para continuar.');

    const payload = verifyAccessToken(token);
    if (!payload) throw new HttpError(401, 'Sessao expirada. Entre novamente.');

    const user = await User.findById(payload.sub).lean();
    if (!user) throw new HttpError(401, 'Conta nao encontrada.');
    if (user.status !== 'ativo') throw new HttpError(403, 'Conta suspensa. Fale com o suporte.');

    req.user = {
      id: String(user._id),
      role: user.role as 'owner' | 'admin',
      email: user.email,
      username: user.username,
      isAdmin: user.isAdmin ?? false,
    };

    next();
  } catch (error) {
    next(error);
  }
}

/** Nao bloqueia: apenas preenche req.user quando houver sessao valida. */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = extractToken(req);
    if (!token) return next();

    const payload = verifyAccessToken(token);
    if (!payload) return next();

    const user = await User.findById(payload.sub).lean();
    if (user && user.status === 'ativo') {
      req.user = {
        id: String(user._id),
        role: user.role as 'owner' | 'admin',
        email: user.email,
        username: user.username,
      isAdmin: user.isAdmin ?? false,
      };
    }

    next();
  } catch {
    next();
  }
}
