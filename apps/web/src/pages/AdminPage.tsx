import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, type AuthUser } from '../lib/api';
import { Shield, Search, User as UserIcon, X, Calendar, Database, Link as LinkIcon, Activity , ArrowLeft} from 'lucide-react';

export function AdminPage() {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Pagination & Filters
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const limit = 30;
  
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isSubscribed, setIsSubscribed] = useState('');
  const [plan, setPlan] = useState('');

  // Modal
  const [selectedUser, setSelectedUser] = useState<AuthUser | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset page on search
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let mounted = true;
    const fetchUsers = async () => {
      setLoading(true);
      try {
        const data = await api.getAdminUsers(page, limit, debouncedSearch, isSubscribed, plan);
        if (mounted) {
          setUsers(data.users);
          setTotalPages(data.totalPages);
          setTotalUsers(data.totalUsers);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchUsers();
    return () => { mounted = false; };
  }, [page, limit, debouncedSearch, isSubscribed, plan]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedUser(null);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  return (
    <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', color: '#f8fafc', fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <header style={{ padding: '20px 32px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1e293b' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Shield size={28} color="#3b82f6" />
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Painel Admin</h1>
            <span style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Gestão de clientes e assinaturas</span>
          </div>
        </div>
        <Link to="/painel" style={{ padding: '8px 16px', backgroundColor: '#334155', color: '#f8fafc', borderRadius: '8px', textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', transition: 'background-color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#475569'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#334155'}><ArrowLeft size={18} /> Voltar para o Painel</Link>
      </header>

      <main style={{ padding: '32px', maxWidth: '1400px', margin: '0 auto' }}>
        {/* Control Bar */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '300px', position: 'relative' }}>
            <Search size={20} color="#94a3b8" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
            <input 
              type="text" 
              placeholder="Buscar por nome ou e-mail..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', padding: '12px 16px 12px 48px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f8fafc', outline: 'none' }}
            />
          </div>
          
          <select 
            value={isSubscribed} 
            onChange={(e) => { setIsSubscribed(e.target.value); setPage(1); }}
            style={{ padding: '12px 16px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f8fafc', outline: 'none', minWidth: '200px' }}
          >
            <option value="">Status: Todos</option>
            <option value="true">Assinatura Ativa</option>
            <option value="false">Sem Assinatura</option>
          </select>

          <select 
            value={plan} 
            onChange={(e) => { setPlan(e.target.value); setPage(1); }}
            style={{ padding: '12px 16px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f8fafc', outline: 'none', minWidth: '200px' }}
          >
            <option value="">Plano: Todos</option>
            <option value="básico">Básico</option>
            <option value="pro">Pro</option>
          </select>
        </div>

        <p style={{ color: '#94a3b8', marginBottom: '16px' }}>Total de usuários: {totalUsers}</p>

        {/* User List */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '64px' }}>Carregando usuários...</div>
        ) : users.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px', backgroundColor: '#1e293b', borderRadius: '12px', color: '#94a3b8' }}>
            Nenhum usuário encontrado.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
            {users.map(u => (
              <div 
                key={u.id || u.id} 
                onClick={() => setSelectedUser(u)}
                style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '20px', display: 'flex', gap: '16px', cursor: 'pointer', transition: 'transform 0.2s, background-color 0.2s', border: '1px solid #334155' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#334155'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#1e293b'; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: '#334155', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {u.photoUrl ? <img src={u.photoUrl} alt="Foto" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <UserIcon size={24} color="#94a3b8" />}
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.displayName || u.username || 'Sem Nome'}</h3>
                    {u.isAdmin && <span style={{ padding: '2px 6px', backgroundColor: '#ef4444', color: '#fff', fontSize: '0.65rem', borderRadius: '4px', fontWeight: 800, textTransform: 'uppercase' }}>Admin</span>}
                  </div>
                  <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginTop: '40px' }}>
            <button 
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{ padding: '10px 20px', backgroundColor: page === 1 ? '#1e293b' : '#3b82f6', color: page === 1 ? '#64748b' : '#fff', border: 'none', borderRadius: '8px', cursor: page === 1 ? 'not-allowed' : 'pointer', fontWeight: 600 }}
            >
              Anterior
            </button>
            <span style={{ color: '#94a3b8' }}>Página {page} de {totalPages}</span>
            <button 
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              style={{ padding: '10px 20px', backgroundColor: page === totalPages ? '#1e293b' : '#3b82f6', color: page === totalPages ? '#64748b' : '#fff', border: 'none', borderRadius: '8px', cursor: page === totalPages ? 'not-allowed' : 'pointer', fontWeight: 600 }}
            >
              Próxima
            </button>
          </div>
        )}
      </main>

      {/* User Details Modal */}
      {selectedUser && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => setSelectedUser(null)}>
          <div style={{ backgroundColor: '#1e293b', borderRadius: '16px', width: '100%', maxWidth: '600px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '24px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#0f172a', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {selectedUser.photoUrl ? <img src={selectedUser.photoUrl} alt="Foto" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <UserIcon size={40} color="#94a3b8" />}
                </div>
                <div>
                  <h2 style={{ margin: '0 0 4px 0', fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {selectedUser.displayName || selectedUser.username || 'Sem Nome'}
                    {selectedUser.isAdmin && <Shield size={20} color="#ef4444" />}
                  </h2>
                  <p style={{ margin: 0, color: '#94a3b8', fontSize: '1rem' }}>{selectedUser.email}</p>
                </div>
              </div>
              <button onClick={() => setSelectedUser(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={24} /></button>
            </div>
            
            <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', marginBottom: '8px' }}><Activity size={18} /> Status da Conta</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 600, color: selectedUser.status === 'ativo' ? '#10b981' : '#ef4444', textTransform: 'capitalize' }}>{selectedUser.status}</div>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', marginBottom: '8px' }}><Calendar size={18} /> Criado em</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#f8fafc' }}>
                  {new Date(selectedUser.createdAt || Date.now()).toLocaleDateString('pt-BR')}
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', marginBottom: '8px' }}><Database size={18} /> ID Banco</div>
                <div style={{ fontSize: '0.9rem', color: '#f8fafc', fontFamily: 'monospace' }}>{selectedUser.id || selectedUser.id}</div>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', marginBottom: '8px' }}><LinkIcon size={18} /> Username</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#f8fafc' }}>@{selectedUser.username || 'N/A'}</div>
              </div>
            </div>
            
            <div style={{ padding: '20px 24px', backgroundColor: '#0f172a', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setSelectedUser(null)} style={{ padding: '10px 24px', backgroundColor: '#334155', color: '#f8fafc', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
