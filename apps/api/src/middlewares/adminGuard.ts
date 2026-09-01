import type { Request, Response, NextFunction } from 'express';
import { User } from '../models/User.js';
import { HttpError } from '../utils/httpError.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { env } from '../config/env.js';

function extractToken(req: Request): string | null {
  const cookieToken = (req.cookies as Record<string, string> | undefined)?.[env.auth.cookieName];
  if (cookieToken) return cookieToken;
  const header = req.get('authorization');
  if (header?.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  return null;
}

export async function adminGuard(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = extractToken(req);
    if (!token) throw new HttpError(401, 'Faça login para continuar.');
    const payload = verifyAccessToken(token);
    if (!payload) throw new HttpError(401, 'Sessão expirada. Entre novamente.');
    
    const user = await User.findById(payload.sub).select('isAdmin status').lean();
    if (!user) throw new HttpError(401, 'Conta não encontrada.');
    if (user.status !== 'ativo') throw new HttpError(403, 'Conta suspensa.');
    if (user.isAdmin !== true) throw new HttpError(403, 'Acesso negado. Privilégios de administrador necessários.');
    
    next();
  } catch (error) {
    next(error);
  }
}
