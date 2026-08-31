import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'apps', 'web', 'src', 'pages', 'DashboardPage.tsx');
let content = fs.readFileSync(file, 'utf8');

// I will just replace the whole file since it's going to change significantly
const newDashboardPage = `
import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { auth, site } from '../data/content';
import { useAuth } from '../context/AuthContext';
import { api, type AppSummary, type AppProjectFull, type Role, type Employee } from '../lib/api';
import { Plus, Trash2, LogOut, Store, Search, LayoutDashboard, Settings, Edit3, Image as ImageIcon, Users, Shield, Copy, KeySquare, Phone } from 'lucide-react';
import { fileToResizedDataUrl } from '../lib/image';

export function DashboardPage() {
  const copy = auth.dashboard;
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [apps, setApps] = useState<AppSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Modal State
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);
  const [newAppName, setNewAppName] = useState('');

  // Settings Modal State
  const [settingsAppId, setSettingsAppId] = useState<string | null>(null);
  const [fullApp, setFullApp] = useState<AppProjectFull | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'geral' | 'equipe'>('geral');
  const [savingSettings, setSavingSettings] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Form State for "Geral"
  const [formName, setFormName] = useState('');
  const [formTagline, setFormTagline] = useState('');
  const [formPrimaryColor, setFormPrimaryColor] = useState('#FF6B2C');
  const [formLogoUrl, setFormLogoUrl] = useState<string | null>(null);
  const [formLogoBase64, setFormLogoBase64] = useState<string | null>(null);
  const [formWhatsapp, setFormWhatsapp] = useState('');

  // Form State for "Equipe" (Roles)
  const [newRoleName, setNewRoleName] = useState('');
  const [isAddingRole, setIsAddingRole] = useState(false);

  // Form State for "Equipe" (Employees)
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpRoleId, setNewEmpRoleId] = useState('');
  const [isAddingEmp, setIsAddingEmp] = useState(false);

  const plan = searchParams.get('plano');

  useEffect(() => {
    async function loadApps() {
      try {
        const data = await api.getApps();
        setApps(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    void loadApps();
  }, []);

  async function handleLogout() {
    await logout();
    navigate('/', { replace: true });
  }

  async function handleCreateApp() {
    if (!newAppName.trim()) return;
    setCreating(true);
    try {
      const newApp = await api.createApp({
        name: newAppName.trim(),
        businessType: 'restaurante',
      });
      navigate(\`/painel/app/\${newApp.id}\`);
    } catch (err) {
      console.error(err);
      alert('Erro ao criar aplicativo.');
      setCreating(false);
    }
  }

  async function handleDeleteApp(id: string, name: string) {
    if (!window.confirm(\`Tem certeza que deseja excluir o aplicativo "\${name}" permanentemente?\`)) return;
    
    setDeletingId(id);
    try {
      await api.deleteApp(id);
      setApps(current => current.filter(app => app.id !== id));
    } catch (err) {
      console.error(err);
      alert('Erro ao excluir aplicativo.');
    } finally {
      setDeletingId(null);
    }
  }

  async function openSettings(appId: string) {
    setSettingsAppId(appId);
    setLoadingSettings(true);
    setSettingsTab('geral');
    try {
      const data = await api.getApp(appId);
      setFullApp(data);
      setFormName(data.name);
      setFormTagline(data.brand?.tagline || '');
      setFormPrimaryColor(data.brand?.primaryColor || '#FF6B2C');
      setFormLogoUrl(data.brand?.logo ? \`/api/images/\${data.brand.logo}\` : null);
      setFormLogoBase64(null);
      setFormWhatsapp(data.delivery?.whatsapp || '');
      if (data.roles?.length > 0) {
        setNewEmpRoleId(data.roles[0]._id);
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao carregar configurações do aplicativo.');
      setSettingsAppId(null);
    } finally {
      setLoadingSettings(false);
    }
  }

  async function handleSaveGeneral(e: React.FormEvent) {
    e.preventDefault();
    if (!fullApp) return;
    setSavingSettings(true);
    try {
      const updates: Partial<AppProjectFull> = {
        name: formName,
        brand: {
          ...fullApp.brand,
          tagline: formTagline,
          primaryColor: formPrimaryColor,
        },
        delivery: {
          ...fullApp.delivery,
          whatsapp: formWhatsapp
        }
      };
      if (formLogoBase64) {
        updates.brand!.logoBase64 = formLogoBase64;
      }

      await api.updateApp(fullApp._id, updates);
      
      // Update app summary in list
      setApps(current => current.map(a => a.id === fullApp._id ? {
        ...a, 
        name: formName, 
        primaryColor: formPrimaryColor,
        logoUrl: formLogoBase64 || a.logoUrl // Approximation since base64 will become objectId later on reload
      } : a));
      
      alert('Configurações salvas!');
    } catch(err) {
      console.error(err);
      alert('Erro ao salvar');
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleLogoSelect(file?: File) {
    if (!file) return;
    try {
      const dataUrl = await fileToResizedDataUrl(file, 400);
      setFormLogoBase64(dataUrl);
      setFormLogoUrl(dataUrl); // preview
    } catch (err) {
      alert('Erro ao processar imagem.');
    }
  }

  async function handleAddRole(e: React.FormEvent) {
    e.preventDefault();
    if (!fullApp || !newRoleName.trim()) return;
    setIsAddingRole(true);
    try {
      const role = await api.addRole(fullApp._id, { name: newRoleName, permissions: ['pedidos', 'entregas'] });
      setFullApp({ ...fullApp, roles: [...(fullApp.roles || []), role] });
      setNewRoleName('');
      if (!newEmpRoleId) setNewEmpRoleId(role._id);
    } catch(err) {
      alert('Erro ao criar função');
    } finally {
      setIsAddingRole(false);
    }
  }

  async function handleRemoveRole(roleId: string) {
    if (!fullApp) return;
    if (!window.confirm('Tem certeza? Funcionários com esta função podem perder acesso.')) return;
    try {
      await api.removeRole(fullApp._id, roleId);
      setFullApp({ ...fullApp, roles: fullApp.roles.filter(r => r._id !== roleId) });
    } catch(err) {
      alert('Erro ao remover função');
    }
  }

  async function handleAddEmployee(e: React.FormEvent) {
    e.preventDefault();
    if (!fullApp || !newEmpName.trim() || !newEmpRoleId) return;
    setIsAddingEmp(true);
    try {
      const emp = await api.addEmployee(fullApp._id, { name: newEmpName, roleId: newEmpRoleId });
      setFullApp({ ...fullApp, employees: [...(fullApp.employees || []), emp] });
      setNewEmpName('');
    } catch(err) {
      alert('Erro ao adicionar funcionário');
    } finally {
      setIsAddingEmp(false);
    }
  }

  async function handleRemoveEmployee(empId: string) {
    if (!fullApp) return;
    if (!window.confirm('Remover o acesso deste funcionário permanentemente?')) return;
    try {
      await api.removeEmployee(fullApp._id, empId);
      setFullApp({ ...fullApp, employees: fullApp.employees.filter(e => e._id !== empId) });
    } catch(err) {
      alert('Erro ao remover funcionário');
    }
  }

  if (!user) return null;

  const inputClass = "w-full p-3 rounded-xl border border-slate-300 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none transition-all";
  const labelClass = "block mb-2 font-semibold text-slate-700 text-sm";

  return (
    <div className="dash" style={{ backgroundColor: 'var(--color-bg, #f8fafc)', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <header className="dash__top" style={{ backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0.75rem 0' }}>
        <div className="container dash__top-inner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link className="nav__logo" to="/" style={{ textDecoration: 'none' }}>
            <span className="nav__logo-mark">F</span>
            <span className="nav__logo-text">
              {site.name}
              <small style={{ color: '#64748b' }}>painel</small>
            </span>
          </Link>

          <div className="dash__user" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div className="dash__avatar" style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {user.photoUrl ? (
                <img src={user.photoUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontWeight: 'bold', color: '#64748b' }}>{(user.displayName || user.username || '?').charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="dash__user-text" style={{ display: 'flex', flexDirection: 'column' }}>
              <strong style={{ fontSize: '0.9rem' }}>{user.displayName || user.username || 'Usuário'}</strong>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>@{user.username || user.email.split('@')[0]}</span>
            </div>
            <button 
              type="button" 
              onClick={() => void handleLogout()}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '8px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', fontWeight: '500' }}
            >
              <LogOut size={18} /> Sair
            </button>
          </div>
        </div>
      </header>

      <main className="container dash__main" style={{ paddingTop: '3rem', paddingBottom: '3rem' }}>
        <div className="dash__greeting" style={{ marginBottom: '3rem' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: 'bold', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <LayoutDashboard size={32} color="#FF6B2C" />
            {copy.greeting(user.displayName || user.username || 'Usuário')}
          </h1>
          <p style={{ color: '#64748b', fontSize: '1.1rem' }}>{copy.subtitle}</p>
        </div>

        {plan && (
          <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', padding: '1rem', borderRadius: '12px', marginBottom: '2rem' }}>
            Plano escolhido: <strong>{plan}</strong>. Monte o seu aplicativo e finalize a contratação pelo WhatsApp.
          </div>
        )}

        <section className="dash__section">
          <header className="dash__section-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Meus Aplicativos</h2>
            <button 
              type="button" 
              onClick={() => setCreateModalOpen(true)} 
              disabled={creating}
              style={{ backgroundColor: '#FF6B2C', color: '#fff', border: 'none', padding: '0.5rem 1.25rem', borderRadius: '8px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', boxShadow: '0 2px 4px rgba(255, 107, 44, 0.2)' }}
            >
              <Plus size={18} /> {copy.createLabel}
            </button>
          </header>

          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
              <Search size={48} style={{ opacity: 0.2, margin: '0 auto 1rem auto' }} />
              <p>Buscando seus aplicativos...</p>
            </div>
          ) : apps.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
              {apps.map(app => (
                <div key={app.id} style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', transition: 'transform 0.2s, box-shadow 0.2s', position: 'relative', opacity: deletingId === app.id ? 0.5 : 1 }}>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ width: '56px', height: '56px', borderRadius: '12px', backgroundColor: app.primaryColor || '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', flexShrink: 0, overflow: 'hidden' }}>
                      {app.logoUrl ? <img src={app.logoUrl} alt={app.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Store size={28} color="#fff" />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '700', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{app.name}</h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: app.status === 'ativo' ? '#10b981' : '#f59e0b' }}></span>
                        <span style={{ fontSize: '0.85rem', color: '#64748b', textTransform: 'capitalize' }}>{app.status}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto', flexWrap: 'wrap' }}>
                    <button 
                      onClick={() => openSettings(app.id)}
                      style={{ flex: 1, backgroundColor: '#f8fafc', color: '#334155', border: '1px solid #e2e8f0', padding: '0.6rem', borderRadius: '8px', fontWeight: '600', fontSize: '0.85rem', transition: 'background 0.2s', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    >
                      <Settings size={16} /> Configurações
                    </button>
                    <Link 
                      to={\`/painel/app/\${app.id}\`} 
                      style={{ flex: 1, backgroundColor: '#FF6B2C', color: '#fff', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '0.6rem', borderRadius: '8px', fontWeight: '600', fontSize: '0.85rem', transition: 'background 0.2s' }}
                    >
                      <Store size={16} /> PDV / Cardápio
                    </Link>
                    <button 
                      onClick={() => void handleDeleteApp(app.id, app.name)}
                      disabled={deletingId === app.id}
                      style={{ backgroundColor: '#fef2f2', color: '#ef4444', border: 'none', width: '38px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}
                      title="Excluir aplicativo"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ backgroundColor: '#fff', border: '1px dashed #cbd5e1', borderRadius: '16px', padding: '4rem 2rem', textAlign: 'center' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem auto' }}>
                <Store size={32} color="#94a3b8" />
              </div>
              <strong style={{ display: 'block', fontSize: '1.25rem', marginBottom: '0.5rem', color: '#0f172a' }}>{copy.emptyTitle}</strong>
              <p style={{ color: '#64748b', marginBottom: '2rem', maxWidth: '400px', margin: '0 auto 2rem auto' }}>{copy.emptyText}</p>
              <button
                type="button"
                onClick={() => setCreateModalOpen(true)}
                disabled={creating}
                style={{ backgroundColor: '#FF6B2C', color: '#fff', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '8px', fontWeight: '600', fontSize: '1rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              >
                <Plus size={20} /> {copy.createLabel}
              </button>
            </div>
          )}
        </section>
      </main>

      {/* Modal de Criação de App */}
      {isCreateModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '2rem', width: '100%', maxWidth: '420px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h2 style={{ margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '1.5rem', color: '#0f172a' }}>
              <div style={{ backgroundColor: '#fff8f6', padding: '8px', borderRadius: '10px' }}>
                <Store color="#FF6B2C" size={24} />
              </div>
              Novo Aplicativo
            </h2>
            
            <div style={{ marginBottom: '2rem' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#334155', fontSize: '0.95rem' }}>
                Nome do seu negócio
              </label>
              <input 
                type="text" 
                value={newAppName}
                onChange={e => setNewAppName(e.target.value)}
                placeholder="Ex: Pizzaria do Mario"
                style={{ width: '100%', padding: '14px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '1rem', outline: 'none' }}
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter') void handleCreateApp();
                }}
              />
            </div>
            
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button 
                onClick={() => {
                  setCreateModalOpen(false);
                  setNewAppName('');
                }}
                style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#fff', color: '#475569', cursor: 'pointer', fontWeight: '600' }}
              >
                Cancelar
              </button>
              <button 
                onClick={() => void handleCreateApp()}
                disabled={!newAppName.trim() || creating}
                style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: '#FF6B2C', color: '#fff', cursor: 'pointer', fontWeight: '600', opacity: (!newAppName.trim() || creating) ? 0.7 : 1 }}
              >
                {creating ? 'Criando...' : 'Criar App'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Configurações do App */}
      {settingsAppId && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '20px', width: '100%', maxWidth: '700px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
            
            {/* Modal Header */}
            <header style={{ padding: '1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '12px', fontSize: '1.25rem', color: '#0f172a', fontWeight: '700' }}>
                <Settings color="#64748b" size={24} />
                Configurações do Aplicativo
              </h2>
              <button onClick={() => setSettingsAppId(null)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px' }}>
                <Plus size={24} style={{ transform: 'rotate(45deg)' }} />
              </button>
            </header>

            {loadingSettings || !fullApp ? (
              <div style={{ padding: '4rem', textAlign: 'center', color: '#64748b' }}>
                <Settings size={48} className="animate-spin" style={{ opacity: 0.2, margin: '0 auto 1rem auto' }} />
                <p>Carregando configurações...</p>
              </div>
            ) : (
              <>
                {/* Tabs */}
                <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', padding: '0 1.5rem', backgroundColor: '#f8fafc' }}>
                  <button 
                    onClick={() => setSettingsTab('geral')}
                    style={{ padding: '1rem 0', marginRight: '2rem', background: 'none', border: 'none', borderBottom: settingsTab === 'geral' ? '3px solid #FF6B2C' : '3px solid transparent', color: settingsTab === 'geral' ? '#FF6B2C' : '#64748b', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                    <Edit3 size={18} /> Aparência e Contato
                  </button>
                  <button 
                    onClick={() => setSettingsTab('equipe')}
                    style={{ padding: '1rem 0', background: 'none', border: 'none', borderBottom: settingsTab === 'equipe' ? '3px solid #FF6B2C' : '3px solid transparent', color: settingsTab === 'equipe' ? '#FF6B2C' : '#64748b', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                    <Users size={18} /> Equipe e Acessos
                  </button>
                </div>

                {/* Tab Content */}
                <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
                  
                  {settingsTab === 'geral' && (
                    <form onSubmit={handleSaveGeneral}>
                      <div style={{ display: 'flex', gap: '2rem', marginBottom: '1.5rem' }}>
                        <div style={{ flexShrink: 0 }}>
                          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#334155', fontSize: '0.9rem' }}>Logotipo</label>
                          <div 
                            onClick={() => logoInputRef.current?.click()}
                            style={{ width: '96px', height: '96px', borderRadius: '16px', border: '2px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: 'pointer', backgroundColor: '#f8fafc' }}
                          >
                            {formLogoUrl ? <img src={formLogoUrl} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <ImageIcon color="#94a3b8" size={32} />}
                          </div>
                          <input type="file" accept="image/*" hidden ref={logoInputRef} onChange={e => void handleLogoSelect(e.target.files?.[0])} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#334155', fontSize: '0.9rem' }}>Nome da loja</label>
                          <input type="text" value={formName} onChange={e => setFormName(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.95rem', marginBottom: '1rem' }} required />
                          
                          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#334155', fontSize: '0.9rem' }}>Frase (Tagline)</label>
                          <input type="text" placeholder="Ex: A melhor pizza da cidade" value={formTagline} onChange={e => setFormTagline(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.95rem' }} />
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#334155', fontSize: '0.9rem' }}>WhatsApp Business</label>
                          <div style={{ position: 'relative' }}>
                            <Phone size={18} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '14px' }} />
                            <input type="text" placeholder="5511999999999" value={formWhatsapp} onChange={e => setFormWhatsapp(e.target.value.replace(/\\D/g, ''))} style={{ width: '100%', padding: '12px 12px 12px 40px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.95rem', boxSizing: 'border-box' }} />
                          </div>
                          <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>Apenas números com DDD. Ex: 5511999999999</p>
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#334155', fontSize: '0.9rem' }}>Cor Primária</label>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <input type="color" value={formPrimaryColor} onChange={e => setFormPrimaryColor(e.target.value)} style={{ width: '46px', height: '46px', padding: '0', borderRadius: '8px', border: '1px solid #cbd5e1', cursor: 'pointer' }} />
                            <input type="text" value={formPrimaryColor} onChange={e => setFormPrimaryColor(e.target.value.toUpperCase())} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.95rem', textTransform: 'uppercase' }} />
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #e2e8f0', paddingTop: '1.5rem' }}>
                        <button type="submit" disabled={savingSettings} style={{ padding: '12px 24px', borderRadius: '8px', border: 'none', background: '#FF6B2C', color: '#fff', cursor: 'pointer', fontWeight: '600', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Save size={18} /> {savingSettings ? 'Salvando...' : 'Salvar Alterações'}
                        </button>
                      </div>
                    </form>
                  )}

                  {settingsTab === 'equipe' && (
                    <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
                      {/* Funções (Roles) */}
                      <div style={{ flex: 1, backgroundColor: '#f8fafc', padding: '1.25rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '1rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}><Shield size={18} color="#64748b" /> Funções</h3>
                        
                        <form onSubmit={handleAddRole} style={{ display: 'flex', gap: '8px', marginBottom: '1rem' }}>
                          <input type="text" placeholder="Ex: Cozinheiro" value={newRoleName} onChange={e => setNewRoleName(e.target.value)} required style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }} />
                          <button type="submit" disabled={isAddingRole} style={{ padding: '10px', background: '#334155', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' }}>+</button>
                        </form>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {fullApp.roles?.length > 0 ? fullApp.roles.map(r => (
                            <div key={r._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                              <span style={{ fontSize: '0.9rem', fontWeight: '600', color: '#334155' }}>{r.name}</span>
                              <button onClick={() => handleRemoveRole(r._id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}><Trash2 size={16} /></button>
                            </div>
                          )) : <p style={{ fontSize: '0.85rem', color: '#64748b', fontStyle: 'italic' }}>Nenhuma função criada.</p>}
                        </div>
                      </div>

                      {/* Funcionários (Employees) */}
                      <div style={{ flex: 1, backgroundColor: '#f8fafc', padding: '1.25rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '1rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}><Users size={18} color="#64748b" /> Funcionários</h3>
                        
                        <form onSubmit={handleAddEmployee} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '1rem' }}>
                          <input type="text" placeholder="Nome do funcionário" value={newEmpName} onChange={e => setNewEmpName(e.target.value)} required style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <select value={newEmpRoleId} onChange={e => setNewEmpRoleId(e.target.value)} required style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}>
                              <option value="" disabled>Selecione a função</option>
                              {fullApp.roles?.map(r => <option key={r._id} value={r._id}>{r.name}</option>)}
                            </select>
                            <button type="submit" disabled={isAddingEmp || !newEmpRoleId} style={{ padding: '10px 14px', background: '#FF6B2C', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer', opacity: (!newEmpRoleId) ? 0.5 : 1 }}>Adicionar</button>
                          </div>
                        </form>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {fullApp.employees?.length > 0 ? fullApp.employees.map(emp => {
                            const role = fullApp.roles?.find(r => r._id === emp.roleId);
                            return (
                              <div key={emp._id} style={{ padding: '12px', backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                  <div>
                                    <strong style={{ display: 'block', fontSize: '0.95rem', color: '#0f172a' }}>{emp.name}</strong>
                                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{role ? role.name : 'Sem função'}</span>
                                  </div>
                                  <button onClick={() => handleRemoveEmployee(emp._id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}><Trash2 size={16} /></button>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#f1f5f9', padding: '8px', borderRadius: '6px' }}>
                                  <KeySquare size={16} color="#64748b" />
                                  <span style={{ fontFamily: 'monospace', fontWeight: 'bold', fontSize: '1rem', letterSpacing: '2px', color: '#334155' }}>{emp.accessCode}</span>
                                </div>
                              </div>
                            );
                          }) : <p style={{ fontSize: '0.85rem', color: '#64748b', fontStyle: 'italic' }}>Nenhum funcionário adicionado.</p>}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
`;

fs.writeFileSync(file, newDashboardPage, 'utf8');
