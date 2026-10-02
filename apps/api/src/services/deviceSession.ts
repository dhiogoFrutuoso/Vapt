import type { Request } from 'express';
import { Types } from 'mongoose';
import { env } from '../config/env.js';
import { DeviceSession } from '../models/DeviceSession.js';
import {
  generateFamilyId,
  generateRefreshToken,
  hashRefreshToken,
  safeCompare,
  signDeviceAccessToken,
} from '../utils/deviceToken.js';

/**
 * Ciclo de vida da sessao do app da equipe.
 *
 * Tres operacoes, nesta ordem de importancia:
 *   issueSession  — cria a sessao (chamada pelo login por codigo, na Etapa 2);
 *   rotateSession — troca o refresh por um novo, detectando reuso;
 *   revoke*       — derruba sessoes (logout, bloqueio, troca de codigo).
 */

export type IssuedSession = {
  accessToken: string;
  refreshToken: string;
  /** Segundos ate o access token expirar. O app agenda a renovacao com isto. */
  expiresIn: number;
  sessionId: string;
};

export type DeviceInfo = {
  deviceId: string;
  deviceName?: string;
  platform?: 'android' | 'ios' | 'web' | 'desconhecido';
};

/** Metadados da requisicao, so para o dono reconhecer a sessao na lista. */
function requestMeta(req?: Request) {
  return {
    userAgent: String(req?.headers['user-agent'] ?? '').slice(0, 300),
    ip: String(req?.ip ?? '').slice(0, 60),
  };
}

function refreshExpiry(): Date {
  return new Date(Date.now() + env.mobileAuth.refreshTtlDays * 24 * 60 * 60 * 1000);
}

function absoluteExpiry(createdAt: Date, currentExpiry: Date): Date {
  const weeklyLimit = createdAt.getTime() + env.mobileAuth.refreshTtlDays * 24 * 60 * 60 * 1000;
  return new Date(Math.min(weeklyLimit, currentExpiry.getTime()));
}

/**
 * Cria uma sessao nova para um funcionario num aparelho.
 *
 * Reentrar no MESMO aparelho revoga a sessao anterior dele. Sem isso, cada
 * login deixaria para tras um refresh vivo que ninguem mais usa mas continua
 * valendo — sessoes fantasma que o bloqueio precisaria caçar depois.
 */
export async function issueSession(params: {
  appId: string | Types.ObjectId;
  employeeId: string | Types.ObjectId;
  permissions: string[];
  device: DeviceInfo;
  req?: Request;
}): Promise<IssuedSession> {
  const { appId, employeeId, permissions, device, req } = params;

  await DeviceSession.updateMany(
    { employeeId, deviceId: device.deviceId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: 'logout' } }
  );

  const refreshToken = generateRefreshToken();

  const session = await DeviceSession.create({
    app: appId,
    employeeId,
    deviceId: device.deviceId,
    deviceName: device.deviceName ?? '',
    platform: device.platform ?? 'desconhecido',
    refreshTokenHash: hashRefreshToken(refreshToken),
    family: generateFamilyId(),
    expiresAt: refreshExpiry(),
    ...requestMeta(req),
  });

  /*
   * Teto de aparelhos por funcionario. Sem limite, um codigo vazado gera
   * sessoes indefinidamente e o dono nao consegue mais enxergar a lista.
   * Ao estourar, a mais antiga cai.
   */
  await enforceSessionLimit(employeeId);

  return {
    accessToken: signDeviceAccessToken({
      sub: String(employeeId),
      app: String(appId),
      did: device.deviceId,
      sid: String(session._id),
      perms: permissions,
      sessionExpiresAt: session.expiresAt.getTime(),
    }),
    refreshToken,
    expiresIn: env.mobileAuth.accessTtlSeconds,
    sessionId: String(session._id),
  };
}

async function enforceSessionLimit(employeeId: string | Types.ObjectId): Promise<void> {
  const limit = env.mobileAuth.maxSessionsPerEmployee;
  if (limit <= 0) return;

  const ativas = await DeviceSession.find({ employeeId, revokedAt: null })
    .sort({ lastUsedAt: -1 })
    .select('_id')
    .lean();

  if (ativas.length <= limit) return;

  const excedentes = ativas.slice(limit).map((s) => s._id);
  await DeviceSession.updateMany(
    { _id: { $in: excedentes } },
    { $set: { revokedAt: new Date(), revokedReason: 'admin' } }
  );
}

export type RotateResult =
  | { ok: true; session: IssuedSession; permissions: string[]; appId: string; employeeId: string }
  | { ok: false; reason: 'nao_encontrada' | 'revogada' | 'expirada' | 'reuso' | 'device_divergente' };

/**
 * Rotaciona o refresh token.
 *
 * O ponto delicado e o REUSO. Um refresh ja rotacionado que reaparece nao tem
 * explicacao inocente: o app sempre descarta o antigo ao receber o novo. Ou o
 * token foi copiado em transito, ou foi lido do armazenamento do aparelho.
 * Nos dois casos existem duas partes usando a mesma linhagem e nao ha como
 * saber qual e a legitima — entao derrubamos a familia inteira. O funcionario
 * honesto faz login de novo; o invasor perde o acesso junto.
 */
export async function rotateSession(params: {
  refreshToken: string;
  deviceId: string;
  req?: Request;
}): Promise<RotateResult> {
  const { refreshToken, deviceId, req } = params;
  const hash = hashRefreshToken(refreshToken);

  /*
   * Uma consulta cobre os dois casos: token corrente (renovacao normal) e
   * token da geracao anterior (reuso). O `$or` evita uma segunda ida ao banco
   * no caminho feliz, que e o que acontece a cada 10 minutos por aparelho.
   */
  const session = await DeviceSession.findOne({
    $or: [{ refreshTokenHash: hash }, { previousTokenHash: hash }],
  }).select('+refreshTokenHash +previousTokenHash');

  if (!session) return { ok: false, reason: 'nao_encontrada' };

  if (session.revokedAt) return { ok: false, reason: 'revogada' };

  /*
   * Casou com a geracao ANTERIOR: alguem apresentou um token ja queimado.
   * O app legitimo descarta o antigo assim que recebe o novo, entao ou houve
   * copia em transito, ou leitura do armazenamento do aparelho. Como nao da
   * para saber qual das duas partes e a legitima, a sessao inteira cai.
   */
  if (session.previousTokenHash && safeCompare(session.previousTokenHash, hash)) {
    await DeviceSession.updateMany(
      { family: session.family, revokedAt: null },
      { $set: { revokedAt: new Date(), revokedReason: 'reuso_detectado' } }
    );
    console.warn('[device] Reuso de refresh token detectado. Sessao revogada.', {
      family: session.family,
      employeeId: String(session.employeeId),
      deviceId: session.deviceId,
    });
    return { ok: false, reason: 'reuso' };
  }

  const expiresAt = absoluteExpiry(session.createdAt, session.expiresAt);
  if (expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: 'expirada' };
  }

  /*
   * Device binding conferido na renovacao, nao so no login. Sem esta linha, um
   * refresh copiado para outro aparelho renovaria normalmente e o vinculo
   * viraria decoracao.
   */
  if (!safeCompare(session.deviceId, deviceId)) {
    await DeviceSession.updateOne(
      { _id: session._id },
      { $set: { revokedAt: new Date(), revokedReason: 'reuso_detectado' } }
    );
    console.warn('[device] Refresh apresentado por outro aparelho. Sessao revogada.', {
      esperado: session.deviceId,
      recebido: deviceId,
    });
    return { ok: false, reason: 'device_divergente' };
  }

  /*
   * As permissoes sao relidas do app a cada rotacao, e nao copiadas do token
   * anterior: mudanca de funcao passa a valer na renovacao seguinte, sem
   * exigir novo login. E um funcionario BLOQUEADO perde o acesso aqui mesmo,
   * sem depender de alguem ter lembrado de revogar a sessao.
   */
  const { AppProject } = await import('../models/AppProject.js');
  const app = await AppProject.findById(session.app).select('roles employees status appPlanType').lean();

  const employee = app?.employees?.find(
    (e: { _id?: unknown }) => String(e._id) === String(session.employeeId)
  );

  if (!app || !employee || employee.blocked === true) {
    await DeviceSession.updateOne(
      { _id: session._id },
      { $set: { revokedAt: new Date(), revokedReason: employee?.blocked ? 'bloqueio' : 'admin' } }
    );
    return { ok: false, reason: 'revogada' };
  }

  const role = app.roles?.find((r: { _id?: unknown }) => String(r._id) === String(employee.roleId));
  const { legacyPermissions } = await import('../utils/planAccess.js');
  const permissions: string[] = legacyPermissions(app.appPlanType, (role?.permissions ?? []).map(String));

  const novoRefresh = generateRefreshToken();
  const agora = new Date();

  // Rotacao NO MESMO documento: o hash atual desce para `previousTokenHash`.
  session.previousTokenHash = session.refreshTokenHash;
  session.refreshTokenHash = hashRefreshToken(novoRefresh);
  session.rotatedAt = agora;
  session.lastUsedAt = agora;
  // Rotação troca os tokens, mas nunca prorroga os sete dias do login.
  session.expiresAt = expiresAt;
  const meta = requestMeta(req);
  session.userAgent = meta.userAgent;
  session.ip = meta.ip;
  await session.save();

  return {
    ok: true,
    appId: String(session.app),
    employeeId: String(session.employeeId),
    permissions,
    session: {
      accessToken: signDeviceAccessToken({
        sub: String(session.employeeId),
        app: String(session.app),
        did: session.deviceId,
        sid: String(session._id),
        perms: permissions,
        sessionExpiresAt: expiresAt.getTime(),
      }),
      refreshToken: novoRefresh,
      expiresIn: env.mobileAuth.accessTtlSeconds,
      sessionId: String(session._id),
    },
  };
}

/** Logout de um aparelho: revoga a linhagem daquela sessao. */
export async function revokeSessionByRefresh(refreshToken: string): Promise<boolean> {
  const session = await DeviceSession.findOne({ refreshTokenHash: hashRefreshToken(refreshToken) });
  if (!session) return false;

  await DeviceSession.updateMany(
    { family: session.family, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: 'logout' } }
  );
  return true;
}

/**
 * Derruba TODAS as sessoes de um funcionario.
 * E o que a Etapa 3 chama ao bloquear ou excluir alguem.
 */
export async function revokeAllForEmployee(
  employeeId: string | Types.ObjectId,
  reason: 'bloqueio' | 'troca_de_codigo' | 'admin' | 'logout' = 'admin'
): Promise<number> {
  const result = await DeviceSession.updateMany(
    { employeeId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } }
  );
  return result.modifiedCount ?? 0;
}

/** Derruba todas as sessoes de um aplicativo inteiro. */
export async function revokeAllForApp(
  appId: string | Types.ObjectId,
  reason: 'bloqueio' | 'admin' = 'admin'
): Promise<number> {
  const result = await DeviceSession.updateMany(
    { app: appId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } }
  );
  return result.modifiedCount ?? 0;
}

/** Aparelhos ativos de um funcionario, para a tela de gestao da Etapa 3. */
export async function listActiveSessions(employeeId: string | Types.ObjectId) {
  return DeviceSession.find({ employeeId, revokedAt: null })
    .sort({ lastUsedAt: -1 })
    .select('deviceId deviceName platform lastUsedAt createdAt ip')
    .lean();
}
