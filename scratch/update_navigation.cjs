const fs = require('fs');
const path = require('path');

const cwd = 'c:/Users/seuma/Desktop/PROJETOS/Vapt';

// 1. Update Navbar.tsx
const navPath = path.join(cwd, 'apps/web/src/sections/Navbar.tsx');
let navTs = fs.readFileSync(navPath, 'utf8');

// mobile actions
navTs = navTs.replace(
  /(<Link className="btn btn--primary" to="\/painel" onClick=\{.*?\}\s*>\s*Ir para o painel\s*<\/Link>)/,
  `<>
                $1
                {user?.isAdmin && (
                  <Link className="btn btn--outline" to="/admin" onClick={() => setOpen(false)} style={{ borderColor: '#ef4444', color: '#ef4444', marginTop: '8px' }}>
                    Painel Admin
                  </Link>
                )}
              </>`
);

// desktop actions
navTs = navTs.replace(
  /(<Link className="btn btn--primary nav__cta" to="\/painel">\s*Ir para o painel\s*<\/Link>)/,
  `<>
              {user?.isAdmin && (
                <Link className="btn btn--ghost" to="/admin" style={{ color: '#ef4444' }}>
                  Painel Admin
                </Link>
              )}
              $1
            </>`
);
fs.writeFileSync(navPath, navTs);


// 2. Update DashboardPage.tsx
const dashPath = path.join(cwd, 'apps/web/src/pages/DashboardPage.tsx');
let dashTs = fs.readFileSync(dashPath, 'utf8');
dashTs = dashTs.replace(/\{user\.isAdmin && \(/g, '{user?.isAdmin && (');
fs.writeFileSync(dashPath, dashTs);


// 3. Update AdminPage.tsx
const adminPath = path.join(cwd, 'apps/web/src/pages/AdminPage.tsx');
let adminTs = fs.readFileSync(adminPath, 'utf8');

if (!adminTs.includes('ArrowLeft')) {
  adminTs = adminTs.replace(/import \{ Shield, Search, UserIcon, X, Calendar, Database, LinkIcon, Activity \} from 'lucide-react';/, "import { Shield, Search, UserIcon, X, Calendar, Database, LinkIcon, Activity, ArrowLeft } from 'lucide-react';");
  // The lucide-react import may be different. Let's find it.
}

// Find lucide react import
adminTs = adminTs.replace(/import \{([^}]+)\} from 'lucide-react';/, (match, imports) => {
  if (!imports.includes('ArrowLeft')) {
    return `import {${imports}, ArrowLeft} from 'lucide-react';`;
  }
  return match;
});

// Update the button
adminTs = adminTs.replace(
  /<Link to="\/painel" style=\{\{ padding: '8px 16px', backgroundColor: '#334155', color: '#f8fafc', borderRadius: '8px', textDecoration: 'none', fontWeight: 600 \}\}>Voltar ao Painel<\/Link>/,
  `<Link to="/painel" style={{ padding: '8px 16px', backgroundColor: '#334155', color: '#f8fafc', borderRadius: '8px', textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', transition: 'background-color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#475569'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#334155'}><ArrowLeft size={18} /> Voltar para o Painel</Link>`
);

fs.writeFileSync(adminPath, adminTs);

console.log('Navigation links updated');
