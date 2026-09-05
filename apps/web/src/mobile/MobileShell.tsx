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

/**
 * Casca do app depois do login.
 *
 * Cabeçalho com a marca do restaurante, área de conteúdo que rola por dentro
 * e barra inferior com **apenas as abas que a função do funcionário libera**.
 *
 * O RBAC é de fachada aqui, e de verdade na API: esconder a aba evita o erro
 * honesto de quem tocaria no lugar errado, mas quem forjar a requisição
 * esbarra no `requirePermission` do servidor.
 */

/** Ordem fixa: é o fluxo do pedido, do cliente até a entrega. */
const ABAS = [
  { chave: 'cliente', rotulo: 'Cliente', Icone: UserIcon },
  { chave: 'recepcao', rotulo: 'Recepção', Icone: ConciergeBell },
  { chave: 'salao', rotulo: 'Salão', Icone: UtensilsCrossed },
  { chave: 'cozinha', rotulo: 'Cozinha', Icone: ChefHat },
  { chave: 'caixa', rotulo: 'Caixa', Icone: Wallet },
  { chave: 'entregador', rotulo: 'Entregador', Icone: Bike },
] as const;

type Chave = (typeof ABAS)[number]['chave'] | 'perfil';

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

export function MobileShell() {
  const { employee, branding, logout } = useDeviceAuth();
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
      toast.success('Você saiu da conta.');
    } finally {
      setSaindo(false);
    }
  }

  return (
    <div
      className="flex h-[100dvh] flex-col overflow-hidden"
      style={{ backgroundColor: '#FAF8F5', ['--marca' as string]: marca }}
    >
      {/* ----------------------------- Cabeçalho ---------------------------- */}
      <header
        className="flex shrink-0 items-center gap-3 px-4 py-3"
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
          aria-label="Meu perfil"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-extrabold text-white"
        >
          {iniciais(employee.name)}
        </button>
      </header>

      {/* ------------------------------ Conteúdo ---------------------------- */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-4">
        {ativa === 'perfil' ? (
          editando ? (
            <OnboardingScreen
              modo="edicao"
              onDone={() => setEditando(false)}
              onCancel={() => setEditando(false)}
            />
          ) : (
            <section className="flex flex-col gap-4">
              <div className="rounded-3xl bg-white p-6 text-center shadow-[0_10px_30px_-4px_rgba(17,17,17,0.06)]">
                <div
                  className="mx-auto flex h-20 w-20 items-center justify-center overflow-hidden rounded-full"
                  style={{ backgroundColor: `${marca}1A` }}
                >
                  {employee.profile.photoUrl ? (
                    <img src={employee.profile.photoUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-2xl font-extrabold" style={{ color: marca }}>
                      {iniciais(employee.name)}
                    </span>
                  )}
                </div>

                <h1 className="m-0 mt-4 text-xl font-extrabold text-gray-900">{employee.name}</h1>
                <p className="m-0 mt-1 text-sm text-gray-500">{employee.role}</p>
              </div>

              <div className="rounded-3xl bg-white p-5 shadow-[0_10px_30px_-4px_rgba(17,17,17,0.06)]">
                <h2 className="m-0 mb-4 text-base font-extrabold text-gray-900">Meus dados</h2>

                <dl className="m-0 flex flex-col gap-3 text-[0.95rem]">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-gray-500">Telefone</dt>
                    <dd className="m-0 font-semibold text-gray-900">
                      {employee.profile.phone || '—'}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-gray-500">CPF</dt>
                    <dd className="m-0 font-semibold text-gray-900">
                      {employee.profile.cpf
                        ? employee.profile.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
                        : '—'}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-gray-500">Nascimento</dt>
                    <dd className="m-0 font-semibold text-gray-900">
                      {employee.profile.birthDate
                        ? new Date(employee.profile.birthDate).toLocaleDateString('pt-BR')
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
                  Editar dados
                </button>
              </div>

              <button
                type="button"
                onClick={() => void handleLogout()}
                disabled={saindo}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-solid
                  border-red-200 bg-white px-6 py-3.5 text-[0.95rem] font-bold text-red-600
                  disabled:opacity-55"
              >
                <LogOut size={16} />
                {saindo ? 'Saindo...' : 'Sair da conta'}
              </button>
            </section>
          )
        ) : (
          <section className="flex min-h-full flex-col items-center justify-center py-16 text-center">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-2xl"
              style={{ backgroundColor: `${marca}1A` }}
            >
              {abaAtual ? <abaAtual.Icone size={26} style={{ color: marca }} /> : null}
            </div>

            <h2 className="m-0 mt-4 text-lg font-extrabold text-gray-900">{abaAtual?.rotulo}</h2>
            <p className="m-0 mt-2 max-w-xs text-[0.95rem] leading-relaxed text-gray-500">
              Sua função dá acesso a esta área. As telas de operação chegam na próxima etapa.
            </p>
          </section>
        )}
      </div>

      {/* --------------------------- Barra inferior -------------------------- */}
      {visiveis.length > 0 && (
        <nav
          className="grid shrink-0 border-0 border-t border-solid border-gray-200 bg-white"
          style={{
            gridTemplateColumns: `repeat(${visiveis.length}, minmax(0, 1fr))`,
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
          aria-label="Áreas do aplicativo"
        >
          {visiveis.map(({ chave, rotulo, Icone }) => {
            const selecionada = ativa === chave;
            return (
              <button
                key={chave}
                type="button"
                onClick={() => setAtiva(chave)}
                aria-current={selecionada ? 'page' : undefined}
                className="flex min-w-0 flex-col items-center justify-center gap-1 px-1 py-2.5"
                /* Inativo em cinza sólido, não em opacidade: o funcionário lê
                   a barra de relance, com o aparelho apoiado no balcão. */
                style={{ color: selecionada ? marca : '#9CA3AF' }}
              >
                <Icone size={20} />
                <span className="truncate text-[10px] font-semibold leading-none">{rotulo}</span>
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}
