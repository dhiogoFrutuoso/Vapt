import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'apps', 'web', 'src', 'pages', 'EditorPage.tsx');
let c = fs.readFileSync(file, 'utf8');

c = c.replace(/style=\{\{ \.\.\.btnStyle, width: 'auto'/g, 'className="ep-btn ep-btn-secondary" style={{ width: "auto"');
c = c.replace(/border: `1px solid \$\{emEdicao \? '#f97316' : borderColor\}`/g, 'border: emEdicao ? "1px solid #f97316" : "1px solid var(--ep-border)"');
c = c.replace(/border: \`1px solid \\\$\\{emEdicao \? '#f97316' : borderColor\\}\`/g, 'border: emEdicao ? "1px solid #f97316" : "1px solid var(--ep-border)"');

fs.writeFileSync(file, c, 'utf8');
