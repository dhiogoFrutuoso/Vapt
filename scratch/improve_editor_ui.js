import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'apps', 'web', 'src', 'pages', 'EditorPage.tsx');
let content = fs.readFileSync(file, 'utf8');

// 1. Replace Variables
const oldVarsRegex = /const isDark = editorTheme === 'escuro';[\s\S]*?const btnStyle = \{[^}]*\};/m;
const newVars = `const isDark = editorTheme === 'escuro';
  const panelBg = isDark ? '#020617' : '#f1f5f9'; // fundo mais elegante
  const sidebarBg = isDark ? '#0f172a' : '#ffffff';
  const textColor = isDark ? '#f8fafc' : '#0f172a';
  const borderColor = isDark ? '#1e293b' : '#e2e8f0';
  const accentColor = isDark ? '#3b82f6' : '#2563eb'; // Azul moderno

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px', borderRadius: '12px', 
    border: \`1px solid \${borderColor}\`, fontSize: '0.95rem', marginBottom: '16px',
    backgroundColor: isDark ? '#1e293b' : '#f8fafc', color: textColor,
    outline: 'none', transition: 'border-color 0.2s',
  };

  const btnStyle: React.CSSProperties = {
    width: '100%', padding: '12px 16px', borderRadius: '12px', border: 'none',
    backgroundColor: accentColor, color: '#ffffff', fontWeight: 600, cursor: 'pointer',
    fontSize: '0.95rem', transition: 'all 0.2s ease-in-out',
    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
  };
  
  const secondaryBtnStyle: React.CSSProperties = {
    ...btnStyle,
    backgroundColor: isDark ? '#1e293b' : '#f1f5f9',
    color: textColor,
    border: \`1px solid \${borderColor}\`,
    boxShadow: 'none'
  };`;
content = content.replace(oldVarsRegex, newVars);

// 2. Replace width of Sidebar from 380px to 420px
content = content.replace(/width: '380px'/g, "width: '420px'");

// 3. Update Preview main container
const oldMainRegex = /<main style=\{\{ flex: 1, padding: '24px', overflowY: 'auto', display: mobileTab === 'preview' \? 'flex' : 'none', justifyContent: 'center' \}\} className="editor-main">/m;
const newMain = `<main style={{ flex: 1, padding: '32px', overflowY: 'auto', display: mobileTab === 'preview' ? 'flex' : 'none', justifyContent: 'center', backgroundImage: isDark ? 'radial-gradient(#1e293b 1.5px, transparent 1.5px)' : 'radial-gradient(#cbd5e1 1.5px, transparent 1.5px)', backgroundSize: '24px 24px' }} className="editor-main">`;
content = content.replace(oldMainRegex, newMain);

// 4. Update max width from 1000px to 1200px
content = content.replace(/maxWidth: '1000px'/g, "maxWidth: '1200px'");

// 5. Enhance Cards/Containers inside the sidebar (border radius, padding, box shadow)
// Find the "Gerenciar Categorias" container
content = content.replace(
  /padding: '16px', backgroundColor: panelBg, borderRadius: '12px', border: `1px solid \$\{borderColor\}`/g,
  "padding: '20px', backgroundColor: panelBg, borderRadius: '16px', border: `1px solid ${borderColor}`, boxShadow: isDark ? 'none' : '0 2px 10px rgba(0,0,0,0.02)'"
);

// Find the products and tables list items to make them look like sleek cards
content = content.replace(
  /padding: '12px', backgroundColor: isDark \? '#0f172a' : '#fff', borderRadius: '10px', border: `1px solid \$\{borderColor\}`/g,
  "padding: '16px', backgroundColor: sidebarBg, borderRadius: '14px', border: `1px solid ${borderColor}`, boxShadow: isDark ? 'none' : '0 4px 6px -1px rgba(0,0,0,0.03)'"
);

// Fix secondary buttons replacing standard btnStyle
content = content.replace(
  /style=\{\{ \.\.\.btnStyle, backgroundColor: 'transparent', color: textColor \}\}/g,
  "style={secondaryBtnStyle}"
);

// Buttons with "#fecaca" and red text - let's make them look nicer
content = content.replace(
  /backgroundColor: '#fecaca', color: '#ef4444'/g,
  "backgroundColor: isDark ? '#450a0a' : '#fef2f2', color: '#ef4444', border: '1px solid #fecaca'"
);

fs.writeFileSync(file, content, 'utf8');
