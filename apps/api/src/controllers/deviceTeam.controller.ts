import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { AppProject } from '../models/AppProject.js';
import { emitSessionRevoked, emitTeamChanged } from '../realtime/io.js';
import { revokeAllForEmployee } from '../services/deviceSession.js';
import { HttpError } from '../utils/httpError.js';
import { effectivePermissions, planAccess, rolePermissions } from '../utils/planAccess.js';

const updateEmployeeSchema = z.object({
  name: z.string().trim().min(2).max(60),
  roleId: z.string().trim().min(1),
});

function serializeEmployee(app: any, employee: any) {
  const role = app.roles.id(employee.roleId);
  const permissions = effectivePermissions(app.appPlanType, (role?.permissions ?? []).map(String));

  return {
    id: String(employee._id),
    name: String(employee.name),
    roleId: String(employee.roleId),
    roleName: String(role?.name ?? 'Sem tag'),
    permissions,
    isDeliveryman: planAccess(app.appPlanType).delivery && (employee.isDeliveryman === true || role?.permissions?.includes('entregador') === true),
    blocked: employee.blocked === true,
  };
}

/** Gestão da equipe pelo aplicativo, restrita pela rota à permissão administrativa. */
export const listDeviceTeam = asyncHandler(async (req: Request, res: Response) => {
  const app = await AppProject.findById(req.device!.app).select('employees roles appPlanType');
  if (!app) throw HttpError.notFound('Restaurante nao encontrado.');

  return res.json({
    ok: true,
    data: {
      roles: app.roles.map((role: any) => ({
        id: String(role._id),
        name: String(role.name),
        permissions: rolePermissions(app.appPlanType, (role.permissions ?? []).map(String)),
      })).filter(role => role.permissions.length),
      employees: app.employees.map((employee: any) => serializeEmployee(app, employee)),
    },
  });
});

/** Edita somente nome e tag. Dados pessoais continuam pertencendo ao funcionário. */
export const updateDeviceEmployee = asyncHandler(async (req: Request, res: Response) => {
  const app = await AppProject.findById(req.device!.app).select('employees roles appPlanType');
  if (!app) throw HttpError.notFound('Restaurante nao encontrado.');

  const employee = app.employees.id(req.params.empId);
  if (!employee) throw HttpError.notFound('Funcionario nao encontrado.');

  const body = updateEmployeeSchema.parse(req.body);
  const role = app.roles.id(body.roleId);
  if (!role) throw HttpError.badRequest('Tag de funcao invalida.');
  if (!rolePermissions(app.appPlanType, role.permissions).length) throw new HttpError(403, 'Esta função não está incluída neste plano.');

  const roleChanged = String(employee.roleId) !== String(role._id);
  employee.name = body.name;
  employee.roleId = role._id;
  employee.isDeliveryman = planAccess(app.appPlanType).delivery && role.permissions.includes('entregador');
  await app.save();

  if (roleChanged) {
    await revokeAllForEmployee(String(employee._id), 'admin');
    emitSessionRevoked(String(app._id), String(employee._id), 'funcao_alterada');
  }

  emitTeamChanged(String(app._id), { employeeId: String(employee._id) });

  return res.json({
    ok: true,
    data: { employee: serializeEmployee(app, employee) },
    message: 'Funcionario atualizado.',
  });
});
