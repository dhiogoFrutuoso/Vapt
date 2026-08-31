import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'apps', 'web', 'src', 'pages', 'EditorPage.tsx');
let content = fs.readFileSync(file, 'utf8');

// The new CSS block to replace the existing one at the end of the file
const newStyles = `<style>{\`
        :root {
          --ep-bg: \${isDark ? '#0b1120' : '#f8fafc'};
          --ep-sidebar: \${isDark ? '#111827' : '#ffffff'};
          --ep-panel: \${isDark ? '#1f2937' : '#f1f5f9'};
          --ep-text: \${isDark ? '#f3f4f6' : '#1e293b'};
          --ep-label: \${isDark ? '#9ca3af' : '#64748b'};
          --ep-border: \${isDark ? '#374151' : '#e2e8f0'};
          --ep-accent: \${isDark ? '#3b82f6' : '#2563eb'};
          --ep-accent-hover: \${isDark ? '#60a5fa' : '#1d4ed8'};
          --ep-ring: \${isDark ? 'rgba(59, 130, 246, 0.5)' : 'rgba(37, 99, 235, 0.4)'};
        }

        /* Scrollbar customizada e minimalista */
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: \${isDark ? '#374151' : '#cbd5e1'}; border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: \${isDark ? '#4b5563' : '#94a3b8'}; }

        /* Background com Dot Pattern */
        .editor-main {
          background-color: var(--ep-bg);
          background-image: \${isDark 
            ? 'radial-gradient(#374151 1px, transparent 1px)' 
            : 'radial-gradient(#cbd5e1 1px, transparent 1px)'};
          background-size: 24px 24px;
        }

        .ep-input {
          width: 100%;
          padding: 12px 16px;
          border-radius: 8px;
          border: 1px solid var(--ep-border);
          font-size: 0.95rem;
          margin-bottom: 16px;
          background-color: var(--ep-panel);
          color: var(--ep-text);
          transition: all 0.2s ease;
          outline: none;
        }
        .ep-input:focus {
          border-color: var(--ep-accent);
          box-shadow: 0 0 0 3px var(--ep-ring);
        }

        .ep-btn {
          width: 100%;
          padding: 12px 16px;
          border-radius: 8px;
          border: none;
          background-color: var(--ep-accent);
          color: #ffffff;
          font-weight: 600;
          cursor: pointer;
          font-size: 0.95rem;
          transition: all 0.2s ease;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .ep-btn:hover {
          background-color: var(--ep-accent-hover);
          transform: translateY(-1px);
        }
        .ep-btn:active {
          transform: translateY(0);
        }

        .ep-btn-secondary {
          background-color: transparent;
          color: var(--ep-text);
          border: 1px solid var(--ep-border);
          box-shadow: none;
        }
        .ep-btn-secondary:hover {
          background-color: var(--ep-panel);
          color: var(--ep-text);
        }

        .ep-btn-danger {
          background-color: \${isDark ? '#450a0a' : '#fef2f2'};
          color: #ef4444;
          border: 1px solid \${isDark ? '#7f1d1d' : '#fecaca'};
        }
        .ep-btn-danger:hover {
          background-color: \${isDark ? '#7f1d1d' : '#fca5a5'};
          color: #ffffff;
        }

        .ep-card {
          padding: 24px;
          background-color: var(--ep-sidebar);
          border-radius: 12px;
          border: 1px solid var(--ep-border);
          box-shadow: \${isDark ? 'none' : '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)'};
          margin-bottom: 20px;
        }

        .ep-label {
          display: block;
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--ep-label);
          margin-bottom: 6px;
        }

        /* Outros estilos pre-existentes do editor */
        @media (max-width: 900px) {
          .editor-workspace { flex-direction: column !important; }
          .mobile-tabs { display: flex !important; }
          .editor-sidebar { width: 100% !important; border-right: none !important; }
          .editor-main { padding: 12px !important; display: \${mobileTab === 'preview' ? 'flex' : 'none'} !important; }
          .editor-sidebar { display: \${mobileTab === 'editor' ? 'flex' : 'none'} !important; }
        }
        @media (min-width: 901px) {
          .editor-sidebar { display: flex !important; }
          .editor-main { display: flex !important; }
        }
        .editor-main .phone__tabs { padding: 12px; gap: 12px; border-radius: 16px; }
        .editor-main .phone__tabs button { font-size: 1rem; padding: 12px 16px; font-weight: 800; }
      \`}</style>`;

// Replace <style> block
content = content.replace(/<style>\{`[\s\S]*?`\}<\/style>/, newStyles);

// Remove old variables completely (from isDark up to btnStyle)
content = content.replace(/const isDark = editorTheme === 'escuro';[\s\S]*?const btnStyle = \{[^}]*\};/, "const isDark = editorTheme === 'escuro';");

// Now we need to replace all instances of style={{...inputStyle}} with className="ep-input"
content = content.replace(/style=\{\{\s*\.\.\.inputStyle[^}]*\}\}/g, 'className="ep-input"');
content = content.replace(/style=\{inputStyle\}/g, 'className="ep-input"');

// Replace standard buttons
content = content.replace(/style=\{\{\s*\.\.\.btnStyle,\s*backgroundColor:\s*'transparent'[^}]*\}\}/g, 'className="ep-btn ep-btn-secondary"');
content = content.replace(/style=\{\{\s*\.\.\.btnStyle,\s*flex:\s*\d+\s*\}\}/g, 'className="ep-btn"');
content = content.replace(/style=\{\{\s*\.\.\.btnStyle[^}]*\}\}/g, 'className="ep-btn"');
content = content.replace(/style=\{btnStyle\}/g, 'className="ep-btn"');

// Replace Danger buttons
content = content.replace(/style=\{\{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444'[^}]*\}\}/g, 'className="ep-btn ep-btn-danger" style={{ display: "flex", padding: "8px", borderRadius: "8px" }}');

// Replace Edit buttons
content = content.replace(/style=\{\{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit'[^}]*\}\}/g, 'className="ep-btn ep-btn-secondary" style={{ display: "flex", padding: "8px", borderRadius: "8px" }}');


// Clean up layout container colors
content = content.replace(
  /<div style=\{\{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: panelBg, color: textColor, fontFamily: 'system-ui, sans-serif' \}\}>/g,
  '<div style={{ display: "flex", flexDirection: "column", height: "100vh", backgroundColor: "var(--ep-bg)", color: "var(--ep-text)", fontFamily: "Inter, system-ui, sans-serif" }}>'
);

content = content.replace(
  /<header style=\{\{ padding: '16px 32px', backgroundColor: sidebarBg, borderBottom: `1px solid \$\{borderColor\}`[^}]*\}\}>/g,
  '<header style={{ padding: "16px 32px", backgroundColor: "var(--ep-sidebar)", borderBottom: "1px solid var(--ep-border)", boxShadow: isDark ? "0 4px 12px rgba(0,0,0,0.3)" : "0 4px 12px rgba(0,0,0,0.03)", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10 }}>'
);

content = content.replace(/color: textColor/g, 'color: "var(--ep-text)"');

// Remove border from the main layout
content = content.replace(/borderRight: `1px solid \$\{borderColor\}`/g, 'borderRight: "1px solid var(--ep-border)"');
content = content.replace(/borderRight: `2px solid \$\{borderColor\}`/g, 'borderRight: "1px solid var(--ep-border)"');

// Replace card classes
content = content.replace(/padding: '24px', borderBottom: `2px solid \$\{borderColor\}`/g, 'padding: "32px 24px", borderBottom: "1px solid var(--ep-border)"');
content = content.replace(/padding: '24px'/g, 'padding: "32px 24px"');

content = content.replace(/<div style=\{\{ padding: '20px', backgroundColor: panelBg, borderRadius: '16px', border: `1px solid \$\{borderColor\}`[^}]*\}\}>/g, '<div className="ep-card">');
content = content.replace(/<form onSubmit=\{handleSaveTable\} style=\{\{ padding: '20px', backgroundColor: panelBg, borderRadius: '16px', border: `1px solid \$\{borderColor\}`[^}]*\}\}>/g, '<form onSubmit={handleSaveTable} className="ep-card">');

// The items inside list
content = content.replace(/padding: '12px', backgroundColor: isDark \? '#0f172a' : '#fff', borderRadius: '10px', border: `1px solid \$\{borderColor\}`/g, 'padding: "16px", backgroundColor: "var(--ep-panel)", borderRadius: "12px", border: "1px solid var(--ep-border)"');
content = content.replace(/border: `1px solid \$\{borderColor\}`/g, 'border: "1px solid var(--ep-border)"');

// Update labels
content = content.replace(/<h3 style=\{\{ fontSize: '1rem', fontWeight: 700, marginBottom: '4px' \}\}>/g, '<h3 style={{ fontSize: "1.05rem", fontWeight: 700, marginBottom: "8px", color: "var(--ep-text)" }}>');
content = content.replace(/<strong style=\{\{ display: 'block', fontSize: '0.9rem' \}\}>/g, '<strong style={{ display: "block", fontSize: "0.95rem", color: "var(--ep-text)" }}>');
content = content.replace(/<span style=\{\{ fontSize: '0.8rem', opacity: 0.8 \}\}>/g, '<span style={{ fontSize: "0.85rem", color: "var(--ep-label)" }}>');

// Clean up backgroundColor: sidebarBg / panelBg
content = content.replace(/backgroundColor: sidebarBg/g, 'backgroundColor: "var(--ep-sidebar)"');
content = content.replace(/backgroundColor: panelBg/g, 'backgroundColor: "var(--ep-panel)"');

fs.writeFileSync(file, content, 'utf8');
