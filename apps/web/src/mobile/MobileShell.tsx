import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Bike,
  ChefHat,
  ConciergeBell,
  LogOut,
  User as UserIcon,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react';
import { useDeviceAuth } from './DeviceAuthContext';
import { OnboardingScreen } from './OnboardingScreen';
import { PreferencesPanel } from './PreferencesPanel';
import { usePreferences } from './PreferencesContext';
import type { Chave as ChaveTexto } from './i18n';

/**
 * Casca do app depois do login.
 *
 * O RBAC é de fachada aqui, e de verdade na API: esconder a aba evita o erro
 * honesto de quem tocaria no lugar errado, mas quem forjar a requisição
 * esbarra no `requirePermission` do servidor.
 *
 * DOIS LAYOUTS, UM COMPONENTE
 * ---------------------------
 * O mesmo código roda no celular do garçom e no monitor do caixa. Abaixo de
 * `md`, a navegação é a barra inferior — o polegar alcança o rodapé, não o
 * topo. De `md` para cima ela vira uma COLUNA LATERAL fixa: num monitor de
 * 1280px, uma barra de abas colada no rodapé obriga o olho a percorrer a tela
 * inteira para trocar de área, e ainda desperdiça a largura toda.
 *
 * A escolha é por LARGURA, não por plataforma. Um tablet deitado na cozinha
 * ganha a coluna lateral; a janela do Electron reduzida volta para a barra
 * inferior sozinha. Detectar "é Electron?" erraria nos dois casos.
 *
 * As cores escuras vêm de `dark:`, ligado pela classe `dark` que as
 * preferências do funcionário põem no `<html>`. A cor da MARCA fica de fora
 * disso de propósito: ela é do restaurante e não muda com o tema — o que muda
 * é o fundo sobre o qual ela aparece.
 */

/** Ordem fixa: é o fluxo do pedido, do cliente até a entrega. */
const ABAS = [
  { chave: 'cliente', texto: 'abas.cliente', Icone: UserIcon },
  { chave: 'recepcao', texto: 'abas.recepcao', Icone: ConciergeBell },
  { chave: 'salao', texto: 'abas.salao', Icone: UtensilsCrossed },
  { chave: 'cozinha', texto: 'abas.cozinha', Icone: ChefHat },
  { chave: 'caixa', texto: 'abas.caixa', Icone: Wallet },
  { chave: 'entregador', texto: 'abas.entregador', Icone: Bike },
] as const satisfies ReadonlyArray<{ chave: string; texto: ChaveTexto; Icone: typeof Bike }>;

type Chave = (typeof ABAS)[number]['chave'] | 'perfil';

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

const CARTAO =
  'rounded-3xl bg-white shadow-[0_10px_30px_-4px_rgba(17,17,17,0.06)] ' +
  'dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-white/10';

export function MobileShell() {
  const { employee, branding, logout } = useDeviceAuth();
  const { idioma, t } = usePreferences();
  const [editando, setEditando] = useState(false);
  const [saindo, setSaindo] = useState(false);

  /** Só as abas da função. Uma função sem permissões cai direto no perfil. */
  const visiveis = useMemo(
    () => ABAS.filter((aba) => employee?.permissions.includes(aba.chave)),
    [employee?.permissions]
  );

  const [ativa, setAtiva] = useState<Chave>(() => visiveis[0]?.chave ?? 'perfil');

  if (!employee) return null;

  const marca = branding.primaryColor;
  const abaAtual = ABAS.find((a) => a.chave === ativa);

  async function handleLogout() {
    setSaindo(true);
    try {
      await logout();
      toast.success(t('perfil.saiu'));
    } finally {
      setSaindo(false);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Perfil                                                              */
  /* ------------------------------------------------------------------ */

  function renderPerfil() {
    if (editando) {
      return (
        <OnboardingScreen
          modo="edicao"
          onDone={() => setEditando(false)}
          onCancel={() => setEditando(false)}
        />
      );
    }

    return (
      /*
       * `max-w-2xl` no desktop: um cartão de perfil esticado por 1280px vira
       * uma faixa com o rótulo numa ponta e o valor na outra, ilegível.
       */
      <section className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <div className={`${CARTAO} p-6 text-center`}>
          <div
            className="mx-auto flex h-20 w-20 items-center justify-center overflow-hidden rounded-full"
            style={{ backgroundColor: `${marca}1A` }}
          >
            {employee!.profile.photoUrl ? (
              <img src={employee!.profile.photoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-2xl font-extrabold" style={{ color: marca }}>
                {iniciais(employee!.name)}
              </span>
            )}
          </div>

          <h1 className="m-0 mt-4 text-xl font-extrabold text-gray-900 dark:text-gray-50">
            {employee!.name}
          </h1>
          <p className="m-0 mt-1 text-sm text-gray-500 dark:text-gray-400">{employee!.role}</p>
        </div>

        <div className={`${CARTAO} p-5`}>
          <h2 className="m-0 mb-4 text-base font-extrabold text-gray-900 dark:text-gray-50">
            {t('perfil.dados')}
          </h2>

          <dl className="m-0 flex flex-col gap-3 text-[0.95rem]">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-gray-500 dark:text-gray-400">{t('perfil.telefone')}</dt>
              <dd className="m-0 font-semibold text-gray-900 dark:text-gray-100">
                {employee!.profile.phone || '—'}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-gray-500 dark:text-gray-400">{t('perfil.cpf')}</dt>
              <dd className="m-0 font-semibold text-gray-900 dark:text-gray-100">
                {employee!.profile.cpf
                  ? employee!.profile.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
                  : '—'}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-gray-500 dark:text-gray-400">{t('perfil.nascimento')}</dt>
              <dd className="m-0 font-semibold text-gray-900 dark:text-gray-100">
                {employee!.profile.birthDate
                  ? new Date(employee!.profile.birthDate).toLocaleDateString(idioma)
                  : '—'}
              </dd>
            </div>
          </dl>

          <button
            type="button"
            onClick={() => setEditando(true)}
            className="mt-5 w-full rounded-full px-5 py-3 text-[0.95rem] font-bold text-white"
            style={{ backgroundColor: marca }}
          >
            {t('perfil.editar')}
          </button>
        </div>

        <PreferencesPanel marca={marca} />

        <button
          type="button"
          onClick={() => void handleLogout()}
          disabled={saindo}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-solid
            border-red-200 bg-white px-6 py-3.5 text-[0.95rem] font-bold text-red-600
            disabled:opacity-55
            dark:border-red-500/30 dark:bg-gray-900 dark:text-red-400"
        >
          <LogOut size={16} />
          {saindo ? t('perfil.saindo') : t('perfil.sair')}
        </button>
      </section>
    );
  }

  /* ------------------------------------------------------------------ */
  /* Casca                                                               */
  /* ------------------------------------------------------------------ */

  return (
    <div
      className="flex h-[100dvh] overflow-hidden bg-[#FAF8F5] dark:bg-gray-950"
      style={{ ['--marca' as string]: marca }}
    >
      {/* --------------------- Coluna lateral (md+) --------------------- */}
      {visiveis.length > 0 && (
        <nav
          className="hidden w-[15rem] shrink-0 flex-col gap-1 border-0 border-r border-solid
            border-gray-200 bg-white p-3 md:flex
            dark:border-white/10 dark:bg-gray-900"
          aria-label={t('nav.areas')}
        >
          <div className="mb-2 flex items-center gap-2.5 px-2 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl">
              {branding.logoUrl ? (
                <img
                  src={branding.logoUrl}
                  alt={branding.storeName}
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span
                  className="flex h-full w-full items-center justify-center rounded-xl text-xs font-extrabold text-white"
                  style={{ backgroundColor: marca }}
                >
                  {iniciais(branding.storeName)}
                </span>
              )}
            </div>
            <strong className="min-w-0 truncate text-[0.95rem] font-extrabold text-gray-900 dark:text-gray-50">
              {branding.storeName}
            </strong>
          </div>

          {visiveis.map(({ chave, texto, Icone }) => {
            const selecionada = ativa === chave;
            return (
              <button
                key={chave}
                type="button"
                onClick={() => setAtiva(chave)}
                aria-current={selecionada ? 'page' : undefined}
                className="flex items-center gap-3 rounded-xl border-0 px-3 py-2.5 text-left text-[0.9rem] font-semibold transition-colors"
                style={
                  selecionada
                    ? { backgroundColor: `${marca}1A`, color: marca }
                    : { backgroundColor: 'transparent', color: '#6B7280' }
                }
              >
                <Icone size={18} className="shrink-0" />
                <span className="truncate">{t(texto)}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setAtiva('perfil')}
            aria-current={ativa === 'perfil' ? 'page' : undefined}
            className="mt-auto flex items-center gap-3 rounded-xl border-0 px-3 py-2.5 text-left text-[0.9rem] font-semibold transition-colors"
            style={
              ativa === 'perfil'
                ? { backgroundColor: `${marca}1A`, color: marca }
                : { backgroundColor: 'transparent', color: '#6B7280' }
            }
          >
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-extrabold text-white"
              style={{ backgroundColor: marca }}
            >
              {iniciais(employee.name)}
            </span>
            <span className="min-w-0 truncate">{employee.name}</span>
          </button>
        </nav>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* ---------------------- Cabeçalho (só mobile) --------------------- */}
        <header
          className="flex shrink-0 items-center gap-3 px-4 py-3 md:hidden"
          style={{ backgroundColor: marca, paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/90">
            {branding.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt={branding.storeName}
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="text-sm font-extrabold" style={{ color: marca }}>
                {iniciais(branding.storeName)}
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <strong className="block truncate text-[0.95rem] font-extrabold text-white">
              {branding.storeName}
            </strong>
            <span className="block truncate text-xs text-white/80">
              {employee.name} · {employee.role}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setAtiva('perfil')}
            aria-label={t('perfil.titulo')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-extrabold text-white"
          >
            {iniciais(employee.name)}
          </button>
        </header>

        {/* ------------------ Barra de título (só desktop) ------------------ */}
        <header className="hidden shrink-0 items-center gap-3 border-0 border-b border-solid border-gray-200 bg-white px-6 py-4 md:flex dark:border-white/10 dark:bg-gray-900">
          <h1 className="m-0 text-lg font-extrabold text-gray-900 dark:text-gray-50">
            {ativa === 'perfil' ? t('perfil.titulo') : abaAtual ? t(abaAtual.texto) : ''}
          </h1>
          <span className="ml-auto truncate text-sm text-gray-500 dark:text-gray-400">
            {employee.role}
          </span>
        </header>

        {/* ------------------------------ Conteúdo ---------------------------- */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-4 md:px-6">
          {ativa === 'perfil' ? (
            renderPerfil()
          ) : (
            <section className="flex min-h-full flex-col items-center justify-center py-16 text-center">
              <div
                className="flex h-16 w-16 items-center justify-center rounded-2xl"
                style={{ backgroundColor: `${marca}1A` }}
              >
                {abaAtual ? <abaAtual.Icone size={26} style={{ color: marca }} /> : null}
              </div>

              <h2 className="m-0 mt-4 text-lg font-extrabold text-gray-900 dark:text-gray-50">
                {abaAtual ? t(abaAtual.texto) : ''}
              </h2>
              <p className="m-0 mt-2 max-w-xs text-[0.95rem] leading-relaxed text-gray-500 dark:text-gray-400">
                {t('abas.aviso')}
              </p>
            </section>
          )}
        </div>

        {/* ------------------- Barra inferior (só mobile) ------------------- */}
        {visiveis.length > 0 && (
          <nav
            className="grid shrink-0 border-0 border-t border-solid border-gray-200 bg-white md:hidden
              dark:border-white/10 dark:bg-gray-900"
            style={{
              gridTemplateColumns: `repeat(${visiveis.length}, minmax(0, 1fr))`,
              paddingBottom: 'env(safe-area-inset-bottom)',
            }}
            aria-label={t('nav.areas')}
          >
            {visiveis.map(({ chave, texto, Icone }) => {
              const selecionada = ativa === chave;
              return (
                <button
                  key={chave}
                  type="button"
                  onClick={() => setAtiva(chave)}
                  aria-current={selecionada ? 'page' : undefined}
                  className="flex min-w-0 flex-col items-center justify-center gap-1 bg-transparent px-1 py-2.5"
                  /* Inativo em cinza sólido, não em opacidade: o funcionário lê
                     a barra de relance, com o aparelho apoiado no balcão. */
                  style={{ color: selecionada ? marca : '#9CA3AF' }}
                >
                  <Icone size={20} />
                  <span className="truncate text-[10px] font-semibold leading-none">{t(texto)}</span>
                </button>
              );
            })}
          </nav>
        )}
      </div>
    </div>
  );
}
