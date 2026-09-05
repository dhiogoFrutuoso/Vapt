import { useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { useDeviceAuth } from './DeviceAuthContext';
import { DeviceApiError } from './deviceApi';

/**
 * Primeiro acesso: contato, CPF e nascimento.
 *
 * É bloqueante — o funcionário não chega às abas sem preencher. A foto fica
 * de fora de propósito: exigir câmera no primeiro acesso trava o turno de
 * quem está com o aparelho na mão e o salão cheio.
 */

export function maskPhone(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function maskCpf(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

const LABEL = 'mb-1.5 block text-sm font-semibold text-gray-700';
const INPUT =
  'w-full rounded-2xl border border-solid border-gray-200 bg-white px-4 py-3.5 text-[1rem] ' +
  'text-gray-900 outline-none transition-colors focus:border-[color:var(--marca)]';

type Props = {
  /** Formulário reaproveitado em "Meu Perfil": ali há botão de voltar. */
  modo?: 'onboarding' | 'edicao';
  onDone?: () => void;
  onCancel?: () => void;
};

export function OnboardingScreen({ modo = 'onboarding', onDone, onCancel }: Props) {
  const { employee, branding, completeOnboarding } = useDeviceAuth();

  const [phone, setPhone] = useState(() => maskPhone(employee?.profile.phone ?? ''));
  const [cpf, setCpf] = useState(() => maskCpf(employee?.profile.cpf ?? ''));
  const [birthDate, setBirthDate] = useState(
    () => employee?.profile.birthDate?.slice(0, 10) ?? ''
  );
  const [enviando, setEnviando] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErros({});

    const locais: Record<string, string> = {};
    if (phone.replace(/\D/g, '').length < 10) locais.phone = 'Informe o telefone com DDD.';
    if (cpf.replace(/\D/g, '').length !== 11) locais.cpf = 'O CPF tem 11 dígitos.';
    if (!birthDate) locais.birthDate = 'Informe sua data de nascimento.';

    if (Object.keys(locais).length > 0) {
      setErros(locais);
      return;
    }

    setEnviando(true);
    try {
      await completeOnboarding({ phone, cpf: cpf.replace(/\D/g, ''), birthDate });
      toast.success(modo === 'onboarding' ? 'Tudo pronto!' : 'Dados atualizados.');
      onDone?.();
    } catch (error) {
      if (error instanceof DeviceApiError) {
        setErros(error.fieldErrors());
        toast.error(error.message);
      } else {
        toast.error('Não conseguimos salvar. Tente novamente.');
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main
      className="min-h-[100dvh] px-6 py-10"
      style={{ backgroundColor: '#FAF8F5', ['--marca' as string]: branding.primaryColor }}
    >
      <div className="mx-auto w-full max-w-sm">
        <header className="mb-8">
          <h1 className="m-0 text-2xl font-extrabold text-gray-900">
            {modo === 'onboarding' ? 'Complete seu cadastro' : 'Meus dados'}
          </h1>
          <p className="m-0 mt-2 text-[0.95rem] leading-relaxed text-gray-500">
            {modo === 'onboarding'
              ? `Antes de começar em ${branding.storeName}, precisamos destes dados.`
              : 'Você pode corrigir seus dados quando quiser.'}
          </p>
        </header>

        <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
          <div>
            <label className={LABEL} htmlFor="ob-phone">
              Telefone de contato
            </label>
            <input
              id="ob-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              className={INPUT}
              value={phone}
              placeholder="(11) 99999-9999"
              onChange={(e) => setPhone(maskPhone(e.target.value))}
            />
            {erros.phone && <small className="mt-1.5 block text-sm text-red-600">{erros.phone}</small>}
          </div>

          <div>
            <label className={LABEL} htmlFor="ob-cpf">
              CPF
            </label>
            <input
              id="ob-cpf"
              type="text"
              inputMode="numeric"
              className={INPUT}
              value={cpf}
              placeholder="000.000.000-00"
              onChange={(e) => setCpf(maskCpf(e.target.value))}
            />
            {erros.cpf && <small className="mt-1.5 block text-sm text-red-600">{erros.cpf}</small>}
          </div>

          <div>
            <label className={LABEL} htmlFor="ob-birth">
              Data de nascimento
            </label>
            <input
              id="ob-birth"
              type="date"
              className={INPUT}
              value={birthDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setBirthDate(e.target.value)}
            />
            {erros.birthDate && (
              <small className="mt-1.5 block text-sm text-red-600">{erros.birthDate}</small>
            )}
          </div>

          <p className="m-0 text-sm leading-relaxed text-gray-400">
            A foto de perfil é opcional e pode ser adicionada depois, em Meu Perfil.
          </p>

          <button
            type="submit"
            disabled={enviando}
            className="mt-1 w-full rounded-full px-6 py-4 text-[1rem] font-bold text-white
              transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: branding.primaryColor }}
          >
            {enviando ? 'Salvando...' : modo === 'onboarding' ? 'Começar' : 'Salvar'}
          </button>

          {modo === 'edicao' && (
            <button
              type="button"
              onClick={onCancel}
              disabled={enviando}
              className="w-full rounded-full border border-solid border-gray-200 bg-white px-6 py-3.5
                text-[0.95rem] font-bold text-gray-600"
            >
              Cancelar
            </button>
          )}
        </form>
      </div>
    </main>
  );
}
