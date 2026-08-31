import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'apps', 'web', 'src', 'pages', 'EditorPage.tsx');
let content = fs.readFileSync(file, 'utf8');

// Replace Header border with a nice shadow
const oldHeader = `<header style={{ padding: '12px 24px', backgroundColor: sidebarBg, borderBottom: \`2px solid \${borderColor}\`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>`;
const newHeader = `<header style={{ padding: '16px 32px', backgroundColor: sidebarBg, borderBottom: \`1px solid \${borderColor}\`, boxShadow: isDark ? '0 4px 12px rgba(0,0,0,0.2)' : '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>`;
content = content.replace(oldHeader, newHeader);

// Fix Plan button
const oldPlanBtn = `style={{ backgroundColor: '#22c55e', color: '#fff', padding: '8px 16px', borderRadius: '10px', textDecoration: 'none', fontWeight: 'bold', border: \`1px solid \${borderColor}\` }}`;
const newPlanBtn = `style={{ backgroundColor: '#10b981', color: '#ffffff', padding: '8px 20px', borderRadius: '10px', textDecoration: 'none', fontWeight: 700, border: 'none', boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.2)' }}`;
content = content.replace(oldPlanBtn, newPlanBtn);

// Make the H1 look better
content = content.replace(
  `<h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Editor: {app.name}</h1>`,
  `<h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, background: isDark ? 'linear-gradient(to right, #60a5fa, #a78bfa)' : 'linear-gradient(to right, #2563eb, #7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{app.name}</h1>`
);

// Sidebar background should be a bit lighter in dark mode or have a slight border right
const oldSidebar = `<aside style={{ width: '420px', backgroundColor: sidebarBg, borderRight: \`2px solid \${borderColor}\`, overflowY: 'auto', display: mobileTab === 'editor' ? 'flex' : 'none', flexDirection: 'column', flexShrink: 0 }} className="editor-sidebar">`;
const newSidebar = `<aside style={{ width: '420px', backgroundColor: sidebarBg, borderRight: \`1px solid \${borderColor}\`, overflowY: 'auto', display: mobileTab === 'editor' ? 'flex' : 'none', flexDirection: 'column', flexShrink: 0, zIndex: 5, boxShadow: isDark ? 'none' : '4px 0 12px rgba(0,0,0,0.02)' }} className="editor-sidebar">`;
content = content.replace(oldSidebar, newSidebar);


fs.writeFileSync(file, content, 'utf8');
