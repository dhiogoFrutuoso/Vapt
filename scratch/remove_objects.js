import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'apps', 'web', 'src', 'pages', 'EditorPage.tsx');
let content = fs.readFileSync(file, 'utf8');

const regex = /const panelBg = isDark \? '#0f172a' : '#f8fafc';[\s\S]*?fontSize: '0\.9rem'\n  };\n/g;
content = content.replace(regex, '');

fs.writeFileSync(file, content, 'utf8');
