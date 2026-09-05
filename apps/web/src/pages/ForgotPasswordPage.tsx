import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AuthLayout } from '../components/auth/AuthLayout';
import { api, ApiError } from '../lib/api';

/**
 * Recuperação de senha em dois passos.
 *
 * Passo 1 pede o e-mail; passo 2 pede o código de 6 dígitos e a nova senha.
 *
 * A API responde igual exista ou não a conta — de propósito, para a rota não
 * virar um oráculo de quem tem cadastro no Vapt. Por isso a tela avança para o
 * passo 2 sem "confirmar" nada: dizer "e-mail não encontrado" aqui anularia a
 * proteção do backend.
 */

const PILL =
  'inline-flex w-full items-center justify-center rounded-full bg-[#F95D2A] px-6 py-3 text-[0.95rem] ' +
  'font-bold text-white transition-colors hover:bg-[#FF7A4D] disabled:cursor-not-allowed disabled:opacity-55';

export function ForgotPasswordPage() {
  const navigate = useNavigate();

  const [step, setStep] = useState<0 | 1>(0);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [expiresIn, setExpiresIn] = useState(15);

  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleRequestCode(event: FormEvent) {
    event.preventDefault();
    setFieldErrors({});

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFieldErrors({ email: 'Informe um e-mail válido.' });
      return;
    }

    setLoading(true);
    try {
      const data = await api.forgotPassword({ email: email.trim().toLowerCase() });
      setExpiresIn(data?.expiresInMinutes ?? 15);
      setStep(1);
      toast.success('Se houver conta com este e-mail, o código chega em instantes.');
    } catch (error) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors());
        toast.error(error.message);
      } else {
        toast.error('Não conseguimos enviar o código agora. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(event: FormEvent) {
    event.preventDefault();
    setFieldErrors({});

    const errors: Record<string, string> = {};
    if (!/^[0-9]{6}$/.test(code.trim())) errors.code = 'O código tem 6 dígitos.';
    if (newPassword.length < 8) errors.newPassword = 'A nova senha precisa de ao menos 8 caracteres.';
    if (newPassword !== confirmPassword) errors.confirmPassword = 'As senhas não coincidem.';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setLoading(true);
    try {
      await api.resetPassword({ email: email.trim().toLowerCase(), code: code.trim(), newPassword });
      toast.success('Senha alterada. Já pode entrar.');
      navigate('/login', { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors());
        toast.error(error.message);
      } else {
        toast.error('Não conseguimos alterar a senha. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title={step === 0 ? 'Recuperar senha' : 'Digite o código'}
      subtitle={
        step === 0
          ? 'Enviamos um código de 6 dígitos para o seu e-mail.'
          : `Enviamos para ${email}. O código vale por ${expiresIn} minutos.`
      }
      footer={
        <>
          Lembrou a senha? <Link to="/login">Voltar ao login</Link>
        </>
      }
    >
      {step === 0 ? (
        <form className="auth__form" onSubmit={handleRequestCode} noValidate>
          <div className={`field ${fieldErrors.email ? 'has-error' : ''}`}>
            <label htmlFor="forgot-email">E-mail da conta</label>
            <input
              id="forgot-email"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              placeholder="voce@seunegocio.com.br"
              onChange={(event) => setEmail(event.target.value)}
            />
            {fieldErrors.email && <small className="field__error">{fieldErrors.email}</small>}
          </div>

          <button type="submit" className={PILL} disabled={loading}>
            {loading ? 'Enviando...' : 'Enviar código'}
          </button>
        </form>
      ) : (
        <form className="auth__form" onSubmit={handleReset} noValidate>
          <div className={`field ${fieldErrors.code ? 'has-error' : ''}`}>
            <label htmlFor="forgot-code">Código de 6 dígitos</label>
            <input
              id="forgot-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              value={code}
              placeholder="000000"
              // Só dígitos: colar "1 2 3 4 5 6" de um e-mail não deve quebrar.
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              style={{ letterSpacing: '0.5em', fontWeight: 700, textAlign: 'center' }}
            />
            {fieldErrors.code && <small className="field__error">{fieldErrors.code}</small>}
          </div>

          <div className={`field ${fieldErrors.newPassword ? 'has-error' : ''}`}>
            <label htmlFor="forgot-new-password">Nova senha</label>
            <input
              id="forgot-new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              placeholder="Mínimo de 8 caracteres"
              onChange={(event) => setNewPassword(event.target.value)}
            />
            {fieldErrors.newPassword && <small className="field__error">{fieldErrors.newPassword}</small>}
          </div>

          <div className={`field ${fieldErrors.confirmPassword ? 'has-error' : ''}`}>
            <label htmlFor="forgot-confirm-password">Confirmar nova senha</label>
            <input
              id="forgot-confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
            {fieldErrors.confirmPassword && (
              <small className="field__error">{fieldErrors.confirmPassword}</small>
            )}
          </div>

          <button type="submit" className={PILL} disabled={loading}>
            {loading ? 'Alterando...' : 'Alterar senha'}
          </button>

          <button
            type="button"
            className="mt-1 bg-transparent text-sm font-semibold text-gray-500 hover:text-gray-900"
            onClick={() => {
              setStep(0);
              setCode('');
              setFieldErrors({});
            }}
            disabled={loading}
          >
            Usar outro e-mail
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
