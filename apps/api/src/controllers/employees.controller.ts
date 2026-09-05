import type { Request, Response } from 'express';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { AppProject } from '../models/AppProject.js';
import { revokeAllForEmployee, listActiveSessions } from '../services/deviceSession.js';
import { generateUniqueEmployeeCode } from '../services/employeeLookup.js';
import { HttpError } from '../utils/httpError.js';

/**
 * Gestão da equipe pelo dono do restaurante.
 *
 * O dono VÊ os dados do funcionário (CPF, contato, nascimento) mas não os
 * edita: são dados pessoais de outra pessoa, preenchidos por ela no
 * onboarding do app. Quem corrige um CPF errado é o dono do CPF.
 */

/** Carrega o app garantindo que o solicitante é o dono. */
async function carregarApp(req: Request) {
  const app = await AppProject.findOne({ _id: req.params.id, owner: req.user!.id });
  if (!app) throw HttpError.notFound('Aplicativo nao encontrado.');
  return app;
}

/* ------------------------------------------------------------------ */
/* GET /api/apps/:id/employees                                         */
/* ------------------------------------------------------------------ */

/**
 * Lista a equipe com os dados de leitura e os aparelhos conectados.
 *
 * O `accessCode` SAI aqui — é a credencial que o dono precisa ditar para o
 * funcionário, e ele é o único que pode vê-la. Fora desta rota (autenticada e
 * restrita ao dono), o código nunca aparece: o cardápio público monta a
 * resposta por lista branca, e o app do funcionário nunca recebe o código de
 * volta.
 */
export const listEmployees = asyncHandler(async (req: Request, res: Response) => {
  const app = await carregarApp(req);

  const equipe = await Promise.all(
    (app.employees ?? []).map(async (e: Record<string, any>) => {
      const role = (app.roles ?? []).find((r: Record<string, any>) => String(r._id) === String(e.roleId));
      const sessoes = await listActiveSessions(String(e._id));

      return {
        id: String(e._id),
        name: e.name,
        roleId: String(e.roleId),
        roleName: role?.name ?? 'Sem funcao',
        permissions: (role?.permissions ?? []).map(String),
        accessCode: e.accessCode ?? null,
        blocked: e.blocked === true,
        blockedAt: e.blockedAt ?? null,
        onboardingCompleted: e.onboardingCompleted === true,
        lastLoginAt: e.lastLoginAt ?? null,
        createdAt: e.createdAt ?? null,
        /* Somente leitura. O dono confere, nao corrige. */
        profile: {
          phone: e.phone ?? '',
          cpf: e.cpf ?? '',
          birthDate: e.birthDate ?? null,
        },
        devices: sessoes.map((s) => ({
          deviceName: s.deviceName || 'Aparelho',
          platform: s.platform,
          lastUsedAt: s.lastUsedAt,
        })),
      };
    })
  );

  return res.json({ ok: true, data: { employees: equipe } });
});

/* ------------------------------------------------------------------ */
/* POST /api/apps/:id/employees/:empId/block                           */
/* ------------------------------------------------------------------ */

/**
 * Bloqueia o funcionário.
 *
 * Duas ações, e a ORDEM importa: primeiro apaga o código, depois derruba as
 * sessões. Invertendo, existe uma janela entre a revogação e a remoção do
 * código em que o funcionário faria login de novo e ganharia uma sessão nova —
 * o bloqueio pareceria não funcionar.
 *
 * O código é apagado, não guardado: um código que continuasse valendo depois
 * do bloqueio seria uma porta aberta. Desbloquear gera outro.
 */
export const blockEmployee = asyncHandler(async (req: Request, res: Response) => {
  const app = await carregarApp(req);
  const emp = app.employees.id(req.params.empId);
  if (!emp) throw HttpError.notFound('Funcionario nao encontrado.');

  if (emp.blocked) {
    return res.json({ ok: true, data: { blocked: true, sessoesEncerradas: 0 }, message: 'Ja estava bloqueado.' });
  }

  emp.set({ blocked: true, blockedAt: new Date(), accessCode: null });
  await app.save();

  const sessoesEncerradas = await revokeAllForEmployee(req.params.empId, 'bloqueio');

  console.info(`[equipe] ${emp.name} bloqueado. ${sessoesEncerradas} sessao(oes) encerrada(s).`);

  return res.json({
    ok: true,
    data: { blocked: true, sessoesEncerradas },
    message: `${emp.name} foi bloqueado e o acesso encerrado.`,
  });
});

/* ------------------------------------------------------------------ */
/* POST /api/apps/:id/employees/:empId/unblock                         */
/* ------------------------------------------------------------------ */

/**
 * Desbloqueia e emite um código novo.
 *
 * O código antigo foi apagado no bloqueio e não volta — se voltasse, quem o
 * anotou durante o afastamento entraria de novo. O novo passa pelo gerador
 * seguro, que confere unicidade em toda a base.
 */
export const unblockEmployee = asyncHandler(async (req: Request, res: Response) => {
  const app = await carregarApp(req);
  const emp = app.employees.id(req.params.empId);
  if (!emp) throw HttpError.notFound('Funcionario nao encontrado.');

  const accessCode = await generateUniqueEmployeeCode();
  emp.set({ blocked: false, blockedAt: null, accessCode });
  await app.save();

  console.info(`[equipe] ${emp.name} desbloqueado com codigo novo.`);

  return res.json({
    ok: true,
    data: { blocked: false, accessCode },
    message: `${emp.name} liberado. Passe o novo codigo: ${accessCode}`,
  });
});

/* ------------------------------------------------------------------ */
/* POST /api/apps/:id/employees/:empId/regenerate-code                 */
/* ------------------------------------------------------------------ */

/**
 * Troca o código sem bloquear — para quando o funcionário perde o aparelho.
 *
 * Derruba as sessões junto: manter a sessão viva com o código novo deixaria o
 * aparelho perdido funcionando, que é exatamente o que se quer evitar.
 */
export const regenerateEmployeeCode = asyncHandler(async (req: Request, res: Response) => {
  const app = await carregarApp(req);
  const emp = app.employees.id(req.params.empId);
  if (!emp) throw HttpError.notFound('Funcionario nao encontrado.');
  if (emp.blocked) throw HttpError.badRequest('Desbloqueie o funcionario antes de gerar um codigo.');

  const accessCode = await generateUniqueEmployeeCode();
  emp.set({ accessCode });
  await app.save();

  const sessoesEncerradas = await revokeAllForEmployee(req.params.empId, 'troca_de_codigo');

  return res.json({
    ok: true,
    data: { accessCode, sessoesEncerradas },
    message: `Novo codigo: ${accessCode}`,
  });
});
