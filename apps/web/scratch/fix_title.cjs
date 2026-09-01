const fs = require('fs');
let d = fs.readFileSync('src/pages/EditorPage.tsx', 'utf8');

d = d.replace(
  /<h1 style=\{\{\s*margin:\s*0,\s*fontSize:\s*'1\.25rem',\s*fontWeight:\s*800,\s*background:\s*isDark \? 'linear-gradient\(to right, #60a5fa, #a78bfa\)' : 'linear-gradient\(to right, #2563eb, #7c3aed\)',\s*WebkitBackgroundClip:\s*'text',\s*WebkitTextFillColor:\s*'transparent'\s*\}\}>\{app\.name\}<\/h1>/,
  "<h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, backgroundImage: isDark ? 'linear-gradient(to right, #60a5fa, #a78bfa)' : 'linear-gradient(to right, #2563eb, #7c3aed)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}>{app.name}</h1>"
);

fs.writeFileSync('src/pages/EditorPage.tsx', d);
