const fs = require('fs');

let d = fs.readFileSync('src/pages/EditorPage.tsx', 'utf8');

// 1. Corrigir o Conteiner Principal (.editor-main)
// Replace justifyContent: 'center' with justifyContent: 'flex-start', flexDirection: 'column'
d = d.replace(/justifyContent:\s*'center'/, "justifyContent: 'flex-start', flexDirection: 'column'");

// 2. Centralizar o Mockup via Margem
// find: maxWidth: viewMode === 'fullscreen' ? '100%' : '1200px', display: 'flex', flexDirection: 'column'
d = d.replace(/maxWidth:\s*viewMode === 'fullscreen' \? '100%' : '1200px',\s*display:\s*'flex',\s*flexDirection:\s*'column'/, "maxWidth: viewMode === 'fullscreen' ? '100%' : '1200px', display: 'flex', flexDirection: 'column', margin: '0 auto'");

fs.writeFileSync('src/pages/EditorPage.tsx', d);

let p = fs.readFileSync('src/components/PhonePreview.tsx', 'utf8');
// 3. Garantir o Scroll Interno na area de renderizacao de categorias
p = p.replace(/<div className="phone__content"/g, "<div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }} className=\"phone__content\"");
fs.writeFileSync('src/components/PhonePreview.tsx', p);
