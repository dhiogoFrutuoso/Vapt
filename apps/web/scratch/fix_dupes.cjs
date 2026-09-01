const fs = require('fs');
let ed = fs.readFileSync('src/pages/EditorPage.tsx', 'utf8');

// The error mentions:
// src/pages/EditorPage.tsx(35,10): error TS2451: Cannot redeclare block-scoped variable 'prodPricingType'.
// src/pages/EditorPage.tsx(36,10): error TS2451: Cannot redeclare block-scoped variable 'prodPricingType'.
// Let's just remove the exact lines if duplicated.
const lines = ed.split('\n');
const newLines = [];
let foundVar = false;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('const [prodPricingType, setProdPricingType]')) {
    if (foundVar) continue;
    foundVar = true;
  }
  
  if (lines[i].includes('pricingType: prodPricingType,') && lines[i+1] && lines[i+1].includes('pricingType: prodPricingType,')) {
    continue; // skip duplicate
  }
  
  newLines.push(lines[i]);
}

fs.writeFileSync('src/pages/EditorPage.tsx', newLines.join('\n'));
