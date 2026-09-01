import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../utils/httpError.js';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env.js';

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ ok: false, error: 'Rota nao encontrada' });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const isZodError = err instanceof ZodError || (err instanceof Error && err.name === 'ZodError');
  if (isZodError) {
    const zodErr = err as ZodError;
    return res.status(400).json({
      ok: false,
      error: 'Dados invalidos',
      details: zodErr.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }

  const isHttpError = err instanceof HttpError || (err instanceof Error && err.name === 'HttpError');
  if (isHttpError) {
    const httpErr = err as HttpError;
    return res.status(httpErr.status).json({ ok: false, error: httpErr.message, details: httpErr.details });
  }

  const anyErr = err as { code?: number; message?: string };
  if (anyErr?.code === 11000) {
    return res.status(409).json({ ok: false, error: 'Registro duplicado' });
  }

  console.error('[error]', err);
  try {
    fs.appendFileSync('api_error.log', new Date().toISOString() + ' ' + (err instanceof Error ? err.stack : String(err)) + '\n');
  } catch (e) {
    console.error('Falha ao escrever log de erro', e);
  }
  
  if (env.isProd) {
    return res.status(500).json({ ok: false, error: 'Erro interno no servidor' });
  }

  return res.status(500).json({ ok: false, error: 'Erro interno no servidor', message: String(err) });
}

/** Envolve controllers async para nao repetir try/catch. */
export function asyncHandler<T extends (req: Request, res: Response, next: NextFunction) => Promise<unknown>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
