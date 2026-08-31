import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'apps', 'api', 'src', 'controllers', 'apps.controller.ts');
let content = fs.readFileSync(file, 'utf8');

const additionalControllers = `
/* ------------------------- Roles ------------------------- */

export const addRole = asyncHandler(async (req: Request, res: Response) => {
  const app = await AppProject.findOne({ _id: req.params.id, owner: req.user!.id });
  if (!app) throw HttpError.notFound('App nao encontrado');

  const newRole = { name: req.body.name, permissions: req.body.permissions || [] };
  app.roles.push(newRole as any);
  await app.save();
  
  const created = app.roles[app.roles.length - 1];
  res.json({ ok: true, data: created });
});

export const updateRole = asyncHandler(async (req: Request, res: Response) => {
  const app = await AppProject.findOne({ _id: req.params.id, owner: req.user!.id });
  if (!app) throw HttpError.notFound('App nao encontrado');

  const role = app.roles.id(req.params.roleId);
  if (!role) throw HttpError.notFound('Funcao nao encontrada');

  if (req.body.name !== undefined) role.name = req.body.name;
  if (req.body.permissions !== undefined) role.permissions = req.body.permissions;
  
  await app.save();
  res.json({ ok: true, data: role });
});

export const removeRole = asyncHandler(async (req: Request, res: Response) => {
  const app = await AppProject.findOne({ _id: req.params.id, owner: req.user!.id });
  if (!app) throw HttpError.notFound('App nao encontrado');

  const role = app.roles.id(req.params.roleId);
  if (role) {
    role.deleteOne();
    await app.save();
  }
  res.json({ ok: true, data: { deleted: true } });
});

/* ----------------------- Employees ----------------------- */

function generateAccessCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export const addEmployee = asyncHandler(async (req: Request, res: Response) => {
  const app = await AppProject.findOne({ _id: req.params.id, owner: req.user!.id });
  if (!app) throw HttpError.notFound('App nao encontrado');

  const roleExists = app.roles.id(req.body.roleId);
  if (!roleExists) throw HttpError.badRequest('Funcao invalida');

  const accessCode = generateAccessCode();
  const newEmployee = { name: req.body.name, roleId: req.body.roleId, accessCode };
  app.employees.push(newEmployee as any);
  await app.save();
  
  const created = app.employees[app.employees.length - 1];
  res.json({ ok: true, data: created });
});

export const updateEmployee = asyncHandler(async (req: Request, res: Response) => {
  const app = await AppProject.findOne({ _id: req.params.id, owner: req.user!.id });
  if (!app) throw HttpError.notFound('App nao encontrado');

  const emp = app.employees.id(req.params.empId);
  if (!emp) throw HttpError.notFound('Funcionario nao encontrado');

  if (req.body.name !== undefined) emp.name = req.body.name;
  if (req.body.roleId !== undefined) {
    if (!app.roles.id(req.body.roleId)) throw HttpError.badRequest('Funcao invalida');
    emp.roleId = req.body.roleId;
  }
  
  await app.save();
  res.json({ ok: true, data: emp });
});

export const removeEmployee = asyncHandler(async (req: Request, res: Response) => {
  const app = await AppProject.findOne({ _id: req.params.id, owner: req.user!.id });
  if (!app) throw HttpError.notFound('App nao encontrado');

  const emp = app.employees.id(req.params.empId);
  if (emp) {
    emp.deleteOne();
    await app.save();
  }
  res.json({ ok: true, data: { deleted: true } });
});
`;

fs.writeFileSync(file, content + '\n' + additionalControllers, 'utf8');
console.log('Appended Role and Employee controllers');
