import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'apps', 'web', 'src', 'lib', 'api.ts');
let content = fs.readFileSync(file, 'utf8');

// Insert new types before AppProjectFull
const newTypes = `
export type Role = {
  _id: string;
  name: string;
  permissions: string[];
};

export type Employee = {
  _id: string;
  name: string;
  roleId: string;
  accessCode: string;
};
`;

content = content.replace('export type AppProjectFull = {', newTypes + '\nexport type AppProjectFull = {');

content = content.replace('tables: Table[];', 'tables: Table[];\n  roles: Role[];\n  employees: Employee[];');

// Add new API methods at the end of the api object
const newMethods = `
  addRole: (appId: string, role: { name: string; permissions: string[] }) =>
    request<Role>(\`/apps/\${appId}/roles\`, { method: 'POST', body: JSON.stringify(role) }),
  updateRole: (appId: string, roleId: string, updates: { name?: string; permissions?: string[] }) =>
    request<Role>(\`/apps/\${appId}/roles/\${roleId}\`, { method: 'PATCH', body: JSON.stringify(updates) }),
  removeRole: (appId: string, roleId: string) =>
    request<{ deleted: true }>(\`/apps/\${appId}/roles/\${roleId}\`, { method: 'DELETE' }),

  addEmployee: (appId: string, emp: { name: string; roleId: string }) =>
    request<Employee>(\`/apps/\${appId}/employees\`, { method: 'POST', body: JSON.stringify(emp) }),
  updateEmployee: (appId: string, empId: string, updates: { name?: string; roleId?: string }) =>
    request<Employee>(\`/apps/\${appId}/employees/\${empId}\`, { method: 'PATCH', body: JSON.stringify(updates) }),
  removeEmployee: (appId: string, empId: string) =>
    request<{ deleted: true }>(\`/apps/\${appId}/employees/\${empId}\`, { method: 'DELETE' }),
};`;

content = content.replace(/};\s*$/, newMethods + '\n');

fs.writeFileSync(file, content, 'utf8');
