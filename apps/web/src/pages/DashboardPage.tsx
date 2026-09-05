import toast from 'react-hot-toast';
import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { auth, site } from '../data/content';
import { useAuth } from '../context/AuthContext';
import { api, getImageUrl, type AppSummary, type AppProjectFull } from '../lib/api';
import { useConfirm } from '../components/ConfirmModal';
import { ChefHat, ChevronDown, Download, Edit3, Image as ImageIcon, KeySquare, LayoutDashboard, Lock, LogOut, Phone, Plus, Rocket, Save, Search, Settings, Shield, Store, TestTube, Trash2, Users } from 'lucide-react';
import { fileToResizedDataUrl } from '../lib/image';

export function DashboardPage() {
  const copy = auth.dashboard;
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { confirm, ConfirmElement } = useConfirm();
  const [searchParams] = useSearchParams();
  const [apps, setApps] = useState<AppSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const editUserId = searchParams.get('editUserId');
  const targetPlan = searchParams.get('plan');
  
  // Se for admin em modo edição, o plano efetivo é o plano passado na URL
  const effectivePlan = (user?.isAdmin && editUserId && targetPlan !== null) ? targetPlan : (user?.plan || '');

  // Modal State
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);
  const [liveUserPlan, setLiveUserPlan] = useState<string | null>(null);

  useEffect(() => {
    if (isCreateModalOpen) {
      async function fetchUserPlan() {
        try {
          if (user?.isAdmin && editUserId) {
            const res = await api.getAdminUsers(1, 1, editUserId, '', '');
            const targetUser = res.users.find(u => u.id === editUserId);
            if (targetUser) {
              setLiveUserPlan(targetUser.plan || '');
            }
          } else {
            const res = await api.me();
            setLiveUserPlan(res.user.plan || '');
          }
        } catch (err) {
          console.error('Erro ao buscar plano atualizado', err);
        }
      }
      void fetchUserPlan();
    } else {
      setLiveUserPlan(null);
    }
  }, [isCreateModalOpen, user?.isAdmin, editUserId]);

  const planToEvaluate = liveUserPlan !== null ? liveUserPlan : effectivePlan;
  const userPlan = planToEvaluate.toLowerCase().trim();
  const hasCompleto = userPlan.includes('completo') || userPlan.includes('master');
  const hasDelivery = hasCompleto || userPlan.includes('delivery');
  const hasSalao = hasCompleto || userPlan.includes('salão') || userPlan.includes('salao') || userPlan.includes('sal\u00e3o');
  const canCreateOfficial = hasCompleto || hasDelivery || hasSalao;

  const [createStep, setCreateStep] = useState<1 | 2>(1); // 1: Choose Type, 2: Setup Name & Submit
  const [selectedAppType, setSelectedAppType] = useState<'TESTE' | 'OFICIAL' | null>(null);
  const [selectedSubPlan, setSelectedSubPlan] = useState<'DELIVERY' | 'SALAO' | 'COMPLETO'>('COMPLETO');
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
  const [newRolePermissions, setNewRolePermissions] = useState<string[]>([]);
  /** Espelha 1:1 as abas do aplicativo — o que o funcionario ve, ele acessa. */
  const PERMISSIONS = [
    { id: 'cliente', label: 'Cliente' },
    { id: 'recepcao', label: 'Recepção' },
    { id: 'salao', label: 'Salão' },
    { id: 'caixa', label: 'Caixa' },
    { id: 'entregador', label: 'Entregador' },
    { id: 'cozinha', label: 'Cozinha' },
  ];
  const [isAddingRole, setIsAddingRole] = useState(false);

  // Form State for "Equipe" (Saguoes / pracas de preparo)
  const [newStationName, setNewStationName] = useState('');
  const [isAddingStation, setIsAddingStation] = useState(false);

  // Form State for "Equipe" (Employees)
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpRoleId, setNewEmpRoleId] = useState('');
  const [isAddingEmp, setIsAddingEmp] = useState(false);

  const plan = searchParams.get('plano');

  useEffect(() => {
    async function loadApps() {
      try {
        const target = (user?.isAdmin && editUserId) ? editUserId : undefined;
        const data = await api.getApps(target);
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

  function resetCreateModal() {
    setCreateModalOpen(false);
    setCreateStep(1);
    setSelectedAppType(null);
    setSelectedSubPlan('COMPLETO');
    setNewAppName('');
  }

  async function handleCreateApp() {
    if (!newAppName.trim() || !selectedAppType) return;
    setCreating(true);
    
    // Resolve AppPlanType
    let finalAppPlanType = '';
    if (selectedAppType === 'TESTE') {
      finalAppPlanType = `TESTE_${selectedSubPlan}`;
    } else {
      if (!canCreateOfficial) {
        toast.error('Você precisa assinar um plano para criar um Aplicativo Oficial.');
        setCreating(false);
        return;
      }
      finalAppPlanType = `OFICIAL_${selectedSubPlan}`;
    }

    try {
      const newApp = await api.createApp({
        name: newAppName.trim(),
        businessType: 'restaurante',
        appPlanType: finalAppPlanType,
        targetUserId: (user?.isAdmin && editUserId) ? editUserId : undefined
      });
      resetCreateModal();
      navigate(`/painel/app/${newApp.id}`);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao criar aplicativo.');
      setCreating(false);
    }
  }

  async function handleDeleteApp(id: string, name: string) {
    confirm({
      title: 'Excluir Aplicativo',
      message: `Tem certeza que deseja excluir o aplicativo "${name}" permanentemente?`,
      confirmText: 'Excluir',
      isDestructive: true,
      onConfirm: async () => {
        setDeletingId(id);
        try {
          await api.deleteApp(id);
          setApps(current => current.filter(app => app.id !== id));
        } catch (err) {
          console.error(err);
          toast.error('Erro ao excluir aplicativo.');
        } finally {
          setDeletingId(null);
        }
      }
    });
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
      setFormLogoUrl(getImageUrl(data.brand?.logo));
      setFormLogoBase64(null);
      setFormWhatsapp(data.delivery?.whatsapp || '');
      if (data.roles?.length > 0) {
        setNewEmpRoleId(data.roles[0]._id);
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar configurações do aplicativo.');
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
      
      setApps(current => current.map(a => a.id === fullApp._id ? {
        ...a, 
        name: formName, 
        primaryColor: formPrimaryColor,
        logoUrl: formLogoBase64 || a.logoUrl 
      } : a));
      
      toast.success('Configurações salvas!');
    } catch(err) {
      console.error(err);
      toast.error('Erro ao salvar');
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleLogoSelect(file?: File) {
    if (!file) return;
    try {
      const dataUrl = await fileToResizedDataUrl(file, 400);
      setFormLogoBase64(dataUrl);
      setFormLogoUrl(dataUrl); 
    } catch (err) {
      toast.error('Erro ao processar imagem.');
    }
  }

  async function handleAddRole(e: React.FormEvent) {
    e.preventDefault();
    if (!fullApp || !newRoleName.trim()) return;
    setIsAddingRole(true);
    try {
      const role = await api.addRole(fullApp._id, { name: newRoleName, permissions: newRolePermissions });
      setFullApp({ ...fullApp, roles: [...(fullApp.roles || []), role] });
      setNewRoleName('');
      setNewRolePermissions([]);
      if (!newEmpRoleId) setNewEmpRoleId(role._id);
    } catch(err) {
      toast.error('Erro ao criar função');
    } finally {
      setIsAddingRole(false);
    }
  }

  async function handleAddStation(e: React.FormEvent) {
    e.preventDefault();
    if (!fullApp || !newStationName.trim()) return;
    setIsAddingStation(true);
    try {
      const station = await api.addStation(fullApp._id, { name: newStationName.trim() });
      setFullApp({ ...fullApp, stations: [...(fullApp.stations || []), station] });
      setNewStationName('');
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao criar saguão');
    } finally {
      setIsAddingStation(false);
    }
  }

  async function handleRemoveStation(stationId: string, stationName: string) {
    if (!fullApp) return;
    confirm({
      title: 'Excluir Saguão',
      message: `Os produtos vinculados a "${stationName}" ficarão sem saguão. Continuar?`,
      confirmText: 'Excluir',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await api.removeStation(fullApp._id, stationId);
          setFullApp({
            ...fullApp,
            stations: (fullApp.stations || []).filter((s: any) => s._id !== stationId),
          });
        } catch (err) {
          toast.error('Erro ao excluir saguão');
        }
      },
    });
  }

  async function handleRemoveRole(roleId: string) {
    if (!fullApp) return;
    confirm({
      title: 'Excluir Função',
      message: 'Tem certeza? Funcionários com esta função podem perder acesso.',
      confirmText: 'Excluir',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await api.removeRole(fullApp._id, roleId);
          setFullApp({ ...fullApp, roles: fullApp.roles.filter((r: any) => r._id !== roleId) });
        } catch(err) {
          toast.error('Erro ao remover função');
        }
      }
    });
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
      toast.error('Erro ao adicionar funcionário');
    } finally {
      setIsAddingEmp(false);
    }
  }

  async function handleRemoveEmployee(empId: string) {
    if (!fullApp) return;
    confirm({
      title: 'Remover Funcionário',
      message: 'Remover o acesso deste funcionário permanentemente?',
      confirmText: 'Remover',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await api.removeEmployee(fullApp._id, empId);
          setFullApp({ ...fullApp, employees: fullApp.employees.filter((e: any) => e._id !== empId) });
        } catch(err) {
          toast.error('Erro ao remover funcionário');
        }
      }
    });
  }

  if (!user) return null;

  return (
    <div className="dash" style={{ backgroundColor: '#FDFDFD', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <header className="dash__top" style={{ backgroundColor: '#fff', borderBottom: '1px solid rgba(0,0,0,0.05)', padding: '0.75rem 0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
        <div className="container dash__top-inner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link className="nav__logo" to="/" style={{ textDecoration: 'none' }}>
            <img src="/vapt-logo.png" alt="VaptApp" style={{ height: "38px", width: "auto", objectFit: "contain" }} />
            <span className="nav__logo-text">
              {site.name}
              <small style={{ color: '#64748b' }}>painel</small>
            </span>
          </Link>

          <div className="dash__user" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Link
              to="/painel/conta"
              title="Minha Conta"
              style={{ display: 'flex', alignItems: 'center', gap: '1rem', textDecoration: 'none', color: 'inherit' }}
            >
              <div className="dash__avatar" style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {user.photoUrl || user.avatarUrl ? (
                  <img src={user.photoUrl || user.avatarUrl || ''} alt="Avatar" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontWeight: 'bold', color: '#64748b' }}>{(user.displayName || user.username || '?').charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div className="dash__user-text" style={{ display: 'flex', flexDirection: 'column' }}>
                <strong style={{ fontSize: '0.9rem', color: '#111' }}>{user.displayName || user.username || 'Usuário'}</strong>
                <span style={{ fontSize: '0.75rem', color: '#666' }}>@{user.username || user.email.split('@')[0]}</span>
              </div>
            </Link>
            {user?.isAdmin && (
              <Link to="/admin" style={{ padding: '6px 12px', backgroundColor: '#f1f5f9', color: '#0f172a', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Shield size={14} /> Admin
              </Link>
            )}
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
        {user?.isAdmin && editUserId && (
          <div style={{ backgroundColor: '#FFF0EC', color: '#F95D2A', padding: '12px 20px', borderRadius: '12px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px', fontWeight: '600', border: '1px solid rgba(249, 93, 42, 0.2)' }}>
            <Shield size={20} />
            <span>Modo Edição: Gerenciando aplicativos do cliente (ID: {editUserId.slice(-6)})</span>
            <Link to="/admin" style={{ marginLeft: 'auto', color: '#F95D2A', textDecoration: 'underline', fontSize: '0.9rem' }}>Voltar ao Admin</Link>
          </div>
        )}
        <div className="dash__greeting" style={{ marginBottom: '3rem' }}>
          <h1 style={{ fontSize: '2.2rem', fontWeight: '800', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '12px', color: '#111' }}>
            <LayoutDashboard size={32} color="#F95D2A" />
            {copy.greeting(user.displayName || user.username || 'Usuário')}
          </h1>
          <p style={{ color: '#666', fontSize: '1.1rem' }}>{copy.subtitle}</p>
        </div>

        {plan && (
          <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', color: '#111e40af', padding: '1rem', borderRadius: '12px', marginBottom: '2rem' }}>
            Plano escolhido: <strong>{plan}</strong>. Monte o seu aplicativo e finalize a contratação pelo WhatsApp.
          </div>
        )}

        <section className="dash__section">
          <header className="dash__section-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', margin: 0, fontWeight: '700', color: '#111' }}>Meus Aplicativos</h2>
            <button 
              type="button" 
              onClick={() => setCreateModalOpen(true)} 
              disabled={creating}
              style={{ backgroundColor: '#F95D2A', color: '#fff', border: 'none', padding: '0.6rem 1.25rem', borderRadius: '99px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', boxShadow: '0 4px 14px rgba(249, 93, 42, 0.3)', transition: 'transform 0.2s, box-shadow 0.2s' }}
              onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(249, 93, 42, 0.4)'; }}
              onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(249, 93, 42, 0.3)'; }}
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
                <div key={app.id} style={{ backgroundColor: '#fff', border: '1px solid rgba(0,0,0,0.05)', borderRadius: '24px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', boxShadow: '0 4px 14px rgba(0,0,0,0.02)', transition: 'transform 0.2s, box-shadow 0.2s', position: 'relative', opacity: deletingId === app.id ? 0.5 : 1 }}>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ width: '64px', height: '64px', borderRadius: '16px', backgroundColor: app.primaryColor || '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', flexShrink: 0, overflow: 'hidden' }}>
                      {app.logoUrl ? <img src={app.logoUrl} alt={app.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Store size={28} color="#fff" />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700', color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{app.name}</h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: app.status === 'ativo' ? '#10b981' : '#f59e0b' }}></span>
                        <span style={{ fontSize: '0.85rem', color: '#666', textTransform: 'capitalize', fontWeight: '500' }}>
                          {app.appPlanType ? app.appPlanType.replace('_', ' ') : app.status}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto', flexWrap: 'wrap' }}>
                    <button 
                      onClick={() => openSettings(app.id)}
                      style={{ flex: 1, backgroundColor: '#FAFAFA', color: '#333', border: '1px solid rgba(0,0,0,0.05)', padding: '0.75rem', borderRadius: '12px', fontWeight: '600', fontSize: '0.85rem', transition: 'background 0.2s', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    >
                      <Settings size={16} /> Configs
                    </button>
                    <Link 
                      to={`/painel/app/${app.id}`} 
                      style={{ flex: 1, backgroundColor: '#111', color: '#fff', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '0.75rem', borderRadius: '12px', fontWeight: '600', fontSize: '0.85rem', transition: 'background 0.2s', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}
                    >
                      <Store size={16} /> Abrir App
                    </Link>
                    <button 
                      onClick={() => void handleDeleteApp(app.id, app.name)}
                      disabled={deletingId === app.id}
                      style={{ backgroundColor: '#fff', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', width: '42px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}
                      title="Excluir aplicativo"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {/* Baixar App: so faz sentido em plano OFICIAL. No TESTE fica
                      visivel e desabilitado, para o dono entender que existe e
                      o que destrava — esconder viraria "sumiu uma funcao". */}
                  {(() => {
                    const isOficial = (app.appPlanType ?? '').startsWith('OFICIAL');
                    const base = {
                      width: '100%',
                      marginTop: '0.5rem',
                      padding: '0.75rem',
                      borderRadius: '12px',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      textDecoration: 'none',
                      border: '1px solid transparent',
                    } as const;

                    if (!isOficial) {
                      return (
                        <button
                          type="button"
                          disabled
                          title="Disponível nos planos oficiais"
                          style={{ ...base, backgroundColor: '#F1F5F9', color: '#94A3B8', cursor: 'not-allowed', opacity: 0.75 }}
                        >
                          <Download size={16} /> Baixar App
                        </button>
                      );
                    }

                    return (
                      <Link
                        to={`/download?app=${app.id}`}
                        style={{ ...base, backgroundColor: '#F95D2A', color: '#fff', boxShadow: '0 6px 16px -6px rgba(249,93,42,0.55)' }}
                      >
                        <Download size={16} /> Baixar App
                      </Link>
                    );
                  })()}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ backgroundColor: '#fff', border: '1px dashed #cbd5e1', borderRadius: '24px', padding: '4rem 2rem', textAlign: 'center', boxShadow: '0 4px 14px rgba(0,0,0,0.02)' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem auto' }}>
                <Store size={32} color="#94a3b8" />
              </div>
              <strong style={{ display: 'block', fontSize: '1.25rem', marginBottom: '0.5rem', color: '#111' }}>{copy.emptyTitle}</strong>
              <p style={{ color: '#666', marginBottom: '2rem', maxWidth: '400px', margin: '0 auto 2rem auto' }}>{copy.emptyText}</p>
              <button
                type="button"
                onClick={() => setCreateModalOpen(true)}
                disabled={creating}
                style={{ backgroundColor: '#F95D2A', color: '#fff', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '99px', fontWeight: '600', fontSize: '1rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 14px rgba(249, 93, 42, 0.3)' }}
              >
                <Plus size={20} /> {copy.createLabel}
              </button>
            </div>
          )}
        </section>
      </main>

      {/* Modal de Criação de App */}
      {isCreateModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(17, 17, 17, 0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem', transition: 'opacity 0.3s ease' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '24px', padding: '2rem', width: '100%', maxWidth: '600px', boxShadow: '0 24px 48px -12px rgba(0,0,0,0.18)', transition: 'transform 0.3s ease', transform: 'scale(1)' }}>
            
            {createStep === 1 && (
              <>
                <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.5rem', color: '#111', fontWeight: '800', textAlign: 'center' }}>
                  Escolha o tipo de aplicativo
                </h2>
                <p style={{ margin: '0 0 2rem 0', color: '#666', textAlign: 'center', fontSize: '0.95rem' }}>
                  Selecione o modelo que melhor se adapta à sua necessidade.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div 
                    onClick={() => setSelectedAppType('TESTE')}
                    style={{ border: selectedAppType === 'TESTE' ? '2px solid #F95D2A' : '1px solid rgba(0,0,0,0.1)', borderRadius: '16px', padding: '1.5rem', cursor: 'pointer', transition: 'all 0.2s', backgroundColor: selectedAppType === 'TESTE' ? '#fff8f6' : '#fff', position: 'relative' }}
                  >
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                      <div style={{ backgroundColor: selectedAppType === 'TESTE' ? '#F95D2A' : '#f1f5f9', color: selectedAppType === 'TESTE' ? '#fff' : '#64748b', padding: '12px', borderRadius: '12px', transition: 'all 0.2s' }}>
                        <TestTube size={24} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <h3 style={{ margin: '0 0 4px 0', fontSize: '1.1rem', color: '#111', fontWeight: '700' }}>Aplicativo de Teste</h3>
                        <p style={{ margin: 0, color: '#666', fontSize: '0.85rem' }}>Ideal para explorar o painel e simular o funcionamento das ferramentas livremente.</p>
                      </div>
                    </div>

                    {selectedAppType === 'TESTE' && (
                      <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(249, 93, 42, 0.2)' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#111', marginBottom: '8px' }}>Selecione o ambiente que deseja testar:</label>
                        <div style={{ position: 'relative' }}>
                          <select 
                            value={selectedSubPlan}
                            onChange={(e) => setSelectedSubPlan(e.target.value as any)}
                            style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.1)', appearance: 'none', fontSize: '0.95rem', backgroundColor: '#fff', cursor: 'pointer' }}
                          >
                            <option value="DELIVERY">Delivery (Apenas Entrega/Retirada)</option>
                            <option value="SALAO">Salão-Caixa (Apenas Mesas/Local)</option>
                            <option value="COMPLETO">Completo (Todos os Recursos)</option>
                          </select>
                          <ChevronDown size={16} color="#666" style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                        </div>
                      </div>
                    )}
                  </div>

                  <div 
                    onClick={() => {
                      if (canCreateOfficial) {
                        setSelectedAppType('OFICIAL');
                        if (!hasDelivery && hasSalao) setSelectedSubPlan('SALAO');
                        else if (!hasDelivery && !hasSalao && hasCompleto) setSelectedSubPlan('COMPLETO');
                      }
                    }}
                    style={{ border: selectedAppType === 'OFICIAL' ? '2px solid #F95D2A' : '1px solid rgba(0,0,0,0.1)', borderRadius: '16px', padding: '1.5rem', cursor: !canCreateOfficial ? 'not-allowed' : 'pointer', transition: 'all 0.2s', backgroundColor: selectedAppType === 'OFICIAL' ? '#fff8f6' : '#FAFAFA', opacity: !canCreateOfficial ? 0.6 : 1 }}
                  >
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                      <div style={{ backgroundColor: selectedAppType === 'OFICIAL' ? '#F95D2A' : '#e2e8f0', color: selectedAppType === 'OFICIAL' ? '#fff' : '#64748b', padding: '12px', borderRadius: '12px', transition: 'all 0.2s' }}>
                        <Rocket size={24} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <h3 style={{ margin: '0 0 4px 0', fontSize: '1.1rem', color: '#111', fontWeight: '700' }}>Aplicativo Oficial</h3>
                        <p style={{ margin: 0, color: '#666', fontSize: '0.85rem' }}>
                          Crie seu app de produção vinculado à sua assinatura. 
                          {!canCreateOfficial ? ' (Requer Upgrade)' : ` (Liberado: ${planToEvaluate})`}
                        </p>
                      </div>
                    </div>

                    {selectedAppType === 'OFICIAL' && canCreateOfficial && (
                      <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(249, 93, 42, 0.2)' }} onClick={e => e.stopPropagation()}>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#111', marginBottom: '12px' }}>Selecione o plano do App Oficial:</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <button 
                            type="button"
                            onClick={() => { if(hasDelivery) setSelectedSubPlan('DELIVERY') }}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '12px 16px', borderRadius: '12px', border: selectedSubPlan === 'DELIVERY' && hasDelivery ? '2px solid #F95D2A' : '1px solid rgba(0,0,0,0.1)', backgroundColor: selectedSubPlan === 'DELIVERY' && hasDelivery ? '#fff8f6' : '#fff', opacity: hasDelivery ? 1 : 0.6, cursor: hasDelivery ? 'pointer' : 'not-allowed' }}
                          >
                            <span style={{ fontWeight: '600', color: '#333' }}>Delivery</span>
                            {!hasDelivery && <Lock size={16} color="#999" />}
                          </button>
                          
                          <button 
                            type="button"
                            onClick={() => { if(hasSalao) setSelectedSubPlan('SALAO') }}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '12px 16px', borderRadius: '12px', border: selectedSubPlan === 'SALAO' && hasSalao ? '2px solid #F95D2A' : '1px solid rgba(0,0,0,0.1)', backgroundColor: selectedSubPlan === 'SALAO' && hasSalao ? '#fff8f6' : '#fff', opacity: hasSalao ? 1 : 0.6, cursor: hasSalao ? 'pointer' : 'not-allowed' }}
                          >
                            <span style={{ fontWeight: '600', color: '#333' }}>Salão-Caixa</span>
                            {!hasSalao && <Lock size={16} color="#999" />}
                          </button>
                          
                          <button 
                            type="button"
                            onClick={() => { if(hasCompleto) setSelectedSubPlan('COMPLETO') }}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '12px 16px', borderRadius: '12px', border: selectedSubPlan === 'COMPLETO' && hasCompleto ? '2px solid #F95D2A' : '1px solid rgba(0,0,0,0.1)', backgroundColor: selectedSubPlan === 'COMPLETO' && hasCompleto ? '#fff8f6' : '#fff', opacity: hasCompleto ? 1 : 0.6, cursor: hasCompleto ? 'pointer' : 'not-allowed' }}
                          >
                            <span style={{ fontWeight: '600', color: '#333' }}>Completo</span>
                            {!hasCompleto && <Lock size={16} color="#999" />}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                  <button 
                    onClick={resetCreateModal}
                    style={{ flex: 1, padding: '14px', borderRadius: '99px', border: '1px solid rgba(0,0,0,0.1)', background: '#fff', color: '#333', cursor: 'pointer', fontWeight: '600' }}
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={() => setCreateStep(2)}
                    disabled={!selectedAppType}
                    style={{ flex: 1, padding: '14px', borderRadius: '99px', border: 'none', background: '#F95D2A', color: '#fff', cursor: 'pointer', fontWeight: '600', opacity: !selectedAppType ? 0.5 : 1, boxShadow: '0 4px 14px rgba(249, 93, 42, 0.3)' }}
                  >
                    Continuar
                  </button>
                </div>
              </>
            )}

            {createStep === 2 && (
              <>
                <h2 style={{ margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '1.5rem', color: '#111', fontWeight: '800' }}>
                  <div style={{ backgroundColor: '#fff8f6', padding: '10px', borderRadius: '12px' }}>
                    <Store color="#F95D2A" size={24} />
                  </div>
                  Dê um nome ao seu negócio
                </h2>
                
                <div style={{ marginBottom: '2rem' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#333', fontSize: '0.95rem' }}>
                    Nome Fantasia
                  </label>
                  <input 
                    type="text" 
                    value={newAppName}
                    onChange={e => setNewAppName(e.target.value)}
                    placeholder="Ex: Pizzaria do Mario"
                    style={{ width: '100%', padding: '16px', borderRadius: '12px', border: '2px solid rgba(0,0,0,0.05)', fontSize: '1.05rem', outline: 'none', backgroundColor: '#FAFAFA', transition: 'border-color 0.2s' }}
                    onFocus={(e) => e.target.style.borderColor = '#F95D2A'}
                    onBlur={(e) => e.target.style.borderColor = 'rgba(0,0,0,0.05)'}
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Enter') void handleCreateApp();
                    }}
                  />
                  <p style={{ marginTop: '8px', fontSize: '0.85rem', color: '#666' }}>
                    Modo selecionado: <strong>{selectedAppType === 'TESTE' ? `Teste (${selectedSubPlan})` : `Oficial (${planToEvaluate})`}</strong>
                  </p>
                </div>
                
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button 
                    onClick={() => setCreateStep(1)}
                    style={{ flex: 1, padding: '14px', borderRadius: '99px', border: '1px solid rgba(0,0,0,0.1)', background: '#fff', color: '#333', cursor: 'pointer', fontWeight: '600' }}
                  >
                    Voltar
                  </button>
                  <button 
                    onClick={() => void handleCreateApp()}
                    disabled={!newAppName.trim() || creating}
                    style={{ flex: 1, padding: '14px', borderRadius: '99px', border: 'none', background: '#F95D2A', color: '#fff', cursor: 'pointer', fontWeight: '600', opacity: (!newAppName.trim() || creating) ? 0.7 : 1, boxShadow: '0 4px 14px rgba(249, 93, 42, 0.3)' }}
                  >
                    {creating ? 'Criando...' : 'Finalizar Criação'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal de Configurações do App */}
      {settingsAppId && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(17, 17, 17, 0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem', transition: 'opacity 0.3s ease' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '24px', width: '100%', maxWidth: '700px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 48px -12px rgba(0,0,0,0.18)' }}>
            
            {/* Modal Header */}
            <header style={{ padding: '1.5rem', borderBottom: '1px solid rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '12px', fontSize: '1.25rem', color: '#111', fontWeight: '800' }}>
                <Settings color="#666" size={24} />
                Configurações do Aplicativo
              </h2>
              <button onClick={() => setSettingsAppId(null)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', padding: '4px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
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
                <div style={{ display: 'flex', borderBottom: '1px solid rgba(0,0,0,0.05)', padding: '0 1.5rem', backgroundColor: '#FAFAFA' }}>
                  <button 
                    onClick={() => setSettingsTab('geral')}
                    style={{ padding: '1.2rem 0', marginRight: '2rem', background: 'none', border: 'none', borderBottom: settingsTab === 'geral' ? '3px solid #F95D2A' : '3px solid transparent', color: settingsTab === 'geral' ? '#F95D2A' : '#666', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s' }}
                  >
                    <Edit3 size={18} /> Aparência e Contato
                  </button>
                  <button 
                    onClick={() => setSettingsTab('equipe')}
                    style={{ padding: '1.2rem 0', background: 'none', border: 'none', borderBottom: settingsTab === 'equipe' ? '3px solid #F95D2A' : '3px solid transparent', color: settingsTab === 'equipe' ? '#F95D2A' : '#666', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s' }}
                  >
                    <Users size={18} /> Equipe e Acessos
                  </button>
                </div>

                {/* Tab Content */}
                <div style={{ padding: '1.5rem', overflowY: 'auto', WebkitOverflowScrolling: 'touch', flex: 1 }}>
                  
                  {settingsTab === 'geral' && (
                    <form onSubmit={handleSaveGeneral}>
                      <div style={{ display: 'flex', gap: '2rem', marginBottom: '1.5rem' }}>
                        <div style={{ flexShrink: 0 }}>
                          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#333', fontSize: '0.9rem' }}>Logotipo</label>
                          <div 
                            onClick={() => logoInputRef.current?.click()}
                            style={{ width: '96px', height: '96px', borderRadius: '16px', border: '2px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: 'pointer', backgroundColor: '#FAFAFA', transition: 'border-color 0.2s' }}
                            onMouseOver={(e) => e.currentTarget.style.borderColor = '#F95D2A'}
                            onMouseOut={(e) => e.currentTarget.style.borderColor = '#cbd5e1'}
                          >
                            {formLogoUrl ? <img src={formLogoUrl} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <ImageIcon color="#94a3b8" size={32} />}
                          </div>
                          <input type="file" accept="image/*" hidden ref={logoInputRef} onChange={e => void handleLogoSelect(e.target.files?.[0])} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#333', fontSize: '0.9rem' }}>Nome da loja</label>
                          <input type="text" value={formName} onChange={e => setFormName(e.target.value)} style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.1)', fontSize: '0.95rem', marginBottom: '1rem', outline: 'none' }} onFocus={(e) => e.target.style.borderColor = '#F95D2A'} onBlur={(e) => e.target.style.borderColor = 'rgba(0,0,0,0.1)'} required />
                          
                          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#333', fontSize: '0.9rem' }}>Frase (Tagline)</label>
                          <input type="text" placeholder="Ex: A melhor pizza da cidade" value={formTagline} onChange={e => setFormTagline(e.target.value)} style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.1)', fontSize: '0.95rem', outline: 'none' }} onFocus={(e) => e.target.style.borderColor = '#F95D2A'} onBlur={(e) => e.target.style.borderColor = 'rgba(0,0,0,0.1)'} />
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#333', fontSize: '0.9rem' }}>WhatsApp Business</label>
                          <div style={{ position: 'relative' }}>
                            <Phone size={18} color="#94a3b8" style={{ position: 'absolute', left: '14px', top: '16px' }} />
                            <input type="text" placeholder="5511999999999" value={formWhatsapp} onChange={e => setFormWhatsapp(e.target.value.replace(/\D/g, ''))} style={{ width: '100%', padding: '14px 14px 14px 42px', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.1)', fontSize: '0.95rem', boxSizing: 'border-box', outline: 'none' }} onFocus={(e) => e.target.style.borderColor = '#F95D2A'} onBlur={(e) => e.target.style.borderColor = 'rgba(0,0,0,0.1)'} />
                          </div>
                          <p style={{ fontSize: '0.8rem', color: '#666', marginTop: '6px' }}>Apenas números com DDD. Ex: 5511999999999</p>
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#333', fontSize: '0.9rem' }}>Cor Primária</label>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <input type="color" value={formPrimaryColor} onChange={e => setFormPrimaryColor(e.target.value)} style={{ width: '52px', height: '52px', padding: '0', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.1)', cursor: 'pointer' }} />
                            <input type="text" value={formPrimaryColor} onChange={e => setFormPrimaryColor(e.target.value.toUpperCase())} style={{ flex: 1, padding: '14px', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.1)', fontSize: '0.95rem', textTransform: 'uppercase', outline: 'none' }} onFocus={(e) => e.target.style.borderColor = '#F95D2A'} onBlur={(e) => e.target.style.borderColor = 'rgba(0,0,0,0.1)'} />
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: '1.5rem' }}>
                        <button type="submit" disabled={savingSettings} style={{ padding: '14px 28px', borderRadius: '99px', border: 'none', background: '#F95D2A', color: '#fff', cursor: 'pointer', fontWeight: '600', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 14px rgba(249, 93, 42, 0.3)' }}>
                          <Save size={18} /> {savingSettings ? 'Salvando...' : 'Salvar Alterações'}
                        </button>
                      </div>
                    </form>
                  )}

                  {settingsTab === 'equipe' && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem', alignItems: 'flex-start' }}>
                      {/* Funções (Roles) */}
                      <div style={{ flex: 1, backgroundColor: '#FAFAFA', padding: '1.5rem', borderRadius: '16px', border: '1px solid rgba(0,0,0,0.05)' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: '800', marginBottom: '1rem', color: '#111', display: 'flex', alignItems: 'center', gap: '8px' }}><Shield size={20} color="#F95D2A" /> Funções</h3>
                        
                        <form onSubmit={handleAddRole} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '1.5rem', backgroundColor: '#fff', padding: '16px', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.05)', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}>
                          <input type="text" placeholder="Nome da função (Ex: Cozinheiro)" value={newRoleName} onChange={e => setNewRoleName(e.target.value)} required style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.1)', fontSize: '0.95rem', boxSizing: 'border-box', outline: 'none' }} onFocus={(e) => e.target.style.borderColor = '#F95D2A'} onBlur={(e) => e.target.style.borderColor = 'rgba(0,0,0,0.1)'} />
                          
                          <div>
                            <strong style={{ display: 'block', fontSize: '0.85rem', color: '#333', marginBottom: '8px', fontWeight: '600' }}>Permissões de Acesso:</strong>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                              {PERMISSIONS.map(p => (
                                <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer', color: '#444' }}>
                                  <input 
                                    type="checkbox" 
                                    checked={newRolePermissions.includes(p.id)}
                                    onChange={e => {
                                      if (e.target.checked) setNewRolePermissions([...newRolePermissions, p.id]);
                                      else setNewRolePermissions(newRolePermissions.filter(id => id !== p.id));
                                    }}
                                    style={{ accentColor: '#F95D2A', width: '16px', height: '16px' }}
                                  />
                                  {p.label}
                                </label>
                              ))}
                            </div>
                          </div>

                          <button type="submit" disabled={isAddingRole || newRolePermissions.length === 0} style={{ padding: '12px', background: '#111', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', opacity: (isAddingRole || newRolePermissions.length === 0) ? 0.5 : 1, marginTop: '8px' }}>
                            Criar Função
                          </button>
                        </form>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {fullApp.roles?.length > 0 ? fullApp.roles.map((r: any) => (
                            <div key={r._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', backgroundColor: '#fff', border: '1px solid rgba(0,0,0,0.05)', borderRadius: '10px', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <span style={{ fontSize: '0.95rem', fontWeight: '700', color: '#111' }}>{r.name}</span>
                                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    {r.permissions?.map((p: any) => (
                                      <span key={p} style={{ backgroundColor: '#fff8f6', color: '#F95D2A', fontSize: '0.75rem', padding: '4px 8px', borderRadius: '6px', textTransform: 'capitalize', fontWeight: '600' }}>
                                        {PERMISSIONS.find(perm => perm.id === p)?.label || p}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              <button onClick={() => handleRemoveRole(r._id)} style={{ background: '#fff', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444', cursor: 'pointer', padding: '8px', borderRadius: '8px' }}><Trash2 size={16} /></button>
                            </div>
                          )) : <p style={{ fontSize: '0.85rem', color: '#666', fontStyle: 'italic', textAlign: 'center' }}>Nenhuma função criada.</p>}
                        </div>
                      </div>

                      {/* Funcionários (Employees) */}
                      <div style={{ flex: 1, backgroundColor: '#FAFAFA', padding: '1.5rem', borderRadius: '16px', border: '1px solid rgba(0,0,0,0.05)' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: '800', marginBottom: '1rem', color: '#111', display: 'flex', alignItems: 'center', gap: '8px' }}><Users size={20} color="#F95D2A" /> Funcionários</h3>
                        
                        <form onSubmit={handleAddEmployee} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '1.5rem', backgroundColor: '#fff', padding: '16px', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.05)', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}>
                          <input type="text" placeholder="Nome do funcionário" value={newEmpName} onChange={e => setNewEmpName(e.target.value)} required style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.1)', fontSize: '0.95rem', boxSizing: 'border-box', outline: 'none' }} onFocus={(e) => e.target.style.borderColor = '#F95D2A'} onBlur={(e) => e.target.style.borderColor = 'rgba(0,0,0,0.1)'} />
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <select value={newEmpRoleId} onChange={e => setNewEmpRoleId(e.target.value)} required style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.1)', fontSize: '0.95rem', outline: 'none', backgroundColor: '#fff' }} onFocus={(e) => e.target.style.borderColor = '#F95D2A'} onBlur={(e) => e.target.style.borderColor = 'rgba(0,0,0,0.1)'}>
                              <option value="" disabled>Selecione a função</option>
                              {fullApp.roles?.map((r: any) => <option key={r._id} value={r._id}>{r.name}</option>)}
                            </select>
                            <button type="submit" disabled={isAddingEmp || !newEmpRoleId} style={{ padding: '12px 16px', background: '#F95D2A', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', opacity: (!newEmpRoleId) ? 0.5 : 1 }}>Adicionar</button>
                          </div>
                        </form>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {fullApp.employees?.length > 0 ? fullApp.employees.map((emp: any) => {
                            const role = fullApp.roles?.find((r: any) => r._id === emp.roleId);
                            return (
                              <div key={emp._id} style={{ padding: '14px', backgroundColor: '#fff', border: '1px solid rgba(0,0,0,0.05)', borderRadius: '10px', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                  <div>
                                    <strong style={{ display: 'block', fontSize: '1rem', color: '#111', fontWeight: '700' }}>{emp.name}</strong>
                                    <span style={{ fontSize: '0.85rem', color: '#666' }}>{role ? role.name : 'Sem função'}</span>
                                  </div>
                                  <button onClick={() => handleRemoveEmployee(emp._id)} style={{ background: '#fff', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444', cursor: 'pointer', padding: '8px', borderRadius: '8px' }}><Trash2 size={16} /></button>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: '#FAFAFA', padding: '10px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.03)' }}>
                                  <KeySquare size={18} color="#666" />
                                  <span style={{ fontFamily: 'monospace', fontWeight: 'bold', fontSize: '1.1rem', letterSpacing: '3px', color: '#111' }}>{emp.accessCode}</span>
                                </div>
                              </div>
                            );
                          }) : <p style={{ fontSize: '0.85rem', color: '#666', fontStyle: 'italic', textAlign: 'center' }}>Nenhum funcionário adicionado.</p>}
                        </div>
                      </div>

                      {/* Saguões (praças de preparo da cozinha) */}
                      <div style={{ flexBasis: '100%', backgroundColor: '#FAFAFA', padding: '1.5rem', borderRadius: '16px', border: '1px solid rgba(0,0,0,0.05)' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: '800', marginBottom: '4px', color: '#111', display: 'flex', alignItems: 'center', gap: '8px' }}><ChefHat size={20} color="#F95D2A" /> Saguões</h3>
                        <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '1rem' }}>
                          As praças de preparo da cozinha. Cada produto do cardápio é roteado para um saguão.
                        </p>

                        <form onSubmit={handleAddStation} style={{ display: 'flex', gap: '8px', marginBottom: '1rem' }}>
                          <input
                            type="text"
                            placeholder="Ex: Sushi, Chapa, Forno, Bebidas"
                            value={newStationName}
                            onChange={e => setNewStationName(e.target.value)}
                            required
                            style={{ flex: 1, minWidth: 0, padding: '12px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.1)', fontSize: '0.95rem', boxSizing: 'border-box', outline: 'none' }}
                            onFocus={(e) => e.target.style.borderColor = '#F95D2A'}
                            onBlur={(e) => e.target.style.borderColor = 'rgba(0,0,0,0.1)'}
                          />
                          <button type="submit" disabled={isAddingStation || !newStationName.trim()} style={{ flexShrink: 0, padding: '12px 20px', background: '#111', color: '#fff', border: 'none', borderRadius: '99px', fontWeight: '600', cursor: 'pointer', opacity: (isAddingStation || !newStationName.trim()) ? 0.5 : 1 }}>
                            Adicionar
                          </button>
                        </form>

                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {fullApp.stations?.length > 0 ? fullApp.stations.map((st: any) => (
                            <span key={st._id} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '99px', padding: '8px 8px 8px 14px', fontSize: '0.9rem', fontWeight: '600', color: '#111' }}>
                              {st.name}
                              <button onClick={() => handleRemoveStation(st._id, st.name)} aria-label={`Excluir saguão ${st.name}`} style={{ display: 'flex', background: '#fff5f5', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px', borderRadius: '99px' }}><Trash2 size={14} /></button>
                            </span>
                          )) : <p style={{ fontSize: '0.85rem', color: '#666', fontStyle: 'italic' }}>Nenhum saguão criado. Sem eles, a aba Cozinha mostra tudo junto.</p>}
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
      {ConfirmElement}
    </div>
  );
}
