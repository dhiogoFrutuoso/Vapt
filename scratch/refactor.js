import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'apps', 'web', 'src', 'pages', 'EditorPage.tsx');
let content = fs.readFileSync(file, 'utf8');

// Inject Lucide imports
if (!content.includes('lucide-react')) {
  const importsEndIndex = content.lastIndexOf('import ');
  const endOfImportsLine = content.indexOf('\n', importsEndIndex);
  
  const lucideImport = "\nimport { ArrowLeft, Sun, Moon, Image as ImageIcon, Plus, Trash2, Pencil, Star, Upload, Trash, X, Save, Eye, Settings, Palette, Map, Users, MenuSquare } from 'lucide-react';\n";
  content = content.slice(0, endOfImportsLine) + lucideImport + content.slice(endOfImportsLine);
}

// Emoticons to replace:
// ✏️ -> <Pencil size={16} />
// 🗑️ -> <Trash2 size={16} />
// 🖼️ -> <ImageIcon size={24} />
// 🌟 -> <Star size={18} fill="currentColor" />
// ❌ -> <X size={14} />
// 🎨 -> <Palette size={20} />
// 📦 -> <MenuSquare size={20} />
// 🪑 -> <Users size={20} />
// 🍔 -> <ImageIcon size={24} /> (For products without image)
// 🛒 -> <Store size={20} />
// ☀️ -> <Sun size={18} />
// 🌙 -> <Moon size={18} />

const replacements = [
  // Header
  { from: /'☀️ Claro'/g, to: '(<><Sun size={18} style={{ marginRight: 6 }}/> Claro</>)' },
  { from: /'🌙 Escuro'/g, to: '(<><Moon size={18} style={{ marginRight: 6 }}/> Escuro</>)' },
  { from: /Contratar Plano →/g, to: 'Contratar Plano' }, // Maybe just remove the arrow and let it be
  
  // Back button
  { from: /<Link to="\/painel".*?>←<\/Link>/g, to: '<Link to="/painel" style={{ color: textColor, textDecoration: \'none\', fontWeight: \'bold\', display: \'flex\', alignItems: \'center\', gap: \'4px\' }}><ArrowLeft size={20} /> Voltar</Link>' },
  
  // Category Form
  { from: /<span style={{ fontSize: '1\.2rem' }}>🖼️<\/span>/g, to: '<ImageIcon size={24} color="#94a3b8" />' },
  { from: /<span style={{ width: '22px', height: '22px', borderRadius: '5px', display: 'grid', placeItems: 'center', backgroundColor: panelBg }}>📦<\/span>/g, to: '<span style={{ width: "22px", height: "22px", borderRadius: "5px", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: panelBg, color: "#94a3b8" }}><ImageIcon size={14} /></span>' },
  
  // Editing category buttons
  { from: /title="Editar categoria".*?>✏️<\/button>/g, to: 'title="Editar categoria" onClick={() => startCategoryEdit(c)} style={{ background: \'none\', border: \'none\', cursor: \'pointer\', color: \'inherit\', opacity: 0.75, padding: 0, display: \'flex\' }}><Pencil size={14} /></button>' },
  { from: /title="Remover categoria".*?>❌<\/button>/g, to: 'title="Remover categoria" onClick={() => void handleRemoveCategory(c._id, c.name)} style={{ background: \'none\', border: \'none\', cursor: \'pointer\', color: \'#ef4444\', padding: 0, display: \'flex\' }}><Trash2 size={14} /></button>' },
  
  // Product Form
  { from: /<span style={{ fontSize: '2rem' }}>🍔<\/span>/g, to: '<ImageIcon size={32} color="#94a3b8" />' },
  { from: /🌟 Destacar no topo/g, to: 'Destacar no topo' },
  
  // Product List Buttons
  { from: /<button onClick=\{\(\) => editProduct\(p\)\}.*?>✏️<\/button>/g, to: '<button onClick={() => editProduct(p)} style={{ background: \'none\', border: \'none\', cursor: \'pointer\', color: \'inherit\', display: \'flex\' }}><Pencil size={18} /></button>' },
  { from: /<button onClick=\{\(\) => void handleDeleteProduct\(p._id\)\}.*?>🗑️<\/button>/g, to: '<button onClick={() => void handleDeleteProduct(p._id)} style={{ background: \'none\', border: \'none\', cursor: \'pointer\', color: \'#ef4444\', display: \'flex\' }}><Trash2 size={18} /></button>' },
  
  // Table Form
  { from: /<button onClick=\{\(\) => editTable\(t\)\}.*?>✏️<\/button>/g, to: '<button onClick={() => editTable(t)} style={{ background: \'none\', border: \'none\', cursor: \'pointer\', color: \'inherit\', display: \'flex\' }}><Pencil size={18} /></button>' },
  { from: /<button onClick=\{\(\) => void handleDeleteTable\(t.id\)\}.*?>🗑️<\/button>/g, to: '<button onClick={() => void handleDeleteTable(t.id)} style={{ background: \'none\', border: \'none\', cursor: \'pointer\', color: \'#ef4444\', display: \'flex\' }}><Trash2 size={18} /></button>' },
  
  // Featured Star in Product Item
  { from: /\{p.isFeatured \? '🌟 ' : ''\}/g, to: '{p.isFeatured && <Star size={14} fill="#f59e0b" color="#f59e0b" style={{ marginRight: "4px" }} /> }' }
];

replacements.forEach(r => {
  content = content.replace(r.from, r.to );
});

// Replace inputStyle border radius
content = content.replace(/borderRadius: '8px'/g, "borderRadius: '10px'");
content = content.replace(/border: `2px solid \$\{borderColor\}`/g, "border: `1px solid ${borderColor}`");

fs.writeFileSync(file, content, 'utf8');
console.log('Done refactoring EditorPage.tsx emojis');
