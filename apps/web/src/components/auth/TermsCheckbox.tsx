import { Link } from 'react-router-dom';

/**
 * Aceite dos Termos de Uso e da Política de Privacidade.
 *
 * Os links abrem em nova aba de propósito: quem clica para ler não pode
 * perder o formulário meio preenchido — no cadastro isso significaria
 * recomeçar os três passos.
 *
 * O aceite é sempre uma ação afirmativa: a caixa nunca vem marcada. Aceite
 * pré-marcado não vale como consentimento (é o que a LGPD chama de
 * manifestação livre e inequívoca) e ainda esconde do usuário o que ele está
 * concordando.
 */

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  error?: string;
  /** Sufixo do id, para as duas telas conviverem sem colidir. */
  idSuffix?: string;
};

export function TermsCheckbox({ checked, onChange, disabled = false, error, idSuffix = 'terms' }: Props) {
  const id = `accept-${idSuffix}`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 text-[0.9rem] leading-snug text-gray-600">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          aria-describedby={error ? `${id}-error` : undefined}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[#F95D2A] disabled:cursor-not-allowed"
        />
        <span>
          Li e concordo com os{' '}
          <Link
            to="/termos"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-[#F95D2A] underline underline-offset-2"
          >
            Termos de Uso
          </Link>{' '}
          e a{' '}
          <Link
            to="/privacidade"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-[#F95D2A] underline underline-offset-2"
          >
            Política de Privacidade
          </Link>
          .
        </span>
      </label>

      {error && (
        <small id={`${id}-error`} className="text-sm text-red-600">
          {error}
        </small>
      )}
    </div>
  );
}
