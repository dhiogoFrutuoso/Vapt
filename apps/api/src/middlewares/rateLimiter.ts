import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

export const apiLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Muitas requisicoes. Tente novamente em instantes.' },
});

/** Mais restrito para rotas que gravam lead/demo. */
export const writeLimiter = rateLimit({
  windowMs: 60_000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Calma la! Aguarde um minuto antes de enviar de novo.' },
});

/**
 * Login e registro: janela longa e poucas tentativas, para travar forca bruta.
 * Tentativas bem-sucedidas nao contam, entao quem acerta a senha nunca e bloqueado.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: 'Muitas tentativas seguidas. Aguarde 15 minutos ou recupere sua senha.',
  },
});
