import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Bike,
  ChefHat,
  ConciergeBell,
  LogOut,
  RefreshCw,
  ShieldCheck,
  User as UserIcon,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react';
import { useDeviceAuth } from './DeviceAuthContext';
import { OnboardingScreen } from './OnboardingScreen';
import { PreferencesPanel } from './PreferencesPanel';
import { usePreferences } from './PreferencesContext';
import { temaEfetivo } from './preferences';
import type { Chave as ChaveTexto } from './i18n';
import { AppViews } from './AppViews';
import { useOperation } from './useOperation';
import { useMenu } from './useMenu';

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
  { chave: 'administracao', texto: 'abas.administracao', Icone: ShieldCheck },
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
  const { employee, branding, appId, accessToken, logout } = useDeviceAuth();
  const { idioma, tema, escala, t } = usePreferences();
  const [editando, setEditando] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const bottomNavRef = useRef<HTMLElement>(null);

  /*
   * Operação e cardápio vêm do servidor.
   *
   * Os dois hooks ficam AQUI, na casca, e não dentro de cada aba: assim o
   * estado sobrevive à troca de aba. Buscando dentro da aba, sair do Caixa e
   * voltar recarregaria o turno inteiro do zero — e no meio de um fechamento
   * isso apaga a tela na frente de quem está conferindo o dinheiro.
   */
  /*
   * Kill-switch: o painel bloqueou ou excluiu este funcionário.
   *
   * O `logout` já limpa o token do armazenamento seguro e devolve a tela de
   * código. Reaproveitá-lo evita uma segunda porta de saída para manter em
   * sincronia com a primeira.
   */
  const aoRevogar = useCallback(async () => {
    await logout();
    toast.error('Seu acesso foi encerrado pelo responsável do restaurante.', { duration: 8000 });
  }, [logout]);

  const { estado, carregando: carregandoOperacao, erro, recarregar, executar } = useOperation(
    appId,
    accessToken,
    employee?.id ?? null,
    aoRevogar
  );
  const { menu, recarregar: recarregarMenu } = useMenu(accessToken, appId);

  const [atualizando, setAtualizando] = useState(false);

  /**
   * Atualização manual.
   *
   * O tempo real cai — wi-fi de restaurante, serverless sem socket, celular
   * saindo do modo avião. Sem um botão, o funcionário fica olhando uma tela
   * velha sem saber que ela é velha, e a saída dele seria fechar e reabrir o
   * aplicativo no meio de uma venda.
   */
  async function atualizarAgora() {
    setAtualizando(true);
    try {
      await recarregar();
    } finally {
      /* Meio segundo de giro mesmo quando volta instantâneo: sem isso o
         ícone pisca e o toque parece não ter funcionado. */
      window.setTimeout(() => setAtualizando(false), 500);
    }
  }

  /** Só as abas da função. Uma função sem permissões cai direto no perfil. */
  const visiveis = useMemo(
    () => ABAS.filter((aba) =>
      employee?.permissions.includes('administracao') || employee?.permissions.includes(aba.chave)
    ),
    [employee?.permissions]
  );

  const [ativa, setAtiva] = useState<Chave>(() => visiveis[0]?.chave ?? 'perfil');

  /* Guard de rota também no cliente: revogação de tag nunca deixa uma aba
     antiga renderizada enquanto a nova sessão é propagada. */
  useEffect(() => {
    if (ativa === 'perfil' || visiveis.some((aba) => aba.chave === ativa)) return;
    setAtiva(visiveis[0]?.chave ?? 'perfil');
    toast('Seu acesso a essa área foi atualizado.');
  }, [ativa, visiveis]);

  /* Barras fixas saem do fluxo. Reservar a altura real (inclusive safe area e
     escala do funcionário) evita que o primeiro e o último card fiquem atrás
     delas. ResizeObserver cobre mudança de orientação e de preferência. */
  useLayoutEffect(() => {
    const shell = shellRef.current;
    const header = headerRef.current;
    if (!shell || !header) return;

    const medir = () => {
      shell.style.setProperty('--mobile-header-height', `${header.offsetHeight}px`);
      shell.style.setProperty('--mobile-nav-height', `${bottomNavRef.current?.offsetHeight ?? 0}px`);
    };

    medir();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null;
    observer?.observe(header);
    if (bottomNavRef.current) observer?.observe(bottomNavRef.current);
    window.addEventListener('resize', medir);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', medir);
    };
  }, [employee?.id, visiveis.length, escala]);

  if (!employee) return null;

  /*
   * A marca fresca do `/device/menu` vence a do login.
   *
   * O `DeviceAuthContext` guarda o branding junto da sessão, e essa cópia
   * envelhece: o dono troca a cor no painel e o app continua com a antiga até
   * o próximo login — que dura 30 dias. O resultado visível era pior que a
   * cor velha: cabeçalho de uma cor e telas de outra, porque só o conteúdo
   * lia o valor novo.
   */
  const marca = menu.branding.primaryColor || branding.primaryColor;
  const temaDaInterface = temaEfetivo(tema);
  const abaAtual = ABAS.find((a) => a.chave === ativa);
  const rolagemInterna = ativa === 'caixa' || ativa === 'entregador';

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
      ref={shellRef}
      className="mobile-shell flex overflow-hidden bg-[#FAF8F5] dark:bg-gray-950"
      style={{ ['--marca' as string]: marca }}
    >
      {/* --------------------- Coluna lateral (md+) --------------------- */}
      {visiveis.length > 0 && (
        <nav
          className="mobile-shell__sidebar hidden w-[15rem] shrink-0 flex-col gap-1 border-0 border-r border-solid
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
          ref={headerRef}
          className="mobile-shell__header fixed inset-x-0 top-0 z-50 flex items-center gap-3 px-4 py-3 md:hidden"
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
            onClick={() => void atualizarAgora()}
            disabled={atualizando}
            aria-label={t('acao.atualizar')}
            title={t('acao.atualizar')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-white disabled:opacity-60"
          >
            <RefreshCw size={16} className={atualizando ? 'animate-spin' : undefined} />
          </button>

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
        <header className="mobile-shell__desktop-header hidden shrink-0 items-center gap-3 border-0 border-b border-solid border-gray-200 bg-white px-6 py-4 md:flex dark:border-white/10 dark:bg-gray-900">
          <h1 className="m-0 text-lg font-extrabold text-gray-900 dark:text-gray-50">
            {ativa === 'perfil' ? t('perfil.titulo') : abaAtual ? t(abaAtual.texto) : ''}
          </h1>
          <span className="ml-auto truncate text-sm text-gray-500 dark:text-gray-400">
            {employee.role}
          </span>

          <button
            type="button"
            onClick={() => void atualizarAgora()}
            disabled={atualizando}
            title={t('acao.atualizar')}
            className="ml-3 inline-flex shrink-0 items-center gap-2 rounded-full border border-solid
              border-gray-200 bg-white px-3 py-1.5 text-[0.8rem] font-semibold text-gray-600
              disabled:opacity-60 dark:border-white/10 dark:bg-gray-800 dark:text-gray-300"
          >
            <RefreshCw size={14} className={atualizando ? 'animate-spin' : undefined} />
            {t('acao.atualizar')}
          </button>
        </header>

        {/* ------------------------------ Conteúdo ---------------------------- */}
        <div className={`mobile-shell__content min-h-0 flex-1 px-4 pb-4 pt-4 md:px-6 md:pb-6 ${rolagemInterna ? 'overflow-hidden' : 'overflow-x-hidden overflow-y-auto'}`}>
          {ativa === 'perfil' ? (
            renderPerfil()
          ) : carregandoOperacao ? (
            <section className="flex min-h-full items-center justify-center py-16">
              <p className="m-0 text-sm font-semibold text-gray-400">{t('operacao.carregando')}</p>
            </section>
          ) : erro ? (
            <section className="flex min-h-full flex-col items-center justify-center gap-4 py-16 text-center">
              <p className="m-0 max-w-xs text-[0.95rem] leading-relaxed text-gray-500 dark:text-gray-400">
                {erro}
              </p>
              <button
                type="button"
                onClick={() => void recarregar()}
                className="rounded-full px-6 py-3 text-[0.9rem] font-bold text-white"
                style={{ backgroundColor: marca }}
              >
                {t('operacao.tentar')}
              </button>
            </section>
          ) : (
            /*
             * `editor-preview` e `theme-*` são as classes que o CSS dos
             * componentes espera — os mesmos arquivos que vestem o simulador
             * do painel. Sem elas os cards saem sem estilo nenhum, porque
             * `.phone__*` e `.cash-*` são escopados por dentro delas.
             */
            <div
              className={`editor-preview editor-preview--app${rolagemInterna ? ' editor-preview--bounded' : ''} theme-${temaDaInterface}`}
              style={
                {
                  '--brand': marca,
                  '--on-brand': '#ffffff',
                } as React.CSSProperties
              }
            >
              <div className="editor-preview__screen">
                <AppViews
                  aba={ativa}
                  estado={estado}
                  executar={executar}
                  products={menu.products}
                  promotions={menu.promotions}
                  categories={menu.categories}
                  stations={menu.stations}
                  storeName={menu.storeName || branding.storeName}
                  storePhone={menu.delivery.whatsapp}
                  logoUrl={menu.branding.logoUrl ?? branding.logoUrl}
                  brandColor={marca}
                  theme={temaDaInterface}
                  deliveryFee={menu.delivery.fee}
                  courierPaidPerDelivery={menu.delivery.courierPaidPerDelivery}
                  waiterCommissionRate={menu.dining.waiterCommissionRate}
                  onIrPara={setAtiva}
                  employeeId={employee.id}
                  employeeName={employee.name}
                  equipe={menu.equipe}
                  onTeamChanged={recarregarMenu}
                  permissions={employee.permissions}
                  isDeliveryman={employee.isDeliveryman ?? employee.permissions.includes('entregador')}
                />
              </div>
            </div>
          )}
        </div>

        {/* ------------------- Barra inferior (só mobile) ------------------- */}
        {visiveis.length > 0 && (
          <nav
            ref={bottomNavRef}
            className="mobile-shell__bottom-nav fixed inset-x-0 bottom-0 z-50 grid border-0 border-t border-solid border-gray-200 bg-white md:hidden
              dark:border-white/10 dark:bg-gray-900"
            style={{
              gridTemplateColumns: escala >= 130
                ? `repeat(${visiveis.length}, minmax(4.5rem, 1fr))`
                : `repeat(${visiveis.length}, minmax(0, 1fr))`,
              paddingBottom: 'env(safe-area-inset-bottom)',
              overflowX: escala >= 130 ? 'auto' : undefined,
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
                  <span className={`${escala >= 130 ? 'whitespace-nowrap' : 'truncate'} text-[0.68rem] font-semibold leading-tight`}>{t(texto)}</span>
                </button>
              );
            })}
          </nav>
        )}
      </div>
    </div>
  );
}
