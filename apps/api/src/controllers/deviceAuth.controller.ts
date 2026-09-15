import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { AppProject } from '../models/AppProject.js';
import { findEmployeeByCode } from '../services/employeeLookup.js';
import {
  issueSession,
  listActiveSessions,
  revokeSessionByRefresh,
  rotateSession,
} from '../services/deviceSession.js';
import { HttpError } from '../utils/httpError.js';

/**
 * Rotas de SESSAO do app da equipe.
 *
 * O login por codigo entra na Etapa 2. Aqui esta o que sustenta a sessao
 * depois que ela existe: renovar, encerrar e listar aparelhos.
 */

const deviceSchema = z.object({
  deviceId: z.string().trim().min(4, 'Identificador do aparelho ausente.').max(128),
  deviceName: z.string().trim().max(80).optional().default(''),
  platform: z.enum(['android', 'ios', 'web', 'desconhecido']).optional().default('desconhecido'),
});

const loginSchema = deviceSchema.extend({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .length(6, 'O codigo tem 6 caracteres.'),
});

/**
 * Valida CPF pelos digitos verificadores, nao so pelo tamanho.
 *
 * Onze digitos quaisquer passariam num `length(11)`, e o erro so apareceria
 * meses depois, na hora de emitir algo no nome da pessoa. O calculo abaixo e
 * o oficial da Receita.
 */
function cpfValido(valor: string): boolean {
  const cpf = valor.replace(/\D/g, '');
  if (cpf.length !== 11) return false;
  // Sequencias repetidas (00000000000, 11111111111...) passam no calculo
  // dos digitos verificadores, entao precisam ser recusadas a parte.
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const digito = (ate: number): number => {
    let soma = 0;
    let peso = ate + 1;
    for (let i = 0; i < ate; i += 1) {
      soma += Number(cpf[i]) * peso;
      peso -= 1;
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return digito(9) === Number(cpf[9]) && digito(10) === Number(cpf[10]);
}

const profileSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(10, 'Informe um telefone com DDD.')
    .max(30)
    .refine((v) => v.replace(/\D/g, '').length >= 10, 'Telefone incompleto.'),
  cpf: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ''))
    .refine(cpfValido, 'CPF invalido.'),
  birthDate: z
    .string()
    .trim()
    .refine((v) => !Number.isNaN(Date.parse(v)), 'Data de nascimento invalida.')
    .transform((v) => new Date(v))
    .refine((d) => {
      const idade = (Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      return idade >= 14 && idade <= 100;
    }, 'Data de nascimento fora do esperado.'),
});

const refreshSchema = z.object({
  refreshToken: z.string().trim().min(20, 'Refresh token ausente.').max(200),
  deviceId: z.string().trim().min(4, 'Identificador do aparelho ausente.').max(128),
});

const logoutSchema = z.object({
  refreshToken: z.string().trim().min(20).max(200),
});

/** Mensagem por motivo da recusa: o app decide entre renovar e pedir login. */
const MOTIVO: Record<string, { status: number; mensagem: string }> = {
  nao_encontrada: { status: 401, mensagem: 'Sessao nao encontrada. Entre novamente.' },
  revogada: { status: 401, mensagem: 'Este acesso foi encerrado. Fale com o responsavel.' },
  expirada: { status: 401, mensagem: 'Sessao expirada. Entre novamente.' },
  reuso: {
    status: 401,
    mensagem: 'Detectamos uso do acesso em duplicidade. Por seguranca, entre novamente.',
  },
  device_divergente: { status: 401, mensagem: 'Este acesso pertence a outro aparelho.' },
};

/* ------------------------------------------------------------------ */
/* POST /api/device/login                                              */
/* ------------------------------------------------------------------ */

/**
 * Login do funcionario pelo codigo de 6 caracteres.
 *
 * O codigo sozinho identifica o restaurante E a pessoa — o funcionario nao
 * escolhe a loja. Por isso a resposta ja traz o branding: e com ele que o app
 * troca a identidade visual de "Vapt" para a do restaurante.
 *
 * Mensagem UNICA para codigo inexistente e codigo bloqueado seria o ideal de
 * seguranca, mas aqui atrapalha mais do que protege: o funcionario bloqueado
 * precisa saber que deve falar com o gerente, e nao ficar redigitando um
 * codigo que ele sabe estar certo. O codigo nao e segredo de alto valor —
 * circula no balcao — e o vinculo com o aparelho e a defesa real.
 */
export const deviceLogin = asyncHandler(async (req: Request, res: Response) => {
  const body = loginSchema.parse(req.body);

  const match = await findEmployeeByCode(body.code);

  if (!match) {
    throw new HttpError(401, 'Codigo invalido. Confira com o responsavel.', [
      { field: 'code', message: 'Codigo nao encontrado.' },
    ]);
  }

  if (match.blocked) {
    throw new HttpError(403, 'Seu acesso esta bloqueado. Fale com o responsavel.', [
      { field: 'code', message: 'Acesso bloqueado.' },
    ]);
  }

  const sessao = await issueSession({
    appId: match.appId,
    employeeId: match.employeeId,
    permissions: match.permissions,
    device: { deviceId: body.deviceId, deviceName: body.deviceName, platform: body.platform },
    req,
  });

  // Registra o acesso sem arrastar o documento inteiro do app.
  await AppProject.updateOne(
    { _id: match.appId, 'employees._id': match.employeeId },
    { $set: { 'employees.$.lastLoginAt': new Date() } }
  );

  return res.json({
    ok: true,
    data: {
      accessToken: sessao.accessToken,
      refreshToken: sessao.refreshToken,
      expiresIn: sessao.expiresIn,
      employee: {
        id: match.employeeId,
        name: match.employeeName,
        role: match.roleName,
        permissions: match.permissions,
        isDeliveryman: match.isDeliveryman,
        onboardingCompleted: match.onboardingCompleted,
        profile: match.profile,
      },
      /** O app aplica isto globalmente: cores, logo e nome do restaurante. */
      branding: match.branding,
      appId: match.appId,
    },
  });
});

/* ------------------------------------------------------------------ */
/* PATCH /api/device/profile                                           */
/* ------------------------------------------------------------------ */

/**
 * Onboarding e edicao do perfil do funcionario.
 *
 * Mesma rota para os dois casos: no primeiro acesso ela marca
 * `onboardingCompleted`, depois serve para corrigir os dados. Nao ha motivo
 * para dois endpoints que gravam os mesmos tres campos.
 *
 * So o proprio funcionario escreve aqui — o `req.device.sub` vem do token, e
 * nao do corpo, entao nao ha como editar o perfil de outra pessoa.
 */
export const deviceUpdateProfile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.device) throw new HttpError(401, 'Sessao do aplicativo invalida.');

  const body = profileSchema.parse(req.body);

  const resultado = await AppProject.updateOne(
    { _id: req.device.app, 'employees._id': req.device.sub },
    {
      $set: {
        'employees.$.phone': body.phone,
        'employees.$.cpf': body.cpf,
        'employees.$.birthDate': body.birthDate,
        'employees.$.onboardingCompleted': true,
      },
    }
  );

  if (resultado.matchedCount === 0) {
    throw new HttpError(404, 'Funcionario nao encontrado.');
  }

  return res.json({
    ok: true,
    data: {
      profile: {
        phone: body.phone,
        cpf: body.cpf,
        birthDate: body.birthDate,
      },
      onboardingCompleted: true,
    },
    message: 'Perfil atualizado.',
  });
});

/* ------------------------------------------------------------------ */
/* POST /api/device/refresh                                            */
/* ------------------------------------------------------------------ */

export const deviceRefresh = asyncHandler(async (req: Request, res: Response) => {
  const body = refreshSchema.parse(req.body);

  const resultado = await rotateSession({
    refreshToken: body.refreshToken,
    deviceId: body.deviceId,
    req,
  });

  if (!resultado.ok) {
    const { status, mensagem } = MOTIVO[resultado.reason] ?? MOTIVO.nao_encontrada;
    throw new HttpError(status, mensagem, [{ field: 'refreshToken', message: resultado.reason }]);
  }

  return res.json({
    ok: true,
    data: {
      accessToken: resultado.session.accessToken,
      refreshToken: resultado.session.refreshToken,
      expiresIn: resultado.session.expiresIn,
      permissions: resultado.permissions,
      appId: resultado.appId,
      employeeId: resultado.employeeId,
    },
  });
});

/* ------------------------------------------------------------------ */
/* POST /api/device/logout                                             */
/* ------------------------------------------------------------------ */

/**
 * Encerra a sessao do aparelho.
 *
 * Responde 200 mesmo quando o token ja nao existe: o app precisa conseguir
 * limpar o armazenamento local de qualquer jeito. Um 404 aqui deixaria o
 * usuario preso numa tela de "saindo..." por um token que ja estava morto.
 */
export const deviceLogout = asyncHandler(async (req: Request, res: Response) => {
  const body = logoutSchema.parse(req.body);
  const encerrada = await revokeSessionByRefresh(body.refreshToken);

  return res.json({
    ok: true,
    data: { encerrada },
    message: 'Sessao encerrada.',
  });
});

/* ------------------------------------------------------------------ */
/* GET /api/device/sessions                                            */
/* ------------------------------------------------------------------ */

/** Aparelhos ativos do funcionario autenticado. */
export const deviceSessions = asyncHandler(async (req: Request, res: Response) => {
  if (!req.device) throw new HttpError(401, 'Sessao do aplicativo invalida.');

  const sessoes = await listActiveSessions(req.device.sub);

  return res.json({
    ok: true,
    data: {
      sessions: sessoes.map((s) => ({
        deviceId: s.deviceId,
        deviceName: s.deviceName,
        platform: s.platform,
        lastUsedAt: s.lastUsedAt,
        createdAt: s.createdAt,
        /** Marca qual da lista e o aparelho que fez esta chamada. */
        atual: s.deviceId === req.device?.did,
      })),
    },
  });
});

/* ------------------------------------------------------------------ */
/* GET /api/device/me                                                  */
/* ------------------------------------------------------------------ */

/** Sonda barata para o app confirmar que o access token ainda vale. */
export const deviceMe = asyncHandler(async (req: Request, res: Response) => {
  if (!req.device) throw new HttpError(401, 'Sessao do aplicativo invalida.');

  return res.json({
    ok: true,
    data: {
      employeeId: req.device.sub,
      appId: req.device.app,
      deviceId: req.device.did,
      permissions: req.device.perms,
    },
  });
});
