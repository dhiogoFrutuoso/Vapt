import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'apps', 'web', 'src', 'pages', 'EditorPage.tsx');
let c = fs.readFileSync(file, 'utf8');

// 1. Refine Colors (Zinc Palette for Premium Dark Mode)
c = c.replace(/--ep-bg: \$\{isDark \? '#0b1120' : '#f8fafc'\};/g, "--ep-bg: ${isDark ? '#09090b' : '#f8fafc'};");
c = c.replace(/--ep-sidebar: \$\{isDark \? '#111827' : '#ffffff'\};/g, "--ep-sidebar: ${isDark ? '#18181b' : '#ffffff'};");
c = c.replace(/--ep-panel: \$\{isDark \? '#1f2937' : '#f1f5f9'\};/g, "--ep-panel: ${isDark ? '#27272a' : '#f1f5f9'};");
c = c.replace(/--ep-text: \$\{isDark \? '#f3f4f6' : '#1e293b'\};/g, "--ep-text: ${isDark ? '#f4f4f5' : '#18181b'};");
c = c.replace(/--ep-label: \$\{isDark \? '#9ca3af' : '#64748b'\};/g, "--ep-label: ${isDark ? '#a1a1aa' : '#64748b'};");
c = c.replace(/--ep-border: \$\{isDark \? '#374151' : '#e2e8f0'\};/g, "--ep-border: ${isDark ? '#3f3f46' : '#e2e8f0'};");
// Add an ultra-subtle border for dark mode cards
c = c.replace(/border: 1px solid var\(--ep-border\)/g, "border: ${isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid var(--ep-border)'}");
c = c.replace(/border: "1px solid var\(--ep-border\)"/g, 'border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid var(--ep-border)"');

// 2. Fix the Categories Form Alignment
const oldCatForm = `<form onSubmit={handleSaveCategory} style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'flex-start' }}>`;
const newCatForm = `<form onSubmit={handleSaveCategory} style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'center' }}>`;
c = c.replace(oldCatForm, newCatForm);

// Add style={{ marginBottom: 0 }} to input inside forms to prevent misalignment
c = c.replace(/<input type="text" placeholder="Nome \(Ex: Lanches\)" required value=\{newCat\} onChange=\{e => setNewCat\(e.target.value\)\} className="ep-input" \/>/, 
  `<input type="text" placeholder="Nome (Ex: Lanches)" required value={newCat} onChange={e => setNewCat(e.target.value)} className="ep-input" style={{ marginBottom: 0, height: '42px' }} />`);

c = c.replace(/<button type="submit" disabled=\{isAddingCat\} className="ep-btn">/, 
  `<button type="submit" disabled={isAddingCat} className="ep-btn" style={{ marginBottom: 0, height: '42px', width: 'auto', padding: '0 20px' }}>`);

// Camera button should also be 42px (it is 42px already, let's make it match perfectly)
c = c.replace(/style=\{\{ width: '42px', height: '42px', borderRadius: '10px', border: \`1px dashed var\(--ep-border\)\`/g,
  `style={{ width: '42px', height: '42px', borderRadius: '8px', border: isDark ? '1px dashed rgba(255,255,255,0.2)' : '1px dashed var(--ep-border)'`);

// 3. Fix the Categories List Alignment
const oldCatListContainer = `<div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>`;
const newCatListContainer = `<div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>`;
c = c.replace(oldCatListContainer, newCatListContainer);

// Update category item structure from span to div, and make it flex-row centered
const oldCatItemRegex = /<span\s*key=\{c\._id\}\s*style=\{\{ padding: '6px 8px', borderRadius: '10px', backgroundColor: "var\(--ep-sidebar\)", border: emEdicao \? "1px solid #f97316" : "1px solid var\(--ep-border\)", fontSize: '0\.8rem', display: 'flex', alignItems: 'center', gap: '8px' \}\}\s*>([\s\S]*?)<\/span>/g;

c = c.replace(oldCatItemRegex, (match, inner) => {
  let newInner = inner.replace(/<span>\{c\.name\} <span style=\{\{ opacity: 0\.55 \}\}>\(\{itens\}\)<\/span><\/span>/, 
    `<span style={{ flex: 1, fontSize: '0.95rem', fontWeight: 500, color: 'var(--ep-text)' }}>{c.name} <span style={{ opacity: 0.55, fontSize: '0.8rem' }}>({itens} itens)</span></span>`);
  
  return `<div
                      key={c._id}
                      style={{ padding: '12px 14px', borderRadius: '12px', backgroundColor: "var(--ep-panel)", border: emEdicao ? "1px solid #f97316" : (isDark ? "1px solid rgba(255,255,255,0.05)" : "1px solid var(--ep-border)"), display: 'flex', alignItems: 'center', gap: '12px', boxShadow: isDark ? 'none' : '0 2px 4px rgba(0,0,0,0.02)' }}
                    >${newInner}</div>`;
});

// Also fix Tables inputs alignment
c = c.replace(/<div style=\{\{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' \}\}>/g,
  `<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>`);

c = c.replace(/<input type="text" placeholder="Rótulo \(Ex: 01\)" required value=\{tableLabel\} onChange=\{e => setTableLabel\(e.target.value\)\} className="ep-input" \/>/g,
  `<input type="text" placeholder="Rótulo (Ex: 01)" required value={tableLabel} onChange={e => setTableLabel(e.target.value)} className="ep-input" style={{ marginBottom: 0 }} />`);

c = c.replace(/<input type="number" placeholder="Lugares \(Ex: 4\)" min="1" required value=\{tableSeats\} onChange=\{e => setTableSeats\(e.target.value\)\} className="ep-input" \/>/g,
  `<input type="number" placeholder="Lugares (Ex: 4)" min="1" required value={tableSeats} onChange={e => setTableSeats(e.target.value)} className="ep-input" style={{ marginBottom: 0 }} />`);


// Tweak CSS class for inputs
c = c.replace(/margin-bottom: 16px;/g, 'margin-bottom: 16px;'); 
// It's fine to keep global margin if we override it inline for rows.

// Fix category placeholder text
c = c.replace(/<span style=\{\{ fontSize: '0\.8rem', opacity: 0\.6 \}\}>Nenhuma categoria criada\.<\/span>/g,
  `<div style={{ padding: '16px', textAlign: 'center', backgroundColor: 'var(--ep-panel)', borderRadius: '12px', fontSize: '0.85rem', color: 'var(--ep-label)', border: isDark ? '1px dashed rgba(255,255,255,0.1)' : '1px dashed var(--ep-border)' }}>Nenhuma categoria criada.</div>`);

fs.writeFileSync(file, c, 'utf8');
