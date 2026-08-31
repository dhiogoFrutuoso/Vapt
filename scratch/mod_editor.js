import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'apps', 'web', 'src', 'pages', 'EditorPage.tsx');
let content = fs.readFileSync(file, 'utf8');

// Remove Marca e Visual section completely.
// It starts with `{/* Identidade */}` and ends before `{/* Cardápio e Categorias */}`
content = content.replace(/\{\/\* Identidade \*\/\}.*?\{\/\* Cardápio e Categorias \*\/\}/s, '{/* Cardápio e Categorias */}');

// Remove Save App state and functions, since it moved to dashboard
content = content.replace(/const \[isSavingApp.*?\n/g, '');
content = content.replace(/async function handleSaveApp.*?\n\s+alert\('Erro ao salvar'\);\n\s+\}\n\s+\}\n/s, '');

fs.writeFileSync(file, content, 'utf8');
