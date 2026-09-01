const fs = require('fs');
const files = [
  'src/pages/DashboardPage.tsx',
  'src/pages/EditorPage.tsx'
];
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/overflowY:\s*'auto'/g, "overflowY: 'auto', WebkitOverflowScrolling: 'touch'");
  fs.writeFileSync(file, content);
});
