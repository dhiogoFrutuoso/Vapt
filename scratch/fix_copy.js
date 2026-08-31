import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'apps', 'web', 'src', 'components', 'phone', 'ReceptionView.tsx');
let lines = fs.readFileSync(file, 'utf8').split('\n');

const newLines = lines.filter(line => !line.includes('const copy = demo.preview;'));
fs.writeFileSync(file, newLines.join('\n'), 'utf8');
