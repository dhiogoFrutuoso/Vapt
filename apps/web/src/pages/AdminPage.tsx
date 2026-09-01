import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api, type AuthUser } from '../lib/api';
import { Shield, Search, UserIcon, X, Calendar, Database, Activity, ArrowLeft, Phone, Key, CreditCard, Clock, Save, LogIn } from 'lucide-react';

const normalizeString = (str: string | undefined | null) => {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
};

export function AdminPage() {
  const [allUsers, setAllUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Pagination & Filters
  const [page, setPage] = useState(1);
  const limit = 30; // Limite client-side
  
  const [search, setSearch] = useState('');
  const [isSubscribed, setIsSubscribed] = useState('');
  const [plan, setPlan] = useState('');

  // Modal
  const [selectedUser, setSelectedUser] = useState<AuthUser | null>(null);

  // Modal Form State
  const [formPlan, setFormPlan] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [savingPlan, setSavingPlan] = useState(false);

  // Update form state when user changes
  useEffect(() => {
    if (selectedUser) {
      setFormPlan(selectedUser.plan || '');
      setFormStartDate(selectedUser.planStartDate ? new Date(selectedUser.planStartDate).toISOString().split('T')[0] : '');
      setFormEndDate(selectedUser.planEndDate ? new Date(selectedUser.planEndDate).toISOString().split('T')[0] : '');
    }
  }, [selectedUser]);

  // Fetch only once to load a robust block of users for in-memory processing
  useEffect(() => {
    let mounted = true;
    const fetchUsers = async () => {
      setLoading(true);
      try {
        // limit = 1000 ensures we bring a large block of users to filter locally
        const data = await api.getAdminUsers(1, 1000, '', '', '');
        if (mounted && data) {
          setAllUsers(data.users || []);
        }
      } catch (err) {
        console.error('Erro ao buscar usuários:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void fetchUsers();
    return () => { mounted = false; };
  }, []);

  // Real-Time Filtering Algorithm
  const filteredUsers = useMemo(() => {
    const normalizedSearch = normalizeString(search);
    
    return allUsers.filter(u => {
      // Substring Matching
      const matchSearch = normalizedSearch === '' || 
        normalizeString(u.displayName).includes(normalizedSearch) || 
        normalizeString(u.email).includes(normalizedSearch) ||
        normalizeString(u.username).includes(normalizedSearch);
        
      // Event-Driven Array Filtering for status
      const matchStatus = isSubscribed === '' || 
        (isSubscribed === 'true' && u.status === 'ativo') || 
        (isSubscribed === 'false' && u.status !== 'ativo');
        
      // Event-Driven Array Filtering for plan
      const matchPlan = plan === '' || (plan === 'Sem plano' ? (!u.plan) : u.plan === plan);
      
      return matchSearch && matchStatus && matchPlan;
    });
  }, [allUsers, search, isSubscribed, plan]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [search, isSubscribed, plan]);

  // Client-side pagination
  const totalUsers = filteredUsers.length;
  const totalPages = Math.ceil(totalUsers / limit) || 1;
  const paginatedUsers = filteredUsers.slice((page - 1) * limit, page * limit);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedUser(null);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const handleSavePlan = async () => {
    if (!selectedUser) return;
    setSavingPlan(true);
    try {
      const response = await api.updateUserPlan(selectedUser.id, formPlan, formStartDate, formEndDate);
      // Update local state without refresh
      setAllUsers(prev => prev.map(u => u.id === selectedUser.id ? response.user : u));
      setSelectedUser(response.user);
      alert('Plano atualizado com sucesso!');
    } catch (err) {
      console.error(err);
      alert('Erro ao atualizar o plano.');
    } finally {
      setSavingPlan(false);
    }
  };

  const handleImpersonate = async () => {
    if (!selectedUser) return;
    try {
      const res = await api.impersonateUser(selectedUser.id);
      if (res && res.token) {
        // Save admin token to allow coming back
        if (res.adminToken) {
          localStorage.setItem('vapt_admin_token', res.adminToken);
        }
        // Token is already set in the HTTP-only cookie by the backend
        window.location.href = '/painel'; // Redirect to user dashboard
      }
    } catch (err) {
      alert('Erro ao acessar o painel do lojista.');
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#FAFAFA', color: '#111', fontFamily: '"Inter", "Poppins", sans-serif' }}>
        <header style={{ 
          backgroundColor: 'rgba(255, 255, 255, 0.8)', 
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(0,0,0,0.05)',
          position: 'sticky',
          top: 0,
          zIndex: 50
        }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '16px', backgroundColor: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(0,0,0,0.05)' }}>
                <Shield size={24} style={{ color: '#F95D2A' }} />
              </div>
              <div>
                <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#111' }}>Painel Admin</h1>
                <span style={{ fontSize: '0.9rem', color: '#666' }}>Gestão de clientes e assinaturas</span>
              </div>
            </div>
            <Link to="/painel" style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px',
              backgroundColor: '#FFF',
              color: '#111',
              textDecoration: 'none',
              padding: '10px 20px',
              borderRadius: '9999px',
              fontWeight: 600,
              fontSize: '0.95rem',
              boxShadow: '0 10px 30px rgba(0,0,0,0.04)',
              transition: 'all 0.2s ease'
            }}>
              <ArrowLeft size={18} /> Voltar para o Painel
            </Link>
          </div>
        </header>

        <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 24px' }}>
          {/* Control Bar */}
          <div style={{ display: 'flex', gap: '16px', marginBottom: '32px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '300px', position: 'relative' }}>
              <Search size={20} style={{ position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)', color: '#999' }} />
              <input 
                type="text" 
                placeholder="Buscar por nome ou e-mail..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ 
                  width: '100%',
                  padding: '14px 20px 14px 52px',
                  borderRadius: '9999px',
                  border: 'none',
                  backgroundColor: '#FFF',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.04)',
                  fontSize: '1rem',
                  color: '#111',
                  outline: 'none',
                  transition: 'box-shadow 0.2s ease'
                }}
                onFocus={(e) => e.target.style.boxShadow = '0 0 0 2px #F95D2A, 0 10px 30px rgba(0,0,0,0.04)'}
                onBlur={(e) => e.target.style.boxShadow = '0 10px 30px rgba(0,0,0,0.04)'}
              />
            </div>
            
            <select 
              value={isSubscribed} 
              onChange={(e) => setIsSubscribed(e.target.value)}
              style={{ 
                minWidth: '200px',
                padding: '14px 20px',
                borderRadius: '9999px',
                border: 'none',
                backgroundColor: '#FFF',
                boxShadow: '0 10px 30px rgba(0,0,0,0.04)',
                fontSize: '1rem',
                color: '#111',
                outline: 'none',
                cursor: 'pointer',
                appearance: 'none',
                backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23111111%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 20px top 50%',
                backgroundSize: '12px auto',
                transition: 'box-shadow 0.2s ease'
              }}
              onFocus={(e) => e.target.style.boxShadow = '0 0 0 2px #F95D2A, 0 10px 30px rgba(0,0,0,0.04)'}
              onBlur={(e) => e.target.style.boxShadow = '0 10px 30px rgba(0,0,0,0.04)'}
            >
              <option value="">Status: Todos</option>
              <option value="true">Ativos</option>
              <option value="false">Suspensos</option>
            </select>

            <select 
              value={plan} 
              onChange={(e) => setPlan(e.target.value)}
              style={{ 
                minWidth: '200px',
                padding: '14px 20px',
                borderRadius: '9999px',
                border: 'none',
                backgroundColor: '#FFF',
                boxShadow: '0 10px 30px rgba(0,0,0,0.04)',
                fontSize: '1rem',
                color: '#111',
                outline: 'none',
                cursor: 'pointer',
                appearance: 'none',
                backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23111111%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 20px top 50%',
                backgroundSize: '12px auto',
                transition: 'box-shadow 0.2s ease'
              }}
              onFocus={(e) => e.target.style.boxShadow = '0 0 0 2px #F95D2A, 0 10px 30px rgba(0,0,0,0.04)'}
              onBlur={(e) => e.target.style.boxShadow = '0 10px 30px rgba(0,0,0,0.04)'}
            >
              <option value="">Plano: Todos</option>
              <option value="Delivery">Delivery</option>
              <option value="Salão-Caixa">Salão-Caixa</option>
              <option value="Completo">Completo</option>
              <option value="Sem plano">Sem plano</option>
            </select>
          </div>

          <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#111' }}>Usuários Cadastrados</h2>
            <span style={{ fontSize: '0.9rem', color: '#666', backgroundColor: '#EFEFEF', padding: '4px 12px', borderRadius: '9999px', fontWeight: 600 }}>Total: {totalUsers}</span>
          </div>

          <div style={{ textAlign: 'center', padding: '64px', color: '#666' }}>Carregando usuários...</div>
        </main>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#FAFAFA', color: '#111', fontFamily: '"Inter", "Poppins", sans-serif' }}>
      <header style={{ 
        backgroundColor: 'rgba(255, 255, 255, 0.8)', 
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(0,0,0,0.05)',
        position: 'sticky',
        top: 0,
        zIndex: 50
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '16px', backgroundColor: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(0,0,0,0.05)' }}>
              <Shield size={24} style={{ color: '#F95D2A' }} />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#111' }}>Painel Admin</h1>
              <span style={{ fontSize: '0.9rem', color: '#666' }}>Gestão de clientes e assinaturas</span>
            </div>
          </div>
          <Link to="/painel" style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px',
            backgroundColor: '#FFF',
            color: '#111',
            textDecoration: 'none',
            padding: '10px 20px',
            borderRadius: '9999px',
            fontWeight: 600,
            fontSize: '0.95rem',
            boxShadow: '0 10px 30px rgba(0,0,0,0.04)',
            transition: 'all 0.2s ease'
          }}>
            <ArrowLeft size={18} /> Voltar para o Painel
          </Link>
        </div>
      </header>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 24px' }}>
        {/* Control Bar */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '32px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '300px', position: 'relative' }}>
            <Search size={20} style={{ position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)', color: '#999' }} />
            <input 
              type="text" 
              placeholder="Buscar por nome ou e-mail..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ 
                width: '100%',
                padding: '14px 20px 14px 52px',
                borderRadius: '9999px',
                border: 'none',
                backgroundColor: '#FFF',
                boxShadow: '0 10px 30px rgba(0,0,0,0.04)',
                fontSize: '1rem',
                color: '#111',
                outline: 'none',
                transition: 'box-shadow 0.2s ease'
              }}
              onFocus={(e) => e.target.style.boxShadow = '0 0 0 2px #F95D2A, 0 10px 30px rgba(0,0,0,0.04)'}
              onBlur={(e) => e.target.style.boxShadow = '0 10px 30px rgba(0,0,0,0.04)'}
            />
          </div>
          
          <select 
            value={isSubscribed} 
            onChange={(e) => setIsSubscribed(e.target.value)}
            style={{ 
              minWidth: '200px',
              padding: '14px 20px',
              borderRadius: '9999px',
              border: 'none',
              backgroundColor: '#FFF',
              boxShadow: '0 10px 30px rgba(0,0,0,0.04)',
              fontSize: '1rem',
              color: '#111',
              outline: 'none',
              cursor: 'pointer',
              appearance: 'none',
              backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23111111%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 20px top 50%',
              backgroundSize: '12px auto',
              transition: 'box-shadow 0.2s ease'
            }}
            onFocus={(e) => e.target.style.boxShadow = '0 0 0 2px #F95D2A, 0 10px 30px rgba(0,0,0,0.04)'}
            onBlur={(e) => e.target.style.boxShadow = '0 10px 30px rgba(0,0,0,0.04)'}
          >
            <option value="">Status: Todos</option>
            <option value="true">Ativos</option>
            <option value="false">Suspensos</option>
          </select>

          <select 
            value={plan} 
            onChange={(e) => setPlan(e.target.value)}
            style={{ 
              minWidth: '200px',
              padding: '14px 20px',
              borderRadius: '9999px',
              border: 'none',
              backgroundColor: '#FFF',
              boxShadow: '0 10px 30px rgba(0,0,0,0.04)',
              fontSize: '1rem',
              color: '#111',
              outline: 'none',
              cursor: 'pointer',
              appearance: 'none',
              backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23111111%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 20px top 50%',
              backgroundSize: '12px auto',
              transition: 'box-shadow 0.2s ease'
            }}
            onFocus={(e) => e.target.style.boxShadow = '0 0 0 2px #F95D2A, 0 10px 30px rgba(0,0,0,0.04)'}
            onBlur={(e) => e.target.style.boxShadow = '0 10px 30px rgba(0,0,0,0.04)'}
          >
            <option value="">Plano: Todos</option>
            <option value="Delivery">Delivery</option>
            <option value="Salão-Caixa">Salão-Caixa</option>
            <option value="Completo">Completo</option>
            <option value="Sem plano">Sem plano</option>
          </select>
        </div>

        <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#111' }}>Usuários Cadastrados</h2>
          <span style={{ fontSize: '0.9rem', color: '#666', backgroundColor: '#EFEFEF', padding: '4px 12px', borderRadius: '9999px', fontWeight: 600 }}>Total: {totalUsers}</span>
        </div>

        {/* User List */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '64px', color: '#666' }}>Carregando usuários...</div>
        ) : paginatedUsers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 40px', backgroundColor: '#FFF', borderRadius: '24px', boxShadow: '0 10px 30px rgba(0,0,0,0.04)' }}>
            <Search size={48} style={{ color: '#DDD', margin: '0 auto 16px' }} />
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600, color: '#111', margin: '0 0 8px 0' }}>Nenhum usuário encontrado</h3>
            <p style={{ color: '#666', margin: 0 }}>Tente ajustar os filtros de busca para encontrar o que procura.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '24px' }}>
            {paginatedUsers.map(u => {
              return (
              <div 
                key={u.id} 
                onClick={() => setSelectedUser(u)}
                style={{ 
                  backgroundColor: '#FFF',
                  padding: '24px', 
                  borderRadius: '24px',
                  display: 'flex', 
                  gap: '16px', 
                  cursor: 'pointer', 
                  boxShadow: '0 10px 30px rgba(0,0,0,0.04)',
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                  position: 'relative'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = '0 20px 40px rgba(0,0,0,0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,0,0,0.04)';
                }}
              >
                <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: '#F5F5F5', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {u.photoUrl ? <img src={u.photoUrl} alt="Foto" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <UserIcon size={24} style={{ color: '#999' }} />}
                </div>
                <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.displayName || u.username || 'Sem Nome'}</h3>
                    {u.isAdmin && <span style={{ padding: '4px 8px', backgroundColor: '#FFF0EC', color: '#F95D2A', fontSize: '0.65rem', borderRadius: '9999px', fontWeight: 800, textTransform: 'uppercase' }}>Admin</span>}
                  </div>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</p>
                </div>
                {/* Status Indicator */}
                <div style={{ position: 'absolute', top: '24px', right: '24px', width: '12px', height: '12px', borderRadius: '50%', backgroundColor: u.status === 'ativo' ? '#10B981' : '#EF4444', boxShadow: `0 0 0 3px ${u.status === 'ativo' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}` }}></div>
              </div>
            )})}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '20px', marginTop: '48px' }}>
            <button 
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{ 
                padding: '10px 24px',
                borderRadius: '9999px',
                border: 'none',
                backgroundColor: '#FFF',
                boxShadow: '0 10px 30px rgba(0,0,0,0.04)',
                fontWeight: 600,
                color: '#111',
                opacity: page === 1 ? 0.5 : 1, 
                cursor: page === 1 ? 'not-allowed' : 'pointer' 
              }}
            >
              Anterior
            </button>
            <span style={{ color: '#666', fontWeight: 600 }}>Página {page} de {totalPages}</span>
            <button 
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              style={{ 
                padding: '10px 24px',
                borderRadius: '9999px',
                border: 'none',
                backgroundColor: '#FFF',
                boxShadow: '0 10px 30px rgba(0,0,0,0.04)',
                fontWeight: 600,
                color: '#111',
                opacity: page === totalPages ? 0.5 : 1, 
                cursor: page === totalPages ? 'not-allowed' : 'pointer' 
              }}
            >
              Próxima
            </button>
          </div>
        )}
      </main>

      {/* User Details Modal */}
      {selectedUser && (
        <div style={{ 
          position: 'fixed', 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.4)', 
          backdropFilter: 'blur(4px)',
          zIndex: 9999, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          padding: '24px' 
        }} onClick={() => setSelectedUser(null)}>
          <div style={{ 
            width: '100%', 
            maxWidth: '640px', 
            backgroundColor: '#FFF',
            borderRadius: '24px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.1)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '90vh'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '32px', borderBottom: '1px solid rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
                <div style={{ width: '88px', height: '88px', borderRadius: '50%', backgroundColor: '#F5F5F5', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {selectedUser.photoUrl ? <img src={selectedUser.photoUrl} alt="Foto de perfil do usuário" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} /> : <UserIcon size={40} style={{ color: '#999' }} />}
                </div>
                <div>
                  <h2 style={{ margin: '0 0 8px 0', fontSize: '1.75rem', fontWeight: 800, color: '#111', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {selectedUser.displayName || selectedUser.username || 'Sem Nome'}
                    {selectedUser.isAdmin && <span style={{ padding: '4px 10px', backgroundColor: '#FFF0EC', color: '#F95D2A', fontSize: '0.75rem', borderRadius: '9999px', fontWeight: 800, textTransform: 'uppercase' }}>Admin</span>}
                  </h2>
                  <p style={{ margin: 0, fontSize: '1.1rem', color: '#666' }}>{selectedUser.email}</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={handleImpersonate} style={{ background: '#F95D2A', border: 'none', cursor: 'pointer', color: '#FFF', padding: '10px 16px', borderRadius: '9999px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '0.9rem', transition: 'background-color 0.2s', boxShadow: '0 4px 12px rgba(249, 93, 42, 0.2)' }}>
                  <LogIn size={16} /> Acessar Painel do Lojista
                </button>
                <button onClick={() => setSelectedUser(null)} style={{ background: '#F5F5F5', border: 'none', cursor: 'pointer', color: '#666', width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background-color 0.2s' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#EFEFEF'} onMouseLeave={e => e.currentTarget.style.backgroundColor = '#F5F5F5'}>
                  <X size={20} />
                </button>
              </div>
            </div>
            
            <div style={{ padding: '32px', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
                <div style={{ backgroundColor: '#FAFAFA', padding: '20px', borderRadius: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#666', marginBottom: '8px', fontSize: '0.95rem' }}><Activity size={18} /> Status da Conta</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: selectedUser.status === 'ativo' ? '#10B981' : '#EF4444' }}></div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111', textTransform: 'capitalize' }}>{selectedUser.status || 'Desconhecido'}</div>
                  </div>
                </div>
                <div style={{ backgroundColor: '#FAFAFA', padding: '20px', borderRadius: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#666', marginBottom: '8px', fontSize: '0.95rem' }}><Key size={18} /> Tipo de Permissão</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111' }}>{selectedUser.isAdmin ? 'Administrador' : 'Proprietário/Lojista'}</div>
                </div>
                <div style={{ backgroundColor: '#FAFAFA', padding: '20px', borderRadius: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#666', marginBottom: '8px', fontSize: '0.95rem' }}><Phone size={18} /> Telefone / WhatsApp</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111' }}>{selectedUser.phone || 'Não informado'}</div>
                </div>
                <div style={{ backgroundColor: '#FAFAFA', padding: '20px', borderRadius: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#666', marginBottom: '8px', fontSize: '0.95rem' }}><Clock size={18} /> Último Login</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111' }}>
                    {selectedUser.lastLoginAt ? new Date(selectedUser.lastLoginAt).toLocaleDateString('pt-BR') : 'Nunca logou'}
                  </div>
                </div>
                <div style={{ backgroundColor: '#FAFAFA', padding: '20px', borderRadius: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#666', marginBottom: '8px', fontSize: '0.95rem' }}><Calendar size={18} /> Cadastrado em</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111' }}>
                    {new Date(selectedUser.createdAt || Date.now()).toLocaleDateString('pt-BR')}
                  </div>
                </div>
                <div style={{ backgroundColor: '#FAFAFA', padding: '20px', borderRadius: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#666', marginBottom: '8px', fontSize: '0.95rem' }}><Database size={18} /> ID no Banco</div>
                  <div style={{ fontSize: '1rem', fontFamily: 'monospace', color: '#111', fontWeight: 600 }}>{selectedUser.id}</div>
                </div>
              </div>

              <div style={{ backgroundColor: '#FFF', border: '1px solid rgba(0,0,0,0.05)', borderRadius: '24px', padding: '24px', boxShadow: '0 4px 14px rgba(0,0,0,0.02)' }}>
                <h3 style={{ margin: '0 0 20px 0', fontSize: '1.2rem', fontWeight: 700, color: '#111', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CreditCard size={20} style={{ color: '#F95D2A' }} /> Gerenciar Assinatura
                </h3>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px', marginBottom: '24px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.95rem', fontWeight: 600, color: '#333' }}>Plano Ativo</label>
                    <select 
                      value={formPlan} 
                      onChange={(e) => setFormPlan(e.target.value)}
                      style={{ 
                        width: '100%',
                        padding: '14px 16px',
                        borderRadius: '12px',
                        border: '1px solid #E5E5E5',
                        backgroundColor: '#FAFAFA',
                        fontSize: '1rem',
                        color: '#111',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="">Sem plano</option>
                      <option value="Delivery">Delivery</option>
                      <option value="Salão-Caixa">Salão-Caixa</option>
                      <option value="Completo">Completo</option>
                    </select>
                  </div>
                  
                  {formPlan && formPlan !== 'Sem plano' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.95rem', fontWeight: 600, color: '#333' }}>Data de Início</label>
                        <input 
                          type="date" 
                          value={formStartDate} 
                          onChange={(e) => setFormStartDate(e.target.value)}
                          style={{ 
                            width: '100%',
                            padding: '14px 16px',
                            borderRadius: '12px',
                            border: '1px solid #E5E5E5',
                            backgroundColor: '#FAFAFA',
                            fontSize: '1rem',
                            color: '#111',
                            outline: 'none'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.95rem', fontWeight: 600, color: '#333' }}>Data de Fim (Prazo)</label>
                        <input 
                          type="date" 
                          value={formEndDate} 
                          onChange={(e) => setFormEndDate(e.target.value)}
                          style={{ 
                            width: '100%',
                            padding: '14px 16px',
                            borderRadius: '12px',
                            border: '1px solid #E5E5E5',
                            backgroundColor: '#FAFAFA',
                            fontSize: '1rem',
                            color: '#111',
                            outline: 'none'
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button 
                    onClick={handleSavePlan}
                    disabled={savingPlan}
                    style={{ 
                      padding: '14px 32px', 
                      borderRadius: '9999px', 
                      border: 'none', 
                      backgroundColor: '#F95D2A', 
                      color: '#FFF', 
                      fontWeight: 700, 
                      fontSize: '1rem',
                      cursor: savingPlan ? 'not-allowed' : 'pointer',
                      boxShadow: '0 10px 20px rgba(249, 93, 42, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      opacity: savingPlan ? 0.7 : 1,
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {savingPlan ? 'Salvando...' : <><Save size={18} /> Salvar Alterações</>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
