import sys

filepath = 'apps/web/src/pages/EditorPage.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update imports
old_import = "import { ArrowLeft, Sun, Moon, Trash2, Pencil, Star, Camera, Utensils, Lightbulb, Eye, EyeOff } from 'lucide-react';"
new_import = "import { ArrowLeft, Sun, Moon, Trash2, Pencil, Star, Camera, Utensils, Lightbulb, Eye, EyeOff, Smartphone, Monitor, Maximize } from 'lucide-react';"
if old_import in content:
    content = content.replace(old_import, new_import, 1)

# 2. Add state
state_marker = "const [mobileTab, setMobileTab] = useState<'editor' | 'preview'>('editor');"
state_new = "const [mobileTab, setMobileTab] = useState<'editor' | 'preview'>('editor');\n  const [viewMode, setViewMode] = useState<'mobile' | 'default' | 'fullscreen'>('default');"
if state_marker in content:
    content = content.replace(state_marker, state_new, 1)

# 3. Update preview container
old_preview_container = """        {/* PREVIEW CONTAINER */}
        <main style={{ flex: 1, padding: '32px', overflowY: 'auto', display: mobileTab === 'preview' ? 'flex' : 'none', justifyContent: 'center', backgroundImage: isDark ? 'radial-gradient(rgba(255,255,255,0.05) 1.5px, transparent 1.5px)' : 'radial-gradient(#cbd5e1 1.5px, transparent 1.5px)', backgroundSize: '24px 24px' }} className="editor-main">
          
          <div style={{ width: '100%', maxWidth: '1200px', display: 'flex', flexDirection: 'column' }}>
            <p style={{ textAlign: 'center', fontSize: '0.9rem', color: 'var(--ep-label)', marginBottom: '16px', fontWeight: 600 }}>
              <Lightbulb size={18} style={{ display: "inline-block", verticalAlign: "middle", marginRight: "6px", color: "#f59e0b" }} />Interaja com o aplicativo abaixo para testar o cardápio, lançar itens nas mesas e ver a fila de entrega.
            </p>
            
            <div style={{ flex: 1, minHeight: '600px', display: 'flex', border: isDark ? "1px solid rgba(255,255,255,0.05)" : "1px solid var(--ep-border)", borderRadius: '16px', overflow: 'hidden', boxShadow: isDark ? '0 10px 40px rgba(0,0,0,0.5)' : '0 10px 40px rgba(0,0,0,0.05)' }}>"""

new_preview_container = """        {/* PREVIEW CONTAINER */}
        <main style={{ flex: 1, padding: viewMode === 'fullscreen' ? '0' : '32px', overflowY: 'auto', display: mobileTab === 'preview' ? 'flex' : 'none', justifyContent: 'center', backgroundImage: viewMode === 'fullscreen' ? 'none' : (isDark ? 'radial-gradient(rgba(255,255,255,0.05) 1.5px, transparent 1.5px)' : 'radial-gradient(#cbd5e1 1.5px, transparent 1.5px)'), backgroundSize: '24px 24px', backgroundColor: viewMode === 'fullscreen' ? (isDark ? '#111827' : '#fff') : 'transparent' }} className="editor-main">
          
          <div style={{ width: '100%', maxWidth: viewMode === 'fullscreen' ? '100%' : '1200px', display: 'flex', flexDirection: 'column' }}>
            
            {viewMode !== 'fullscreen' && (
              <p style={{ textAlign: 'center', fontSize: '0.9rem', color: 'var(--ep-label)', marginBottom: '16px', fontWeight: 600 }}>
                <Lightbulb size={18} style={{ display: "inline-block", verticalAlign: "middle", marginRight: "6px", color: "#f59e0b" }} />Interaja com o aplicativo abaixo para testar o cardápio, lançar itens nas mesas e ver a fila de entrega.
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginBottom: viewMode === 'fullscreen' ? '0' : '12px', padding: viewMode === 'fullscreen' ? '12px 16px' : '0' }}>
              <button onClick={() => setViewMode('mobile')} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '6px', border: viewMode === 'mobile' ? '1px solid var(--brand)' : '1px solid var(--ep-border)', background: viewMode === 'mobile' ? 'rgba(255,107,44,0.1)' : 'transparent', color: viewMode === 'mobile' ? 'var(--brand)' : 'var(--ep-label)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                <Smartphone size={16} /> Celular
              </button>
              <button onClick={() => setViewMode('default')} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '6px', border: viewMode === 'default' ? '1px solid var(--brand)' : '1px solid var(--ep-border)', background: viewMode === 'default' ? 'rgba(255,107,44,0.1)' : 'transparent', color: viewMode === 'default' ? 'var(--brand)' : 'var(--ep-label)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                <Monitor size={16} /> Padrão
              </button>
              <button onClick={() => setViewMode('fullscreen')} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '6px', border: viewMode === 'fullscreen' ? '1px solid var(--brand)' : '1px solid var(--ep-border)', background: viewMode === 'fullscreen' ? 'rgba(255,107,44,0.1)' : 'transparent', color: viewMode === 'fullscreen' ? 'var(--brand)' : 'var(--ep-label)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                <Maximize size={16} /> Tela Cheia
              </button>
            </div>
            
            <div style={{ 
              flex: 1, 
              minHeight: viewMode === 'fullscreen' ? 'calc(100vh - 45px)' : '600px', 
              display: 'flex', 
              border: viewMode === 'fullscreen' ? 'none' : (isDark ? "1px solid rgba(255,255,255,0.05)" : "1px solid var(--ep-border)"), 
              borderRadius: viewMode === 'fullscreen' ? '0' : '16px', 
              overflow: 'hidden', 
              boxShadow: viewMode === 'fullscreen' ? 'none' : (isDark ? '0 10px 40px rgba(0,0,0,0.5)' : '0 10px 40px rgba(0,0,0,0.05)'),
              width: viewMode === 'mobile' ? '414px' : '100%',
              margin: viewMode === 'mobile' ? '0 auto' : '0'
            }}>"""

if old_preview_container in content:
    content = content.replace(old_preview_container, new_preview_container, 1)
else:
    print("Could not find preview container")
    sys.exit(1)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Done")
