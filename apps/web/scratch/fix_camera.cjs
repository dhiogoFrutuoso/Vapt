const fs = require('fs');

let d = fs.readFileSync('src/pages/EditorPage.tsx', 'utf8');

// 1. Fix camera container
d = d.replace(/display:\s*'flex',\s*alignItems:\s*'center',\s*justifyContent:\s*'flex-start',\s*flexDirection:\s*'column',\s*overflow:\s*'hidden',\s*cursor:\s*'pointer',\s*backgroundColor:\s*'var\(--ep-panel\)',\s*flexShrink:\s*0,\s*padding:\s*0/, "display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: 'pointer', backgroundColor: 'var(--ep-panel)', flexShrink: 0, padding: 0");

// 2. Fix editor-main
d = d.replace(/display:\s*mobileTab === 'preview' \? 'flex' : 'none',\s*justifyContent:\s*'center'/, "display: mobileTab === 'preview' ? 'flex' : 'none', justifyContent: 'flex-start', flexDirection: 'column'");

fs.writeFileSync('src/pages/EditorPage.tsx', d);
