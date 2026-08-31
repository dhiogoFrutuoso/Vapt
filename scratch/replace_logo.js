const fs = require('fs');
const files = [
  'apps/web/src/sections/Navbar.tsx',
  'apps/web/src/sections/Footer.tsx',
  'apps/web/src/components/auth/AuthLayout.tsx'
];

files.forEach(f => {
  let c = fs.readFileSync(f, 'utf8');
  c = c.replace(/<span className="nav__logo-mark">F<\/span>/g, '<img src="/vapt-logo.png" alt="VaptApp" style={{ height: "38px", width: "auto", objectFit: "contain" }} />');
  fs.writeFileSync(f, c, 'utf8');
});
