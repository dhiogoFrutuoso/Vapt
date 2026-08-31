import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'apps', 'web', 'src', 'pages', 'EditorPage.tsx');
let content = fs.readFileSync(file, 'utf8');

// Replace table delete button emoji
content = content.replace(/<button onClick=\{\(\) => void handleDeleteTable\(t\._id\)\}.*?>(?:Y-.*?)<\/button>/g, '<button onClick={() => void handleDeleteTable(t._id)} style={{ background: \'none\', border: \'none\', cursor: \'pointer\', color: \'#ef4444\', display: \'flex\' }}><Trash2 size={18} /></button>');

// Replace other emojis
content = content.replace(/👇/g, '');
content = content.replace(/✨/g, '');
content = content.replace(/👉/g, '');

content = content.replace(/'☀️ Claro'/g, '(<><Sun size={18} style={{ marginRight: 6 }}/> Claro</>)');
content = content.replace(/'🌙 Escuro'/g, '(<><Moon size={18} style={{ marginRight: 6 }}/> Escuro</>)');
content = content.replace(/Contratar Plano →/g, 'Contratar Plano');

// There's a malformed emoji character due to powershell rendering
content = content.replace(/<button onClick=\{\(\) => void handleDeleteTable\(t\._id\)\}.*?>.*?<\/button>/g, '<button onClick={() => void handleDeleteTable(t._id)} style={{ background: \'none\', border: \'none\', cursor: \'pointer\', color: \'#ef4444\', display: \'flex\' }}><Trash2 size={18} /></button>');

fs.writeFileSync(file, content, 'utf8');
console.log('Fixed remaining emojis');
