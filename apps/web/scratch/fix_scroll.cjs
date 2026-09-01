const fs = require('fs');

let d = fs.readFileSync('src/pages/EditorPage.tsx', 'utf8');

// 1. Estruturar o Conteiner Pai
// find height: "100vh" -> change to 100dvh, overflow: "hidden"
d = d.replace(/height:\s*"100vh"/, 'height: "100dvh", overflow: "hidden"');

// 2. Libertar o Conteiner Filho (Scroll interno)
// We need to find the sidebar: aside with editor-sidebar
// It already has overflowY: 'auto' from previous script and WebkitOverflowScrolling: 'touch'.
// We need to ensure it has flex: 1 and minHeight: 0.
// Let's check its style: style={{ width: '420px', backgroundColor: "var(--ep-sidebar)", borderRight: "1px solid var(--ep-border)", overflowY: 'auto', WebkitOverflowScrolling: 'touch', display: mobileTab === 'editor' ? 'flex' : 'none', flexDirection: 'column', flexShrink: 0, zIndex: 5, boxShadow: isDark ? 'none' : '4px 0 12px rgba(0,0,0,0.02)' }}
d = d.replace(/flexDirection:\s*'column',\s*flexShrink:\s*0/, "flexDirection: 'column', flex: 1, minHeight: 0, flexShrink: 0");

fs.writeFileSync('src/pages/EditorPage.tsx', d);
