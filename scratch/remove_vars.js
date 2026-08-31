import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'apps', 'web', 'src', 'pages', 'EditorPage.tsx');
let lines = fs.readFileSync(file, 'utf8').split('\\n');

// Find the line with isDark
const idx = lines.findIndex(l => l.includes("const isDark = editorTheme === 'escuro';"));
if (idx !== -1) {
  // Remove the next 15 lines (which contain panelBg, sidebarBg, textColor, borderColor, inputStyle, btnStyle)
  lines.splice(idx + 1, 15);
}

fs.writeFileSync(file, lines.join('\\n'), 'utf8');
