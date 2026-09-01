const fs = require('fs');
let d = fs.readFileSync('src/pages/EditorPage.tsx', 'utf8');

// 1. Harmonize Navbar
// The right div
d = d.replace(/<div style=\{\{\s*display:\s*'flex',\s*gap:\s*'12px'\s*\}\}>/, "<div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>");

// The header itself
d = d.replace(/<header className="editor-topbar" style=\{\{(.*?)\}\}>/, (match, p1) => {
  let newStyles = p1;
  if (!newStyles.includes('flexWrap')) {
    newStyles += ", flexWrap: 'wrap', gap: '16px'";
  }
  return `<header className="editor-topbar" style={{${newStyles}}}>`;
});

// The left div in header
d = d.replace(/<div style=\{\{\s*display:\s*'flex',\s*alignItems:\s*'center',\s*gap:\s*'16px'\s*\}\}>/, "<div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>");


// 2. Center Camera Icon
// The div
d = d.replace(/style=\{\{\s*width:\s*'42px',\s*height:\s*'42px',\s*borderRadius:\s*'8px',\s*border:\s*isDark \? '1px dashed rgba\(255,255,255,0\.2\)' : '1px dashed var\(--ep-border\)',\s*display:\s*'flex',\s*alignItems:\s*'center',\s*justifyContent:\s*'center',\s*overflow:\s*'hidden',\s*cursor:\s*'pointer',\s*backgroundColor:\s*"var\(--ep-panel\)",\s*flexShrink:\s*0\s*\}\}/, 
"style={{ width: '42px', height: '42px', borderRadius: '8px', border: isDark ? '1px dashed rgba(255,255,255,0.2)' : '1px dashed var(--ep-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: 'pointer', backgroundColor: 'var(--ep-panel)', flexShrink: 0, padding: 0 }}");

// The Camera component
d = d.replace(/<Camera size=\{20\} color="#94a3b8" \/>/, '<Camera size={20} color="#94a3b8" style={{ margin: 0, padding: 0, display: "block" }} />');

fs.writeFileSync('src/pages/EditorPage.tsx', d);
