const fs = require('fs');
let ed = fs.readFileSync('src/pages/EditorPage.tsx', 'utf8');
if (ed.includes('touchAction')) {
  ed = ed.replace(/touchAction:\s*['"]none['"]/g, "touchAction: 'auto'");
  fs.writeFileSync('src/pages/EditorPage.tsx', ed);
}
