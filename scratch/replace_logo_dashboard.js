const fs = require('fs');

let c = fs.readFileSync('apps/web/src/pages/DashboardPage.tsx', 'utf8');
c = c.replace(/<span className="nav__logo-mark">F<\/span>/g, '<img src="/vapt-logo.png" alt="VaptApp" style={{ height: "38px", width: "auto", objectFit: "contain" }} />');
fs.writeFileSync('apps/web/src/pages/DashboardPage.tsx', c, 'utf8');
