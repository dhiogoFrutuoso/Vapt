import fs from 'fs';
import path from 'path';

let edFile = path.join(process.cwd(), 'apps', 'web', 'src', 'pages', 'EditorPage.tsx');
let edContent = fs.readFileSync(edFile, 'utf8');

edContent = edContent.split('\n').filter(line => 
  !line.includes('logoInputRef') && 
  !line.includes('isSavingApp') && 
  !line.includes('handleLogoSelect') && 
  !line.includes('handleSaveApp')
).join('\n');

// Wait, the functions handleLogoSelect and handleSaveApp are multi-line.
// Using string replacement or simply returning the filtered lines for single-line declarations might break if there's a multi-line function.
// Actually, it's safer to just do:

let lines = fs.readFileSync(edFile, 'utf8').split('\n');
let newLines = [];
let skip = false;

for(let i = 0; i < lines.length; i++) {
  let line = lines[i];
  if(line.includes('async function handleLogoSelect') || line.includes('async function handleSaveApp')) {
    skip = true;
  }
  if(!skip && !line.includes('logoInputRef') && !line.includes('isSavingApp')) {
    newLines.push(line);
  }
  if(skip && line.startsWith('  }')) {
    skip = false;
  }
}

fs.writeFileSync(edFile, newLines.join('\n'), 'utf8');
