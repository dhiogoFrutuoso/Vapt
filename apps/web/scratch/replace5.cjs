const fs = require('fs');
let d = fs.readFileSync('src/pages/DashboardPage.tsx', 'utf8');
let e = fs.readFileSync('src/pages/EditorPage.tsx', 'utf8');

d = d.replace(/WebkitOverflowScrolling: 'touch', WebkitOverflowScrolling: 'touch'/g, "WebkitOverflowScrolling: 'touch'");
e = e.replace(/WebkitOverflowScrolling: 'touch', WebkitOverflowScrolling: 'touch'/g, "WebkitOverflowScrolling: 'touch'");
e = e.replace(/pricingType: prodPricingType,\s*pricingType: prodPricingType,/g, "pricingType: prodPricingType,");

fs.writeFileSync('src/pages/DashboardPage.tsx', d);
fs.writeFileSync('src/pages/EditorPage.tsx', e);
