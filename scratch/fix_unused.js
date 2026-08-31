import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'apps', 'web', 'src', 'pages', 'EditorPage.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/const panelBg = isDark \? '#020617' : '#f1f5f9';.*\n/g, '');
content = content.replace(/const sidebarBg = isDark \? '#0f172a' : '#ffffff';.*\n/g, '');
content = content.replace(/const textColor = isDark \? '#f8fafc' : '#0f172a';.*\n/g, '');
content = content.replace(/const borderColor = isDark \? '#1e293b' : '#e2e8f0';.*\n/g, '');
content = content.replace(/const accentColor = isDark \? '#3b82f6' : '#2563eb';.*\n/g, '');

content = content.replace(/const inputStyle: React\.CSSProperties = \{[\s\S]*?\};\n/g, '');
content = content.replace(/const btnStyle: React\.CSSProperties = \{[\s\S]*?\};\n/g, '');
content = content.replace(/const secondaryBtnStyle: React\.CSSProperties = \{[\s\S]*?\};\n/g, '');

// There is one reference to borderColor in `<div className="mobile-tabs" style={{ display: 'none', width: '100%', backgroundColor: "var(--ep-sidebar)", borderBottom: \`2px solid \${borderColor}\` }}>`
content = content.replace(/\$\{borderColor\}/g, 'var(--ep-border)');

fs.writeFileSync(file, content, 'utf8');
