import crypto from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';

/**
 * Tokens do app da equipe.
 *
 * Vive separado de `utils/jwt.ts` (a sessao do painel) por um motivo de
 * seguranca, nao de organizacao: os dois tipos NAO podem ser intercambiaveis.
 * Um token de funcionario nunca deve abrir o painel do dono, e um token do
 * dono nunca deve ser aceito como sessao de aparelho.
 *
 * A separacao e imposta por `audience`: o verificador exige a audiencia certa,
 * entao um token do painel apresentado aqui simplesmente nao valida — mesmo
 * sendo assinado com o mesmo segredo e estando dentro da validade.
 */

const ISSUER = 'vaptapp-api';
const DEVICE_AUDIENCE = 'vaptapp-device';

export type DevicePayload = {
  /** `_id` do subdocumento employee. */
  sub: string;
  /** Aplicativo (restaurante). */
  app: string;
  /** Device binding: o token so vale no aparelho que o pediu. */
  did: string;
  /** Sessao correspondente em DeviceSession. */
  sid: string;
  /** Permissoes da funcao no momento da emissao (RBAC das abas). */
  perms: string[];
  /** Prazo absoluto da sessão; a rotação não o estende. */
  sessionExpiresAt: number;
};

export function signDeviceAccessToken(payload: DevicePayload): string {
  const options: SignOptions = {
    expiresIn: env.mobileAuth.accessTtlSeconds,
    issuer: ISSUER,
    audience: DEVICE_AUDIENCE,
  };
  return jwt.sign(payload, env.auth.jwtSecret, options);
}

/** Devolve o payload, ou null quando invalido, expirado ou de outra audiencia. */
export function verifyDeviceAccessToken(token: string): DevicePayload | null {
  try {
    const decoded = jwt.verify(token, env.auth.jwtSecret, {
      issuer: ISSUER,
      audience: DEVICE_AUDIENCE,
    });
    if (typeof decoded === 'string') return null;

    const { sub, app, did, sid, perms, sessionExpiresAt } = decoded as jwt.JwtPayload & {
      app?: string;
      did?: string;
      sid?: string;
      perms?: unknown;
      sessionExpiresAt?: number;
    };

    // Tokens anteriores a esta regra renovam uma vez pelo refresh; se a
    // sessão antiga já completou sete dias, a renovação é recusada.
    if (!sub || !app || !did || !sid || typeof sessionExpiresAt !== 'number' || !Number.isFinite(sessionExpiresAt) || sessionExpiresAt <= Date.now()) return null;

    return {
      sub: String(sub),
      app: String(app),
      did: String(did),
      sid: String(sid),
      perms: Array.isArray(perms) ? perms.map(String) : [],
      sessionExpiresAt,
    };
  } catch {
    // Token invalido e evento esperado (expirou, foi adulterado). Nao e erro.
    return null;
  }
}

/**
 * Refresh token: 32 bytes aleatorios, nao JWT.
 *
 * JWT aqui seria pior. O refresh precisa ser revogavel, e revogacao exige
 * consulta ao banco de qualquer forma — o payload assinado nao economizaria
 * nada e ainda ampliaria a superficie (um JWT roubado carrega dados legiveis
 * e continua valendo ate expirar). Um opaco so serve para achar a linha no
 * banco; sem ela, nao vale nada.
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Hash do refresh para guardar no banco.
 *
 * SHA-256 sem salt, e nao bcrypt, de proposito: o token ja tem 256 bits de
 * entropia aleatoria, entao nao ha o que um ataque de dicionario adivinhe —
 * o que bcrypt protege (senhas humanas, previsiveis) nao se aplica. E como o
 * refresh e conferido a cada renovacao, o custo deliberado do bcrypt viraria
 * latencia em todo ciclo de vida do app.
 */
export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Comparacao em tempo constante.
 *
 * `a === b` sai mais cedo no primeiro byte diferente, e essa diferenca de
 * tempo, medida em muitas tentativas, vaza o prefixo correto.
 */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Identificador de linhagem, compartilhado por todas as rotacoes da sessao. */
export function generateFamilyId(): string {
  return crypto.randomBytes(16).toString('hex');
}
