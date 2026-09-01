const fs = require('fs');
const files = [
  'src/pages/DashboardPage.tsx',
  'src/pages/EditorPage.tsx',
  'src/pages/PlanSelectionPage.tsx',
  'src/components/phone/ReceptionView.tsx'
];
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  if (!content.includes("import toast from 'react-hot-toast'")) {
    content = "import toast from 'react-hot-toast';\n" + content;
  }
  content = content.replace(/alert\('Erro(.*?)\)/g, "toast.error('Erro$1)");
  content = content.replace(/alert\('Não foi(.*?)\)/g, "toast.error('Não foi$1)");
  content = content.replace(/alert\('Insira(.*?)\)/g, "toast.error('Insira$1)");
  content = content.replace(/alert\('Configurações salvas!(.*?)\)/g, "toast.success('Configurações salvas!$1)");
  content = content.replace(/alert\(\`(.*?)\`\)/g, "toast.success(\`$1\`)");
  fs.writeFileSync(file, content);
});
