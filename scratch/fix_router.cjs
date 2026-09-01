const fs = require('fs');

let appTsx = fs.readFileSync('apps/web/src/App.tsx', 'utf8');
const adminRouteBlock = `        <Route element={<AdminRoute />}>
          <Route path="/admin" element={<AdminPage />} />
        </Route>
`;
if (!appTsx.includes('<AdminPage />')) {
  appTsx = appTsx.replace(/(<Route path="\/painel\/app\/:appId" element=\{<EditorPage \/>\} \/>\s*<\/Route>)/, '$1\n' + adminRouteBlock);
  fs.writeFileSync('apps/web/src/App.tsx', appTsx);
}

let adminPage = fs.readFileSync('apps/web/src/pages/AdminPage.tsx', 'utf8');
adminPage = adminPage.replace(/useState<User \| null>/g, 'useState<AuthUser | null>');
adminPage = adminPage.replace(/<User \/ null>/g, '<AuthUser | null>');
adminPage = adminPage.replace(/users: User\[\]/g, 'users: AuthUser[]');
adminPage = adminPage.replace(/useState<User\[\]>/g, 'useState<AuthUser[]>');
adminPage = adminPage.replace(/selectedUser: User \| null/g, 'selectedUser: AuthUser | null');
fs.writeFileSync('apps/web/src/pages/AdminPage.tsx', adminPage);
