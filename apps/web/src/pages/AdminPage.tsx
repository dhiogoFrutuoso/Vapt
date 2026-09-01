import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, type AuthUser } from '../lib/api';
import { Shield, Search, UserIcon, X, Calendar, Database, LinkIcon, Activity, ArrowLeft } from 'lucide-react';

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
        if (mounted && data) {
          setUsers(data.users || []);
          setTotalPages(data.totalPages || 1);
          setTotalUsers(data.totalUsers || 0);
        }
      } catch (err) {
        console.error('Erro ao buscar usuários (Auth Header ausente ou rota protegida):', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void fetchUsers();
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
    <>
      <header className="dash__top">
        <div className="container dash__top-inner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Shield size={28} style={{ color: 'var(--primary, #3b82f6)' }} />
            <div>
              <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Painel Admin</h1>
              <span style={{ fontSize: '0.9rem', opacity: 0.8 }}>Gestão de clientes e assinaturas</span>
            </div>
          </div>
          <Link to="/painel" className="btn btn--outline" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ArrowLeft size={18} /> Voltar para o Painel
          </Link>
        </div>
      </header>

      <main className="container dash__main">
        {/* Control Bar */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '300px', position: 'relative' }}>
            <Search size={20} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
            <input 
              type="text" 
              placeholder="Buscar por nome ou e-mail..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input"
              style={{ paddingLeft: '48px', width: '100%' }}
            />
          </div>
          
          <select 
            value={isSubscribed} 
            onChange={(e) => { setIsSubscribed(e.target.value); setPage(1); }}
            className="input"
            style={{ minWidth: '200px' }}
          >
            <option value="">Status: Todos</option>
            <option value="true">Ativos</option>
            <option value="false">Suspensos</option>
          </select>

          <select 
            value={plan} 
            onChange={(e) => { setPlan(e.target.value); setPage(1); }}
            className="input"
            style={{ minWidth: '200px' }}
          >
            <option value="">Plano: Todos</option>
            <option value="Delivery">Delivery</option>
            <option value="Salão-Caixa">Salão-Caixa</option>
            <option value="Completo">Completo</option>
          </select>
        </div>

        <p style={{ marginBottom: '16px', opacity: 0.8 }}>Total de usuários: {totalUsers}</p>

        {/* User List */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '64px', opacity: 0.6 }}>Carregando usuários...</div>
        ) : users.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '64px', opacity: 0.8 }}>
            Nenhum usuário encontrado.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
            {users.map(u => (
              <div 
                key={u.id || u.email} 
                onClick={() => setSelectedUser(u)}
                className="card"
                style={{ padding: '20px', display: 'flex', gap: '16px', cursor: 'pointer', transition: 'transform 0.2s', border: '1px solid var(--border)', backgroundColor: 'var(--panel-bg)' }}
              >
                <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: 'var(--bg)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)' }}>
                  {u.photoUrl ? <img src={u.photoUrl} alt="Foto" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <UserIcon size={24} style={{ opacity: 0.5 }} />}
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.displayName || u.username || 'Sem Nome'}</h3>
                    {u.isAdmin && <span style={{ padding: '2px 6px', backgroundColor: 'var(--primary)', color: '#fff', fontSize: '0.65rem', borderRadius: '4px', fontWeight: 800, textTransform: 'uppercase' }}>Admin</span>}
                  </div>
                  <p style={{ margin: 0, fontSize: '0.9rem', opacity: 0.8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</p>
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
              className="btn btn--outline"
              style={{ opacity: page === 1 ? 0.5 : 1, cursor: page === 1 ? 'not-allowed' : 'pointer' }}
            >
              Anterior
            </button>
            <span style={{ opacity: 0.8 }}>Página {page} de {totalPages}</span>
            <button 
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="btn btn--outline"
              style={{ opacity: page === totalPages ? 0.5 : 1, cursor: page === totalPages ? 'not-allowed' : 'pointer' }}
            >
              Próxima
            </button>
          </div>
        )}
      </main>

      {/* User Details Modal */}
      {selectedUser && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => setSelectedUser(null)}>
          <div className="card" style={{ width: '100%', maxWidth: '600px', overflow: 'hidden', padding: 0 }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: 'var(--bg)', border: '1px solid var(--border)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {selectedUser.photoUrl ? <img src={selectedUser.photoUrl} alt="Foto" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <UserIcon size={40} style={{ opacity: 0.5 }} />}
                </div>
                <div>
                  <h2 style={{ margin: '0 0 4px 0', fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {selectedUser.displayName || selectedUser.username || 'Sem Nome'}
                    {selectedUser.isAdmin && <Shield size={20} style={{ color: 'var(--primary)' }} />}
                  </h2>
                  <p style={{ margin: 0, fontSize: '1rem', opacity: 0.8 }}>{selectedUser.email}</p>
                </div>
              </div>
              <button onClick={() => setSelectedUser(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.6 }}><X size={24} /></button>
            </div>
            
            <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.7, marginBottom: '8px' }}><Activity size={18} /> Status da Conta</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 600, color: selectedUser.status === 'ativo' ? '#10b981' : '#ef4444', textTransform: 'capitalize' }}>{selectedUser.status}</div>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.7, marginBottom: '8px' }}><Calendar size={18} /> Criado em</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                  {new Date(selectedUser.createdAt || Date.now()).toLocaleDateString('pt-BR')}
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.7, marginBottom: '8px' }}><Database size={18} /> ID Banco</div>
                <div style={{ fontSize: '0.9rem', fontFamily: 'monospace' }}>{selectedUser.id}</div>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.7, marginBottom: '8px' }}><LinkIcon size={18} /> Username</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>@{selectedUser.username || 'N/A'}</div>
              </div>
            </div>
            
            <div style={{ padding: '20px 24px', backgroundColor: 'var(--bg)', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setSelectedUser(null)} className="btn btn--primary">Fechar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
