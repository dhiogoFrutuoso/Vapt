const fs = require('fs');
const files = [
  'apps/web/src/sections/Navbar.tsx',
  'apps/web/src/sections/Footer.tsx',
  'apps/web/src/components/auth/AuthLayout.tsx'
];

files.forEach(f => {
  let c = fs.readFileSync(f, 'utf8');
  c = c.replace(/delivery \+ caixa/g, 'aplicativos rápidos');
  fs.writeFileSync(f, c, 'utf8');
});
