import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthLayout } from '../components/auth/AuthLayout';
import { GoogleButton } from '../components/auth/GoogleButton';
import { auth } from '../data/content';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api';
import { FiEye, FiEyeOff } from 'react-icons/fi';

/**
 * Mensagens dos códigos que o callback do Google devolve em `?erro=`.
 *
 * O backend redireciona para cá com um código curto em vez de texto pronto:
 * assim a mensagem fica no idioma e no tom do front, e a querystring não
 * expõe detalhe de implementação para quem estiver olhando a barra de
 * endereços. Um código desconhecido cai no genérico — nunca em tela branca.
 */
const GOOGLE_ERRORS: Record<string, string> = {
  google_cancelado: 'Você cancelou a entrada com o Google. Tente de novo ou use seu e-mail e senha.',
  google_sem_codigo: 'O Google não concluiu a autorização. Tente novamente.',
  google_state_invalido: 'A sessão de login expirou por segurança. Comece de novo, por favor.',
  google_sem_identidade: 'O Google não devolveu seus dados. Tente novamente em instantes.',
  google_sem_email: 'Não conseguimos ler o e-mail da sua conta Google.',
  google_email_nao_verificado:
    'Este e-mail ainda não foi verificado pelo Google. Confirme-o e tente de novo.',
  conta_suspensa: 'Esta conta está suspensa. Fale com o suporte para reativar.',
};

/** Tela /login — isolada da landing, sem navbar comercial. */
export function LoginPage() {
  const copy = auth.login;
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const plan = searchParams.get('plano');
  const from = (location.state as { from?: string } | null)?.from ?? '/painel';

  /* Erro vindo do redirect do Google. O erro do formulário tem precedência,
     porque é o mais recente do ponto de vista de quem está na tela. */
  const googleErrorCode = searchParams.get('erro');
  const googleError = googleErrorCode
    ? (GOOGLE_ERRORS[googleErrorCode] ?? 'Não foi possível entrar com o Google. Tente novamente.')
    : null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    if (!identifier.trim()) {
      setFieldErrors({ identifier: 'Informe seu e-mail ou nome de usuário.' });
      return;
    }
    if (!password) {
      setFieldErrors({ password: 'Informe sua senha.' });
      return;
    }

    setSubmitting(true);
    try {
      await login({ identifier: identifier.trim(), password });
      navigate(plan ? `/painel?plano=${encodeURIComponent(plan)}` : from, { replace: true });
    } catch (err: any) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.fieldErrors());
      } else {
        setError('Não conseguimos entrar agora. Tente novamente.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title={copy.title}
      subtitle={copy.subtitle}
      notice={plan ? auth.register.planNotice(plan) : null}
      footer={
        <>
          {copy.switchText}{' '}
          <Link to={plan ? `/register?plano=${encodeURIComponent(plan)}` : '/register'}>{copy.switchLink}</Link>
        </>
      }
    >
      {googleError && !error && <p className="alert alert--error">{googleError}</p>}

      {/* Caminho rápido primeiro: quem tem Google resolve em um clique. */}
      <GoogleButton label="Entrar com o Google" plan={plan} disabled={submitting} />

      <form className="auth__form" onSubmit={handleSubmit} noValidate>
        <div className={`field ${fieldErrors.identifier ? 'has-error' : ''}`}>
          <label htmlFor="login-identifier">{copy.identifierLabel}</label>
          <input
            id="login-identifier"
            name="identifier"
            type="text"
            autoComplete="username"
            autoFocus
            value={identifier}
            placeholder={copy.identifierPlaceholder}
            onChange={(event) => setIdentifier(event.target.value)}
          />
          {fieldErrors.identifier && <small className="field__error">{fieldErrors.identifier}</small>}
        </div>

        <div className={`field ${fieldErrors.password ? 'has-error' : ''}`}>
          <label htmlFor="login-password">{copy.passwordLabel}</label>
          <div style={{ position: 'relative' }}>
            <input
              id="login-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              placeholder={copy.passwordPlaceholder}
              onChange={(event) => setPassword(event.target.value)}
              style={{ paddingRight: '2.5rem' }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', display: 'flex', alignItems: 'center', color: '#666' }}
              title={showPassword ? 'Ocultar senha' : 'Ver senha'}
            >
              {showPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
            </button>
          </div>
          {fieldErrors.password && <small className="field__error">{fieldErrors.password}</small>}
        </div>

        {error && <p className="alert alert--error">{error}</p>}

        <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={submitting}>
          {submitting ? copy.submitting : copy.submit}
        </button>
      </form>
    </AuthLayout>
  );
}
