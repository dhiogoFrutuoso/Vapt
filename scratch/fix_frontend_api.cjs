const fs = require('fs');
const path = require('path');

const cwd = 'c:/Users/seuma/Desktop/PROJETOS/Vapt';
const apiTsPath = path.join(cwd, 'apps/web/src/lib/api.ts');
let apiTs = fs.readFileSync(apiTsPath, 'utf8');

// 1. Update AuthUser interface
if (!apiTs.includes('isAdmin?: boolean;')) {
  apiTs = apiTs.replace(/role: 'owner' \| 'admin';/, "role: 'owner' | 'admin';\n  isAdmin?: boolean;");
}

// 2. Add getAdminUsers
if (!apiTs.includes('getAdminUsers: (')) {
  const getAdminUsersCode = `  getAdminUsers: (page: number, limit: number, search: string, isSubscribed: string, plan: string) => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (search) params.append('search', search);
    if (isSubscribed) params.append('isSubscribed', isSubscribed);
    if (plan) params.append('plan', plan);

    return request<{ users: AuthUser[], totalPages: number, currentPage: number, totalUsers: number }>(\`/admin/users?\${params.toString()}\`);
  },
`;
  apiTs = apiTs.replace(/export const api = \{([\s\S]*)\};/, (match, p1) => {
    return `export const api = {${p1}\n${getAdminUsersCode}};`;
  });
  fs.writeFileSync(apiTsPath, apiTs);
}

// Update AdminPage to use AuthUser
const adminPagePath = path.join(cwd, 'apps/web/src/pages/AdminPage.tsx');
let adminPage = fs.readFileSync(adminPagePath, 'utf8');
adminPage = adminPage.replace(/type User/g, "type AuthUser");
adminPage = adminPage.replace(/<User>/g, "<AuthUser>");
adminPage = adminPage.replace(/<User \| null>/g, "<AuthUser | null>");
adminPage = adminPage.replace(/users: User\[\]/g, "users: AuthUser[]");
adminPage = adminPage.replace(/selectedUser: User \| null/g, "selectedUser: AuthUser | null");
fs.writeFileSync(adminPagePath, adminPage);

console.log("Fixed API integration");
