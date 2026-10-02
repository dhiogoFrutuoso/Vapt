import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api, type AuthUser } from '../lib/api';
import { SubscriptionBillingPanel } from '../components/SubscriptionBillingPanel';
import { billingDateOf, subscriptionDue } from '../lib/subscriptionDates';
import {
  Shield,
  Search,
  UserIcon,
  X,
  Calendar,
  Database,
  Activity,
  ArrowLeft,
  Phone,
  Key,
  CreditCard,
  Clock,
  Save,
  LogIn,
} from 'lucide-react';

const normalizeString = (str: string | undefined | null) => {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
};

/** Seta customizada dos selects em pílula. Definida fora do componente para não recriar o objeto a cada render. */
const selectArrowStyle: React.CSSProperties = {
  appearance: 'none',
  backgroundImage:
    'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23111111%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")',
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 20px top 50%',
  backgroundSize: '12px auto',
};

type InfoCardProps = {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
};

/** Card de informação do usuário na modal (Status, Telefone, ID etc). Extraído para não repetir a mesma marcação seis vezes. */
function InfoCard({ icon, label, children }: InfoCardProps) {
  return (
    <div className="rounded-2xl bg-cream-100 p-5">
      <div className="mb-2 flex items-center gap-2 text-sm text-ink-500">
        {icon}
        {label}
      </div>
      <div className="text-lg font-bold text-ink-900">{children}</div>
    </div>
  );
}

type UserCardProps = {
  user: AuthUser;
  onSelect: (user: AuthUser) => void;
};

/** Card de usuário na grade principal. */
function UserCard({ user: u, onSelect }: UserCardProps) {
  const isActive = u.status === 'ativo';
  const due = subscriptionDue(u);
  const overdue = due.days !== null && due.days < 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(u)}
      className="group relative flex items-center gap-4 rounded-3xl bg-white p-6 text-left shadow-soft transition duration-200 ease-smooth hover:-translate-y-1 hover:shadow-soft-lg"
    >
      <div className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-cream-100 ${overdue ? 'ring-2 ring-red-500 ring-offset-2' : ''}`}>
        {u.photoUrl ? (
          <img src={u.photoUrl} alt="" className="h-full w-full rounded-full object-cover" />
        ) : (
          <UserIcon size={24} className="text-ink-300" />
        )}
        {overdue && <span aria-label="Assinatura vencida" className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-red-500" />}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <div className="mb-1 flex items-center gap-2">
          <h3 className="truncate text-lg font-bold text-ink-900">
            {u.displayName || u.username || 'Sem Nome'}
          </h3>
          {u.isAdmin && (
            <span className="shrink-0 rounded-full bg-brand-soft px-2 py-1 text-[0.65rem] font-extrabold uppercase text-brand">
              Admin
            </span>
          )}
        </div>
        <p className="truncate text-sm text-ink-500">{u.email}</p>
        {u.plan && <p className={`mt-2 text-xs font-semibold ${overdue ? 'text-red-700' : 'text-ink-500'}`}>{u.plan} · {due.label}</p>}
      </div>

      <div
        className={`absolute right-6 top-6 h-3 w-3 rounded-full ring-4 ${
          isActive && !overdue ? 'bg-emerald-500 ring-emerald-500/20' : 'bg-red-500 ring-red-500/20'
        }`}
        aria-hidden="true"
      />
    </button>
  );
}

export function AdminPage() {
  const navigate = useNavigate();
  const [allUsers, setAllUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Pagination & Filters
  const [page, setPage] = useState(1);
  const limit = 30; // Limite client-side

  const [search, setSearch] = useState('');
  const [isSubscribed, setIsSubscribed] = useState('');
  const [plan, setPlan] = useState('');
  const [expiration, setExpiration] = useState('');

  // Modal
  const [selectedUser, setSelectedUser] = useState<AuthUser | null>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const profileOpen = selectedUser !== null;
  useEffect(() => {
    if (!profileOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    profileRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, [profileOpen]);

  // Modal Form State
  const [formPlan, setFormPlan] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [savingPlan, setSavingPlan] = useState(false);

  // Update form state when user changes
  useEffect(() => {
    if (selectedUser) {
      setFormPlan(selectedUser.plan || '');
      setFormStartDate(selectedUser.planStartDate ? billingDateOf(selectedUser.planStartDate) : '');
      setFormEndDate(selectedUser.planEndDate ? billingDateOf(selectedUser.planEndDate) : '');
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
        const users = [...data.users];
        for (let next = 2; mounted && next <= data.totalPages; next++) {
          users.push(...(await api.getAdminUsers(next, 1000, '', '', '')).users);
        }
        if (mounted && data) {
          setAllUsers(users);
        }
      } catch (err) {
        console.error('Erro ao buscar usuários:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void fetchUsers();
    return () => {
      mounted = false;
    };
  }, []);

  // Real-Time Filtering Algorithm
  const filteredUsers = useMemo(() => {
    const normalizedSearch = normalizeString(search);

    return allUsers.filter((u) => {
      // Substring Matching
      const matchSearch =
        normalizedSearch === '' ||
        normalizeString(u.displayName).includes(normalizedSearch) ||
        normalizeString(u.email).includes(normalizedSearch) ||
        normalizeString(u.username).includes(normalizedSearch);

      // Event-Driven Array Filtering for status
      const matchStatus =
        isSubscribed === '' ||
        (isSubscribed === 'true' && u.status === 'ativo') ||
        (isSubscribed === 'false' && u.status !== 'ativo');

      // Event-Driven Array Filtering for plan
      const matchPlan = plan === '' || (plan === 'Sem plano' ? !u.plan : u.plan === plan);
      const due = subscriptionDue(u).days;
      const matchExpiration = !expiration || (Boolean(u.plan) && (
        expiration === 'all' || (expiration === 'overdue' && due !== null && due < 0) ||
        (expiration === 'soon' && due !== null && due >= 0 && due <= 7) ||
        (expiration === 'valid' && due !== null && due >= 0)));

      return matchSearch && matchStatus && matchPlan && matchExpiration;
    });
  }, [allUsers, search, isSubscribed, plan, expiration]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [search, isSubscribed, plan, expiration]);

  // Client-side pagination
  const totalUsers = filteredUsers.length;
  const totalPages = Math.ceil(totalUsers / limit) || 1;
  const paginatedUsers = filteredUsers.slice((page - 1) * limit, page * limit);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('dialog[open]')) setSelectedUser(null);
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
      setAllUsers((prev) => prev.map((u) => (u.id === selectedUser.id ? response.user : u)));
      setSelectedUser(response.user);
      toast.success('Plano atualizado com sucesso!');
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar o plano.');
    } finally {
      setSavingPlan(false);
    }
  };

  const handleImpersonate = () => {
    if (!selectedUser) return;
    navigate(`/painel?editUserId=${selectedUser.id}&plan=${encodeURIComponent(selectedUser.plan || '')}`);
  };

  return (
    <div className="min-h-screen bg-cream-100 font-sans text-ink-900 antialiased">
      {/* HEADER */}
      <header className="sticky top-0 z-50 border-b border-black/5 bg-white/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-6 py-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-soft">
              <Shield size={24} className="text-brand" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold leading-tight text-ink-900">Painel Admin</h1>
              <p className="text-sm text-ink-500">Gestão de clientes e assinaturas</p>
            </div>
          </div>

          <Link
            to="/painel"
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-ink-900 shadow-soft transition duration-200 ease-smooth hover:-translate-y-0.5 hover:shadow-soft-lg"
          >
            <ArrowLeft size={18} /> Voltar para o Painel
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        {/* CONTROL BAR — empilha no mobile, lado a lado a partir de md */}
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:flex-wrap md:items-center">
          <div className="relative w-full md:min-w-[280px] md:flex-1">
            <Search size={20} className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-ink-300" />
            <input
              type="text"
              placeholder="Buscar por nome ou e-mail..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-full border-none bg-white py-3.5 pl-12 pr-5 text-base text-ink-900 shadow-soft outline-none transition-shadow duration-200 focus:ring-2 focus:ring-brand"
            />
          </div>

          <select
            value={isSubscribed}
            onChange={(e) => setIsSubscribed(e.target.value)}
            style={selectArrowStyle}
            className="w-full cursor-pointer rounded-full border-none bg-white px-5 py-3.5 text-base text-ink-900 shadow-soft outline-none transition-shadow duration-200 focus:ring-2 focus:ring-brand md:w-auto md:min-w-[190px]"
          >
            <option value="">Status: Todos</option>
            <option value="true">Ativos</option>
            <option value="false">Suspensos</option>
          </select>

          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            style={selectArrowStyle}
            className="w-full cursor-pointer rounded-full border-none bg-white px-5 py-3.5 text-base text-ink-900 shadow-soft outline-none transition-shadow duration-200 focus:ring-2 focus:ring-brand md:w-auto md:min-w-[190px]"
          >
            <option value="">Plano: Todos</option>
            <option value="Delivery">Delivery</option>
            <option value="Salão-Caixa">Salão-Caixa</option>
            <option value="Completo">Completo</option>
            <option value="Sem plano">Sem plano</option>
          </select>
          <select aria-label="Vencimentos" value={expiration} onChange={e => setExpiration(e.target.value)} style={selectArrowStyle} className="w-full rounded-full bg-white px-5 py-3.5 pr-12 text-base shadow-soft outline-none focus:ring-2 focus:ring-brand md:w-auto">
            <option value="">Vencimentos: sem filtro</option>
            <option value="all">Todas as assinaturas</option>
            <option value="overdue">Já vencidas</option>
            <option value="soon">Vencem em até 7 dias</option>
            <option value="valid">Dentro do prazo</option>
          </select>
        </div>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-ink-900">Usuários Cadastrados</h2>
          <span className="rounded-full bg-black/5 px-3 py-1 text-sm font-semibold text-ink-500">
            Total: {totalUsers}
          </span>
        </div>

        {/* LISTA — único ponto de bifurcação por estado, sem duplicar cabeçalho/control bar */}
        {loading ? (
          <div className="py-16 text-center text-ink-500">Carregando usuários...</div>
        ) : paginatedUsers.length === 0 ? (
          <div className="rounded-4xl bg-white px-10 py-20 text-center shadow-soft">
            <Search size={48} className="mx-auto mb-4 text-ink-300/60" />
            <h3 className="mb-2 text-lg font-semibold text-ink-900">Nenhum usuário encontrado</h3>
            <p className="text-ink-500">Tente ajustar os filtros de busca para encontrar o que procura.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {paginatedUsers.map((u) => (
              <UserCard key={u.id} user={u} onSelect={setSelectedUser} />
            ))}
          </div>
        )}

        {/* PAGINAÇÃO */}
        {totalPages > 1 && (
          <div className="mt-12 flex items-center justify-center gap-5">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-full bg-white px-6 py-2.5 font-semibold text-ink-900 shadow-soft transition duration-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Anterior
            </button>
            <span className="font-semibold text-ink-500">
              Página {page} de {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded-full bg-white px-6 py-2.5 font-semibold text-ink-900 shadow-soft transition duration-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Próxima
            </button>
          </div>
        )}
      </main>

      {/* MODAL DE DETALHES DO USUÁRIO */}
      {selectedUser && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm sm:p-6"
          onClick={() => setSelectedUser(null)}
        >
          <div
            role="dialog" aria-modal="true" aria-label="Perfil do usuário"
            ref={profileRef}
            onKeyDown={event => {
              if (event.key !== 'Tab' || document.querySelector('dialog[open]')) return;
              const elements = Array.from(profileRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]') || []).filter(el => el.getClientRects().length);
              const first = elements[0], last = elements[elements.length - 1];
              if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
              else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
            }}
            className="relative flex max-h-[85vh] w-[95%] max-w-md flex-col overflow-x-hidden overflow-y-auto rounded-[28px] bg-white shadow-soft-xl md:max-w-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Único botão de fechar, canto superior direito */}
            <button
              type="button"
              onClick={() => setSelectedUser(null)}
              aria-label="Fechar"
              className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-cream-100 text-ink-500 transition duration-200 hover:bg-black/10"
            >
              <X size={20} />
            </button>

            {/* Cabeçalho — estrutura única, empilhada no mobile e lado a lado a partir de md */}
            <div className="flex flex-col items-center gap-5 border-b border-black/5 p-6 text-center md:flex-row md:items-start md:justify-between md:gap-6 md:p-8 md:text-left">
              <div className="flex min-w-0 flex-1 flex-col items-center gap-4 md:flex-row md:items-center">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-cream-100 md:h-[88px] md:w-[88px]">
                  {selectedUser.photoUrl ? (
                    <img src={selectedUser.photoUrl} alt="Foto de perfil do usuário" className="h-full w-full object-cover" />
                  ) : (
                    <UserIcon size={40} className="text-ink-300" />
                  )}
                </div>

                <div className="min-w-0">
                  <h2 className="mb-2 flex flex-wrap items-center justify-center gap-2 text-xl font-extrabold text-ink-900 md:justify-start md:text-2xl">
                    <span className="max-w-full truncate">
                      {selectedUser.displayName || selectedUser.username || 'Sem Nome'}
                    </span>
                    {selectedUser.isAdmin && (
                      <span className="shrink-0 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-extrabold uppercase text-brand">
                        Admin
                      </span>
                    )}
                  </h2>
                  <p className="truncate text-base text-ink-500 md:text-lg">{selectedUser.email}</p>
                </div>
              </div>

              <div className="flex w-full shrink-0 justify-center md:w-auto md:justify-end">
                <button
                  type="button"
                  onClick={handleImpersonate}
                  className="inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-full bg-brand px-6 py-3 text-sm font-bold text-white shadow-brand transition duration-200 ease-smooth hover:-translate-y-0.5 hover:brightness-110 hover:shadow-brand-lg md:w-auto"
                >
                  <LogIn size={18} /> Acessar Painel
                </button>
              </div>
            </div>

            {/* Corpo — grid de informações + gestão de assinatura */}
            <div className="p-5 md:p-8">
              <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2">
                <InfoCard icon={<Activity size={18} />} label="Status da Conta">
                  <div className="flex items-center gap-2">
                    <div
                      className={`h-2.5 w-2.5 rounded-full ${
                        selectedUser.status === 'ativo' ? 'bg-emerald-500' : 'bg-red-500'
                      }`}
                    />
                    <span className="capitalize">{selectedUser.status || 'Desconhecido'}</span>
                  </div>
                </InfoCard>

                <InfoCard icon={<Key size={18} />} label="Tipo de Permissão">
                  {selectedUser.isAdmin ? 'Administrador' : 'Proprietário/Lojista'}
                </InfoCard>

                <InfoCard icon={<Phone size={18} />} label="Telefone / WhatsApp">
                  {selectedUser.phone || 'Não informado'}
                </InfoCard>

                <InfoCard icon={<Clock size={18} />} label="Último Login">
                  {selectedUser.lastLoginAt ? new Date(selectedUser.lastLoginAt).toLocaleDateString('pt-BR') : 'Nunca logou'}
                </InfoCard>

                <InfoCard icon={<Calendar size={18} />} label="Cadastrado em">
                  {new Date(selectedUser.createdAt || Date.now()).toLocaleDateString('pt-BR')}
                </InfoCard>

                <InfoCard icon={<Database size={18} />} label="ID no Banco">
                  <span className="break-all font-mono text-base">{selectedUser.id}</span>
                </InfoCard>
              </div>

              <div className="rounded-3xl bg-white p-6 shadow-soft ring-1 ring-black/5">
                <h3 className="mb-5 flex items-center gap-2 text-lg font-bold text-ink-900">
                  <CreditCard size={20} className="text-brand" /> Gerenciar Assinatura
                </h3>

                <div className="mb-6 grid grid-cols-1 gap-5">
                  <div>
                    <label htmlFor="subscription-plan" className="mb-2 block text-sm font-semibold text-ink-700">Plano Ativo</label>
                    <select
                      id="subscription-plan"
                      value={formPlan}
                      onChange={(e) => setFormPlan(e.target.value)}
                      className="w-full cursor-pointer rounded-xl border border-black/10 bg-cream-100 px-4 py-3.5 text-base text-ink-900 outline-none transition-shadow duration-200 focus:ring-2 focus:ring-brand"
                    >
                      <option value="">Sem plano</option>
                      <option value="Delivery">Delivery</option>
                      <option value="Salão-Caixa">Salão-Caixa</option>
                      <option value="Completo">Completo</option>
                    </select>
                  </div>

                  {formPlan && formPlan !== 'Sem plano' && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="subscription-start" className="mb-2 block text-sm font-semibold text-ink-700">Data de Início</label>
                        <input
                          id="subscription-start"
                          type="date"
                          value={formStartDate}
                          onChange={(e) => setFormStartDate(e.target.value)}
                          className="w-full min-w-0 rounded-xl border border-black/10 bg-cream-100 px-4 py-3.5 text-base text-ink-900 outline-none transition-shadow duration-200 focus:ring-2 focus:ring-brand"
                        />
                      </div>
                      <div>
                        <label htmlFor="subscription-end" className="mb-2 block text-sm font-semibold text-ink-700">Data de Fim (Prazo)</label>
                        <input
                          id="subscription-end"
                          type="date"
                          value={formEndDate}
                          onChange={(e) => setFormEndDate(e.target.value)}
                          className="w-full min-w-0 rounded-xl border border-black/10 bg-cream-100 px-4 py-3.5 text-base text-ink-900 outline-none transition-shadow duration-200 focus:ring-2 focus:ring-brand"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSavePlan}
                    disabled={savingPlan}
                    className="inline-flex items-center gap-2 rounded-full bg-brand px-8 py-3.5 text-base font-bold text-white shadow-brand transition duration-200 ease-smooth hover:-translate-y-0.5 hover:brightness-110 hover:shadow-brand-lg disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {savingPlan ? (
                      'Salvando...'
                    ) : (
                      <>
                        <Save size={18} /> Salvar Alterações
                      </>
                    )}
                  </button>
                </div>
              </div>
              <SubscriptionBillingPanel key={selectedUser.id} user={selectedUser} onUpdate={updated => {
                setAllUsers(current => current.map(u => u.id === updated.id ? updated : u));
                setSelectedUser(updated);
              }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
