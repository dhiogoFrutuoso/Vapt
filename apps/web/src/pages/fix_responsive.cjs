const fs = require('fs');

const file = 'c:/Users/seuma/Desktop/PROJETOS/Vapt/apps/web/src/pages/EditorPage.tsx';
let content = fs.readFileSync(file, 'utf8');

const replaces = [
  // 1. Root container (Remove scroll lock on mobile, keep on desktop)
  [
    `<div style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden", backgroundColor: "var(--ep-bg)", color: "var(--ep-text)", fontFamily: "Inter, system-ui, sans-serif" }}>`,
    `<div className="flex flex-col min-h-screen md:h-screen md:overflow-hidden bg-[var(--ep-bg)] text-[var(--ep-text)] font-sans" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>`
  ],
  // 2. Editor workspace
  [
    `<div style={{ display: 'flex', flex: 1, overflow: 'hidden' }} className="editor-workspace">`,
    `<div className="flex flex-1 flex-col md:flex-row w-full md:overflow-hidden editor-workspace">`
  ],
  // 3. Sidebar
  [
    `<aside style={{ width: \`\${sidebarWidth}px\`, backgroundColor: "var(--ep-sidebar)", borderRight: "1px solid var(--ep-border)", overflowY: 'auto', WebkitOverflowScrolling: 'touch', display: mobileTab === 'editor' ? 'flex' : 'none', flexDirection: 'column', flexShrink: 0, minHeight: 0, zIndex: 5, boxShadow: isDark ? 'none' : '4px 0 12px rgba(0,0,0,0.02)' }} className="editor-sidebar">`,
    `<aside className={\`editor-sidebar \${mobileTab === 'editor' ? 'flex' : 'hidden'} md:flex flex-col shrink-0 z-10 w-full md:w-[var(--md-width)] md:overflow-y-auto\`} style={{ '--md-width': \`\${sidebarWidth}px\`, backgroundColor: "var(--ep-sidebar)", borderRight: "1px solid var(--ep-border)", boxShadow: isDark ? 'none' : '4px 0 12px rgba(0,0,0,0.02)' } as React.CSSProperties}>`
  ],
  // 4. Main Preview container
  [
    `<main style={{ flex: 1, padding: viewMode === 'fullscreen' ? '0' : '32px', overflowY: 'auto', WebkitOverflowScrolling: 'touch', display: mobileTab === 'preview' ? 'flex' : 'none', justifyContent: 'flex-start', flexDirection: 'column', backgroundImage: viewMode === 'fullscreen' ? 'none' : (isDark ? 'radial-gradient(rgba(255,255,255,0.05) 1.5px, transparent 1.5px)' : 'radial-gradient(#cbd5e1 1.5px, transparent 1.5px)'), backgroundSize: '24px 24px', backgroundColor: viewMode === 'fullscreen' ? (isDark ? '#111827' : '#fff') : 'transparent' }} className="editor-main">`,
    `<main className={\`editor-main \${mobileTab === 'preview' ? 'flex' : 'hidden'} md:flex flex-col flex-1 w-full md:overflow-y-auto p-0 md:p-8\`} style={{ padding: viewMode === 'fullscreen' ? '0' : undefined, backgroundImage: viewMode === 'fullscreen' ? 'none' : (isDark ? 'radial-gradient(rgba(255,255,255,0.05) 1.5px, transparent 1.5px)' : 'radial-gradient(#cbd5e1 1.5px, transparent 1.5px)'), backgroundSize: '24px 24px', backgroundColor: viewMode === 'fullscreen' ? (isDark ? '#111827' : '#fff') : 'transparent' }}>`
  ],
  // 5. Adicionar Categoria
  [
    `<form onSubmit={handleSaveCategory} style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'center' }}>`,
    `<form onSubmit={handleSaveCategory} className="flex flex-col md:flex-row gap-3 items-center w-full mb-4">`
  ],
  [
    `<button type="submit" disabled={isAddingCat} className="ep-btn" style={{ marginBottom: 0, height: '42px', width: 'auto', padding: '0 20px' }}>`,
    `<button type="submit" disabled={isAddingCat} className="ep-btn w-full md:w-auto" style={{ marginBottom: 0, height: '42px', padding: '0 20px' }}>`
  ],
  [
    `<button type="button" onClick={cancelCategoryEdit} className="ep-btn ep-btn-secondary" style={{ width: "auto", height: '42px', padding: '0 14px', marginBottom: 0 }}>`,
    `<button type="button" onClick={cancelCategoryEdit} className="ep-btn ep-btn-secondary w-full md:w-auto" style={{ height: '42px', padding: '0 14px', marginBottom: 0 }}>`
  ],
  // 6. Adicionar Produto
  [
    `<div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>`,
    `<div className="flex flex-col md:flex-row gap-3 mb-3 w-full">`
  ],
  [
    `<input type="text" placeholder="Nome do produto" required value={prodName} onChange={e => setProdName(e.target.value)} className="ep-input" />`,
    `<input type="text" placeholder="Nome do produto" required value={prodName} onChange={e => setProdName(e.target.value)} className="ep-input w-full" />`
  ],
  [
    `<div style={{ display: 'flex', gap: '8px' }}>\n                        <span style={{ fontSize: '0.9rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', marginBottom: '16px' }}>R$</span>\n                        <input type="text" inputMode="decimal" placeholder="32,90" required value={prodPrice} onChange={e => setProdPrice(e.target.value)} className="ep-input" />\n                      </div>`,
    `<div className="flex gap-2 w-full items-center">\n                        <span style={{ fontSize: '0.9rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', marginBottom: '16px' }}>R$</span>\n                        <input type="text" inputMode="decimal" placeholder="32,90" required value={prodPrice} onChange={e => setProdPrice(e.target.value)} className="ep-input w-full" />\n                      </div>`
  ],
  [
    `<div style={{ display: 'flex', gap: '8px' }}>\n                    {editingProductId && (\n                      <button type="button" onClick={resetProdForm} className="ep-btn ep-btn-secondary">\n                        Cancelar\n                      </button>\n                    )}\n                    <button type="submit" disabled={isSavingProd} className="ep-btn">\n                      {isSavingProd ? 'Salvando...' : (editingProductId ? 'Salvar Edição' : '+ Adicionar')}\n                    </button>\n                  </div>`,
    `<div className="flex flex-col md:flex-row gap-2 w-full">\n                    {editingProductId && (\n                      <button type="button" onClick={resetProdForm} className="ep-btn ep-btn-secondary w-full md:w-auto">\n                        Cancelar\n                      </button>\n                    )}\n                    <button type="submit" disabled={isSavingProd} className="ep-btn w-full md:w-auto">\n                      {isSavingProd ? 'Salvando...' : (editingProductId ? 'Salvar Edição' : '+ Adicionar')}\n                    </button>\n                  </div>`
  ],
  // 7. Adicionar Mesa
  [
    `<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>`,
    `<div className="flex flex-col md:grid md:grid-cols-2 gap-3 mb-3 w-full">`
  ],
  [
    `<div style={{ display: 'flex', gap: '8px' }}>\n                {editingTableId && (\n                  <button type="button" onClick={resetTableForm} className="ep-btn ep-btn-secondary">\n                    Cancelar\n                  </button>\n                )}\n                <button type="submit" disabled={isSavingTable} className="ep-btn">\n                  {isSavingTable ? 'Salvando...' : (editingTableId ? 'Salvar Edição' : '+ Adicionar')}\n                </button>\n              </div>`,
    `<div className="flex flex-col md:flex-row gap-2 w-full">\n                {editingTableId && (\n                  <button type="button" onClick={resetTableForm} className="ep-btn ep-btn-secondary w-full md:w-auto">\n                    Cancelar\n                  </button>\n                )}\n                <button type="submit" disabled={isSavingTable} className="ep-btn w-full md:w-auto">\n                  {isSavingTable ? 'Salvando...' : (editingTableId ? 'Salvar Edição' : '+ Adicionar')}\n                </button>\n              </div>`
  ]
];

let failed = false;
for (const [search, replace] of replaces) {
  if (content.includes(search)) {
    content = content.split(search).join(replace);
  } else {
    console.error('Failed to find chunk:', search.substring(0, 50));
    failed = true;
  }
}

if (!failed) {
  fs.writeFileSync(file, content);
  console.log('Fixed EditorPage.tsx successfully');
}
