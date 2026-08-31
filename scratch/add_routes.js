import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'apps', 'api', 'src', 'routes', 'index.ts');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/requestPlan,/g, 'requestPlan, addRole, updateRole, removeRole, addEmployee, updateEmployee, removeEmployee,');

content += `
router.post('/apps/:id/roles', requireAuth, writeLimiter, addRole);
router.patch('/apps/:id/roles/:roleId', requireAuth, writeLimiter, updateRole);
router.delete('/apps/:id/roles/:roleId', requireAuth, writeLimiter, removeRole);
router.post('/apps/:id/employees', requireAuth, writeLimiter, addEmployee);
router.patch('/apps/:id/employees/:empId', requireAuth, writeLimiter, updateEmployee);
router.delete('/apps/:id/employees/:empId', requireAuth, writeLimiter, removeEmployee);
`;

fs.writeFileSync(file, content, 'utf8');
