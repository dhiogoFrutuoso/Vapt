const fs = require('fs');
const lines = fs.readFileSync('apps/web/src/components/EditorPreview.tsx', 'utf8').split('\n');
lines.forEach((l, i) => { 
  if(l.includes('className="phone')) console.log(i, l.trim()); 
});
