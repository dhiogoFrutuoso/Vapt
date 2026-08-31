import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'apps', 'web', 'src', 'pages', 'EditorPage.tsx');
let lines = fs.readFileSync(file, 'utf8').split('\\n');

// Find the map start
const startIdx = lines.findIndex(l => l.includes('app.categories?.map(c => {'));
if (startIdx !== -1) {
  lines[startIdx + 3] = `                    <div`;
  lines[startIdx + 5] = `                      style={{ padding: '12px 14px', borderRadius: '12px', backgroundColor: "var(--ep-panel)", border: emEdicao ? "1px solid #f97316" : (isDark ? "1px solid rgba(255,255,255,0.05)" : "1px solid var(--ep-border)"), display: 'flex', alignItems: 'center', gap: '12px', boxShadow: isDark ? 'none' : '0 2px 4px rgba(0,0,0,0.02)' }}`;
  lines[startIdx + 6] = `                    >`;
  lines[startIdx + 9] = `                        : <span style={{ width: "22px", height: "22px", borderRadius: "5px", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--ep-panel)", color: "#94a3b8" }}><Utensils size={14} /></span>}`;
  lines[startIdx + 10] = `                      <span style={{ flex: 1, fontSize: '0.95rem', fontWeight: 500, color: 'var(--ep-text)' }}>{c.name} <span style={{ opacity: 0.55, fontSize: '0.8rem' }}>({itens} itens)</span></span>`;
  lines[startIdx + 13] = `                    </div>`;
}

fs.writeFileSync(file, lines.join('\\n'), 'utf8');
