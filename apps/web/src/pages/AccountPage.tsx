import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, LogOut, ShieldCheck, User as UserIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../lib/api';

/**
 * /painel/conta — dados de acesso do lojista.
 *
 * Tres blocos independentes, cada um com o proprio estado de envio: salvar o
 * telefone nao deve travar o formulario de senha, nem o contrario.
 *
 * O card de seguranca so aparece quando a conta TEM senha (`hasPassword`, um
 * booleano derivado na API — o hash nunca sai de la). Quem entra so pelo
 * Google nao tem senha atual para informar, entao o formulario nao faria
 * sentido: pediria um dado que nao existe e erraria como "senha incorreta".
 */

/** "Dhiogo Frutuoso" -> "DF". Fallback quando nao ha foto nenhuma. */
function initials(name: string, email: string): string {
  const source = name.trim() || email.split('@')[0] || '?';
  const parts = source.split(/[\s._-]+/).filter(Boolean);

  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Aplica a máscara (11) 99999-9999 conforme o usuário digita. */
function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

const CARD = 'rounded-3xl bg-white p-6 shadow-[0_10px_30px_-4px_rgba(17,17,17,0.06)] md:p-8';
const LABEL = 'mb-1.5 block text-sm font-semibold text-gray-700';
const INPUT =
  'w-full rounded-2xl border border-solid border-gray-200 bg-white px-4 py-3 text-[0.95rem] ' +
  'text-gray-900 outline-none transition-colors placeholder:text-gray-400 ' +
  'focus:border-[#F95D2A] disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400';
const PILL_PRIMARY =
  'inline-flex items-center justify-center gap-2 rounded-full bg-[#F95D2A] px-6 py-3 text-[0.95rem] ' +
  'font-bold text-white transition-colors hover:bg-[#FF7A4D] disabled:cursor-not-allowed disabled:opacity-55';

export function AccountPage() {
  const { user, logout, refresh } = useAuth();
  const navigate = useNavigate();

  /* ---------------------------- Dados pessoais --------------------------- */
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});

  /* ------------------------------- Segurança ----------------------------- */
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});

  const [leaving, setLeaving] = useState(false);

  /* O contexto carrega a sessão de forma assíncrona: sincronizamos quando chega. */
  useEffect(() => {
    if (!user) return;
    setDisplayName(user.displayName ?? '');
    setPhone(user.phone ?? '');
  }, [user]);

  const isGoogleAccount = user?.authProvider === 'google' || user?.authProvider === 'both';
  /* Sem senha, o card de segurança não tem o que perguntar. */
  const canChangePassword = user?.hasPassword !== false;
  /* E-mail é a chave da conta no Google: editá-lo aqui quebraria o vínculo. */
  const emailLocked = user?.authProvider === 'google' || user?.authProvider === 'both';

  const avatar = user?.photoUrl || user?.avatarUrl || null;
  const fallback = useMemo(
    () => initials(user?.displayName ?? '', user?.email ?? ''),
    [user?.displayName, user?.email]
  );

  async function handleSaveProfile(event: FormEvent) {
    event.preventDefault();
    setProfileErrors({});

    if (displayName.trim().length < 2) {
      setProfileErrors({ displayName: 'Informe seu nome completo.' });
      return;
    }

    setSavingProfile(true);
    try {
      await api.updateMe({ displayName: displayName.trim(), phone: phone.trim() });
      await refresh();
      toast.success('Dados atualizados.');
    } catch (error) {
      if (error instanceof ApiError) {
        setProfileErrors(error.fieldErrors());
        toast.error(error.message);
      } else {
        toast.error('Não conseguimos salvar agora. Tente novamente.');
      }
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleUpdatePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordErrors({});

    const errors: Record<string, string> = {};
    if (!currentPassword) errors.currentPassword = 'Informe sua senha atual.';
    if (newPassword.length < 8) errors.newPassword = 'A nova senha precisa de ao menos 8 caracteres.';
    // Confere antes de sair da tela: erro de digitação não vira ida ao servidor.
    if (newPassword !== confirmPassword) errors.confirmPassword = 'As senhas não coincidem.';

    if (Object.keys(errors).length > 0) {
      setPasswordErrors(errors);
      return;
    }

    setSavingPassword(true);
    try {
      await api.updatePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Senha atualizada.');
    } catch (error) {
      if (error instanceof ApiError) {
        setPasswordErrors(error.fieldErrors());
        toast.error(error.message);
      } else {
        toast.error('Não conseguimos atualizar a senha. Tente novamente.');
      }
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleLogout() {
    setLeaving(true);
    try {
      await logout();
    } finally {
      // Mesmo se a chamada falhar, o contexto já limpou a sessão local.
      navigate('/login', { replace: true });
    }
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-[#FAF8F5] px-4 py-10">
        <div className="mx-auto max-w-2xl">
          <div className={CARD}>
            <p className="text-gray-500">Carregando sua conta...</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FAF8F5] px-4 py-8 md:py-12">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
        <Link
          to="/painel"
          className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-gray-500 no-underline transition-colors hover:text-gray-900"
        >
          <ArrowLeft size={16} />
          Voltar ao painel
        </Link>

        {/* ------------------------ Cabeçalho e avatar ----------------------- */}
        <header className={`${CARD} flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left`}>
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#FFF0EC]">
            {avatar ? (
              <img
                src={avatar}
                alt={`Foto de ${user.displayName || user.email}`}
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="text-2xl font-extrabold text-[#F95D2A]">{fallback}</span>
            )}
          </div>

          <div className="min-w-0">
            <h1 className="m-0 text-2xl font-extrabold text-gray-900">Minha Conta</h1>
            <p className="m-0 mt-1 break-words text-[0.95rem] text-gray-500">{user.email}</p>
            {isGoogleAccount && (
              <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600">
                <ShieldCheck size={13} />
                Conectada ao Google
              </span>
            )}
          </div>
        </header>

        {/* -------------------------- Dados pessoais ------------------------- */}
        <section className={CARD}>
          <div className="mb-5 flex items-center gap-2">
            <UserIcon size={18} className="text-[#F95D2A]" />
            <h2 className="m-0 text-lg font-extrabold text-gray-900">Dados pessoais</h2>
          </div>

          <form className="flex flex-col gap-4" onSubmit={handleSaveProfile} noValidate>
            <div>
              <label className={LABEL} htmlFor="account-name">
                Nome completo
              </label>
              <input
                id="account-name"
                type="text"
                className={INPUT}
                value={displayName}
                placeholder="Seu nome"
                autoComplete="name"
                onChange={(event) => setDisplayName(event.target.value)}
              />
              {profileErrors.displayName && (
                <small className="mt-1.5 block text-sm text-red-600">{profileErrors.displayName}</small>
              )}
            </div>

            <div>
              <label className={LABEL} htmlFor="account-email">
                E-mail
              </label>
              <input
                id="account-email"
                type="email"
                className={INPUT}
                value={user.email}
                readOnly
                disabled={emailLocked}
              />
              <small className="mt-1.5 block text-sm text-gray-400">
                {emailLocked
                  ? 'Definido pela sua conta Google e usado para identificar o acesso.'
                  : 'Para trocar o e-mail, fale com o suporte.'}
              </small>
            </div>

            <div>
              <label className={LABEL} htmlFor="account-phone">
                Telefone
              </label>
              <input
                id="account-phone"
                type="tel"
                inputMode="tel"
                className={INPUT}
                value={phone}
                placeholder="(11) 99999-9999"
                autoComplete="tel"
                onChange={(event) => setPhone(maskPhone(event.target.value))}
              />
              {profileErrors.phone && (
                <small className="mt-1.5 block text-sm text-red-600">{profileErrors.phone}</small>
              )}
            </div>

            <div className="mt-1 flex justify-end">
              <button type="submit" className={PILL_PRIMARY} disabled={savingProfile}>
                {savingProfile ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </form>
        </section>

        {/* ---------------------------- Segurança ---------------------------- */}
        {canChangePassword && (
          <section className={CARD}>
            <div className="mb-5 flex items-center gap-2">
              <ShieldCheck size={18} className="text-[#F95D2A]" />
              <h2 className="m-0 text-lg font-extrabold text-gray-900">Segurança</h2>
            </div>

            <form className="flex flex-col gap-4" onSubmit={handleUpdatePassword} noValidate>
              <div>
                <label className={LABEL} htmlFor="account-current-password">
                  Senha atual
                </label>
                <input
                  id="account-current-password"
                  type="password"
                  className={INPUT}
                  value={currentPassword}
                  autoComplete="current-password"
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
                {passwordErrors.currentPassword && (
                  <small className="mt-1.5 block text-sm text-red-600">{passwordErrors.currentPassword}</small>
                )}
              </div>

              <div>
                <label className={LABEL} htmlFor="account-new-password">
                  Nova senha
                </label>
                <input
                  id="account-new-password"
                  type="password"
                  className={INPUT}
                  value={newPassword}
                  placeholder="Mínimo de 8 caracteres"
                  autoComplete="new-password"
                  onChange={(event) => setNewPassword(event.target.value)}
                />
                {passwordErrors.newPassword && (
                  <small className="mt-1.5 block text-sm text-red-600">{passwordErrors.newPassword}</small>
                )}
              </div>

              <div>
                <label className={LABEL} htmlFor="account-confirm-password">
                  Confirmar nova senha
                </label>
                <input
                  id="account-confirm-password"
                  type="password"
                  className={INPUT}
                  value={confirmPassword}
                  autoComplete="new-password"
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
                {passwordErrors.confirmPassword && (
                  <small className="mt-1.5 block text-sm text-red-600">{passwordErrors.confirmPassword}</small>
                )}
              </div>

              <div className="mt-1 flex justify-end">
                <button type="submit" className={PILL_PRIMARY} disabled={savingPassword}>
                  {savingPassword ? 'Atualizando...' : 'Atualizar Senha'}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* -------------------------- Ações da conta ------------------------- */}
        <section className={CARD}>
          <h2 className="m-0 text-lg font-extrabold text-gray-900">Ações da conta</h2>
          <p className="m-0 mt-1.5 text-[0.95rem] text-gray-500">
            Encerra a sessão neste dispositivo. Seus dados e aplicativos continuam salvos.
          </p>

          <button
            type="button"
            onClick={handleLogout}
            disabled={leaving}
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-full border border-solid
              border-red-200 bg-white px-6 py-3 text-[0.95rem] font-bold text-red-600 transition-colors
              hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-55"
          >
            <LogOut size={16} />
            {leaving ? 'Saindo...' : 'Sair da Conta'}
          </button>
        </section>
      </div>
    </main>
  );
}
