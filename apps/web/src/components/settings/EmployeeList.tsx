import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ChevronDown,
  KeySquare,
  Lock,
  RefreshCw,
  Smartphone,
  Trash2,
  Unlock,
} from 'lucide-react';
import { api, ApiError, type EmployeeDetail } from '../../lib/api';
import { useConfirm } from '../ConfirmModal';

/**
 * Equipe do restaurante, no modal de configurações.
 *
 * O dono VÊ os dados pessoais (CPF, contato, nascimento) mas não os edita —
 * são dados de outra pessoa, preenchidos por ela no onboarding do app. Quem
 * corrige um CPF errado é o dono do CPF.
 *
 * Os detalhes ficam recolhidos por padrão: numa equipe de quinze pessoas, o
 * dono normalmente quer o código de acesso, não o CPF de todo mundo na tela.
 */

type Props = {
  appId: string;
  /** Recarrega o app pai quando a lista muda (nome, função, exclusão). */
  onChanged?: () => void;
};

function formatarCpf(cpf: string): string {
  if (cpf.length !== 11) return cpf || '—';
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function formatarData(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

function formatarQuando(iso: string | null): string {
  if (!iso) return 'nunca';
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

export function EmployeeList({ appId, onChanged }: Props) {
  const { confirm, ConfirmElement } = useConfirm();

  const [employees, setEmployees] = useState<EmployeeDetail[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function recarregar() {
    try {
      const data = await api.listEmployees(appId);
      setEmployees(data.employees);
    } catch (error) {
      if (error instanceof ApiError) toast.error(error.message);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void recarregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);

  async function bloquear(emp: EmployeeDetail) {
    confirm({
      title: `Bloquear ${emp.name}?`,
      message:
        'O acesso é encerrado na hora em todos os aparelhos e o código atual deixa de funcionar. Ao desbloquear, um código novo é gerado.',
      confirmText: 'Bloquear',
      isDestructive: true,
      onConfirm: async () => {
        setOcupado(emp.id);
        try {
          const data = await api.blockEmployee(appId, emp.id);
          toast.success(
            data.sessoesEncerradas > 0
              ? `${emp.name} bloqueado. ${data.sessoesEncerradas} aparelho(s) desconectado(s).`
              : `${emp.name} bloqueado.`
          );
          await recarregar();
          onChanged?.();
        } catch (error) {
          if (error instanceof ApiError) toast.error(error.message);
        } finally {
          setOcupado(null);
        }
      },
    });
  }

  async function desbloquear(emp: EmployeeDetail) {
    setOcupado(emp.id);
    try {
      const data = await api.unblockEmployee(appId, emp.id);
      /* O código novo aparece longo na tela: o dono precisa ditá-lo agora. */
      toast.success(`${emp.name} liberado. Novo código: ${data.accessCode}`, { duration: 8000 });
      await recarregar();
      onChanged?.();
    } catch (error) {
      if (error instanceof ApiError) toast.error(error.message);
    } finally {
      setOcupado(null);
    }
  }

  async function novoCodigo(emp: EmployeeDetail) {
    confirm({
      title: 'Gerar novo código?',
      message: `O código atual de ${emp.name} para de funcionar e os aparelhos conectados são desconectados. Use quando o celular for perdido.`,
      confirmText: 'Gerar novo',
      isDestructive: true,
      onConfirm: async () => {
        setOcupado(emp.id);
        try {
          const data = await api.regenerateEmployeeCode(appId, emp.id);
          toast.success(`Novo código de ${emp.name}: ${data.accessCode}`, { duration: 8000 });
          await recarregar();
        } catch (error) {
          if (error instanceof ApiError) toast.error(error.message);
        } finally {
          setOcupado(null);
        }
      },
    });
  }

  async function excluir(emp: EmployeeDetail) {
    confirm({
      title: `Excluir ${emp.name}?`,
      message:
        'O cadastro é removido e o acesso encerrado imediatamente. Esta ação não pode ser desfeita.',
      confirmText: 'Excluir',
      isDestructive: true,
      onConfirm: async () => {
        setOcupado(emp.id);
        try {
          await api.removeEmployee(appId, emp.id);
          toast.success(`${emp.name} foi removido.`);
          await recarregar();
          onChanged?.();
        } catch (error) {
          if (error instanceof ApiError) toast.error(error.message);
        } finally {
          setOcupado(null);
        }
      },
    });
  }

  if (carregando) {
    return <p className="py-6 text-center text-sm text-gray-500">Carregando equipe...</p>;
  }

  if (employees.length === 0) {
    return (
      <p className="py-6 text-center text-sm italic text-gray-500">Nenhum funcionário adicionado.</p>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {employees.map((emp) => {
        const aberto = expandido === emp.id;
        const travado = ocupado === emp.id;

        return (
          <div
            key={emp.id}
            className={`rounded-xl border border-solid bg-white p-3.5 ${
              emp.blocked ? 'border-red-200 bg-red-50/40' : 'border-gray-100'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <button
                type="button"
                onClick={() => setExpandido(aberto ? null : emp.id)}
                className="flex min-w-0 flex-1 items-center gap-2 bg-transparent text-left"
                aria-expanded={aberto}
              >
                <ChevronDown
                  size={16}
                  className={`shrink-0 text-gray-400 transition-transform ${aberto ? 'rotate-180' : ''}`}
                />
                <span className="min-w-0">
                  <strong className="block truncate text-[1rem] font-bold text-gray-900">
                    {emp.name}
                  </strong>
                  <span className="block truncate text-sm text-gray-500">
                    {emp.roleName}
                    {emp.blocked && <span className="font-bold text-red-600"> · bloqueado</span>}
                    {!emp.blocked && !emp.onboardingCompleted && (
                      <span className="text-amber-600"> · cadastro pendente</span>
                    )}
                  </span>
                </span>
              </button>

              <div className="flex shrink-0 gap-1.5">
                {emp.blocked ? (
                  <button
                    type="button"
                    onClick={() => void desbloquear(emp)}
                    disabled={travado}
                    title="Desbloquear e gerar novo código"
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-solid border-emerald-200 bg-white text-emerald-600 disabled:opacity-50"
                  >
                    <Unlock size={15} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void bloquear(emp)}
                    disabled={travado}
                    title="Bloquear acesso"
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-solid border-amber-200 bg-white text-amber-600 disabled:opacity-50"
                  >
                    <Lock size={15} />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => void excluir(emp)}
                  disabled={travado}
                  title="Excluir funcionário"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-solid border-red-200 bg-white text-red-500 disabled:opacity-50"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            {/* --------------------------- Código --------------------------- */}
            <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-solid border-gray-100 bg-gray-50 p-2.5">
              <KeySquare size={17} className="shrink-0 text-gray-500" />

              {emp.accessCode ? (
                <>
                  <span className="flex-1 font-mono text-[1.05rem] font-bold tracking-[3px] text-gray-900">
                    {emp.accessCode}
                  </span>
                  <button
                    type="button"
                    onClick={() => void novoCodigo(emp)}
                    disabled={travado}
                    title="Gerar novo código"
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-gray-500 disabled:opacity-50"
                  >
                    <RefreshCw size={14} />
                  </button>
                </>
              ) : (
                <span className="flex-1 text-sm italic text-gray-500">
                  Sem código — desbloqueie para gerar um novo.
                </span>
              )}
            </div>

            {/* -------------------------- Detalhes -------------------------- */}
            {aberto && (
              <div className="mt-3 border-0 border-t border-solid border-gray-100 pt-3">
                <dl className="m-0 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  <div className="flex justify-between gap-2 sm:block">
                    <dt className="text-gray-500">Telefone</dt>
                    <dd className="m-0 font-semibold text-gray-900">{emp.profile.phone || '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-2 sm:block">
                    <dt className="text-gray-500">CPF</dt>
                    <dd className="m-0 font-semibold text-gray-900">{formatarCpf(emp.profile.cpf)}</dd>
                  </div>
                  <div className="flex justify-between gap-2 sm:block">
                    <dt className="text-gray-500">Nascimento</dt>
                    <dd className="m-0 font-semibold text-gray-900">
                      {formatarData(emp.profile.birthDate)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2 sm:block">
                    <dt className="text-gray-500">Último acesso</dt>
                    <dd className="m-0 font-semibold text-gray-900">
                      {formatarQuando(emp.lastLoginAt)}
                    </dd>
                  </div>
                </dl>

                {emp.devices.length > 0 && (
                  <div className="mt-3">
                    <p className="m-0 mb-1.5 text-sm text-gray-500">Aparelhos conectados</p>
                    <ul className="m-0 flex list-none flex-col gap-1 p-0">
                      {emp.devices.map((d, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm text-gray-700">
                          <Smartphone size={13} className="shrink-0 text-gray-400" />
                          {d.deviceName} · {d.platform}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <p className="m-0 mt-3 text-xs leading-relaxed text-gray-400">
                  Estes dados são preenchidos pelo próprio funcionário no aplicativo e não podem ser
                  editados aqui.
                </p>
              </div>
            )}
          </div>
        );
      })}

      {ConfirmElement}
    </div>
  );
}
