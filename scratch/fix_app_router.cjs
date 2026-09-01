const fs = require('fs');

let appTsx = fs.readFileSync('apps/web/src/App.tsx', 'utf8');

const adminRouteBlock = `      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminPage />
          </AdminRoute>
        }
      />
`;

if (!appTsx.includes('<AdminRoute>')) {
  // Add AdminRoute import
  appTsx = appTsx.replace(/import \{ ProtectedRoute \} from '\.\/components\/ProtectedRoute';/, "import { ProtectedRoute } from './components/ProtectedRoute';\nimport { AdminRoute } from './components/AdminRoute';");
  
  // Insert Route
  appTsx = appTsx.replace(/<Route\s*path="\/painel"\s*element=\{[\s\S]*?\}\s*\/>/, (match) => {
    return match + '\n' + adminRouteBlock;
  });
  
  fs.writeFileSync('apps/web/src/App.tsx', appTsx);
}
