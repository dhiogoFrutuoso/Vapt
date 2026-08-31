import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthLayout } from '../components/auth/AuthLayout';
import { auth } from '../data/content';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api';
import { fileToResizedDataUrl } from '../lib/image';
import { maskPhone } from '../lib/format';
import { FiEye, FiEyeOff } from 'react-icons/fi';

const UFS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT',
  'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
];

type FormState = {
  email: string;
  username: string;
  displayName: string;
  phone: string;
  password: string;
  passwordConfirm: string;
  zip: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  reference: string;
};

const INITIAL: FormState = {
  email: '',
  username: '',
  displayName: '',
  phone: '',
  password: '',
  passwordConfirm: '',
  zip: '',
  street: '',
  number: '',
  complement: '',
  district: '',
  city: '',
  state: 'SP',
  reference: '',
};

/**
 * Tela /register — três passos para não assustar com um formulário gigante.
 * A foto é redimensionada no navegador antes de subir; a conversão para WEBP
 * (regra do produto) acontece no servidor.
 */
export function RegisterPage() {
  const copy = auth.register;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { register } = useAuth();

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(INITIAL);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const photoInputRef = useRef<HTMLInputElement>(null);
  const plan = searchParams.get('plano');

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key as string];
      return next;
    });
  }

  function validateStepOne(): boolean {
    const errors: Record<string, string> = {};

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'E-mail inválido.';
    if (!/^[a-z0-9._-]{3,24}$/.test(form.username.trim().toLowerCase())) {
      errors.username = 'De 3 a 24 caracteres: letras minúsculas, números, ponto, hífen ou underline.';
    }
    if (form.password.length < 8) errors.password = 'A senha precisa de ao menos 8 caracteres.';
    if (form.password !== form.passwordConfirm) errors.passwordConfirm = 'As senhas não são iguais.';

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function validateStepTwo(): boolean {
    const errors: Record<string, string> = {};

    if (form.street.trim().length < 3) errors.street = 'Informe a rua.';
    if (!form.number.trim()) errors.number = 'Informe o número.';
    if (form.district.trim().length < 2) errors.district = 'Informe o bairro.';
    if (form.city.trim().length < 2) errors.city = 'Informe a cidade.';
    if (form.state.trim().length !== 2) errors.state = 'Informe a UF.';

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function goNext() {
    setError(null);
    if (step === 0 && !validateStepOne()) return;
    if (step === 1 && !validateStepTwo()) return;
    setStep((current) => Math.min(2, current + 1));
  }

  async function handlePhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const dataUrl = await fileToResizedDataUrl(file, 640);
      setPhoto(dataUrl);
      setPhotoFile(file);
      setFieldErrors((current) => {
        const next = { ...current };
        delete next.photo;
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não conseguimos usar essa imagem.');
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!validateStepOne()) {
      setStep(0);
      return;
    }
    if (!validateStepTwo()) {
      setStep(1);
      return;
    }
    if (!photoFile) {
      setFieldErrors({ photo: 'Envie uma foto de perfil.' });
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('email', form.email.trim().toLowerCase());
      formData.append('password', form.password);
      formData.append('username', form.username.trim().toLowerCase());
      formData.append('displayName', form.displayName.trim() || form.username.trim());
      formData.append('phone', form.phone.trim());

      const address = {
        zip: form.zip.trim(),
        street: form.street.trim(),
        number: form.number.trim(),
        complement: form.complement.trim(),
        district: form.district.trim(),
        city: form.city.trim(),
        state: form.state.trim().toUpperCase(),
        reference: form.reference.trim(),
      };
      
      formData.append('address', JSON.stringify(address));
      formData.append('photo', photoFile);

      await register(formData);

      navigate(plan ? `/painel?plano=${encodeURIComponent(plan)}` : '/painel', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        const errors = err.fieldErrors();
        // Erros do servidor vêm como "address.city": normalizamos para o nome do campo.
        const normalized: Record<string, string> = {};
        for (const [key, message] of Object.entries(errors)) {
          normalized[key.replace('address.', '')] = message;
        }
        setFieldErrors(normalized);

        const addressFields = ['street', 'number', 'district', 'city', 'state', 'zip'];
        if (Object.keys(normalized).some((key) => addressFields.includes(key))) setStep(1);
        else if (Object.keys(normalized).some((key) => ['email', 'username', 'password'].includes(key))) setStep(0);
      } else {
        setError('Não conseguimos criar a conta agora. Tente novamente.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title={copy.title}
      subtitle={copy.subtitle}
      notice={plan ? copy.planNotice(plan) : null}
      footer={
        <>
          {copy.switchText}{' '}
          <Link to={plan ? `/login?plano=${encodeURIComponent(plan)}` : '/login'}>{copy.switchLink}</Link>
        </>
      }
    >
      <ol className="auth__steps" aria-label="Etapas do cadastro">
        {copy.steps.map((label, index) => (
          <li key={label} className={`${index === step ? 'is-active' : ''} ${index < step ? 'is-done' : ''}`}>
            <span>{index < step ? '✓' : index + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      <form className="auth__form" onSubmit={handleSubmit} noValidate>
        {/* ------------------------- Passo 1 ------------------------- */}
        {step === 0 && (
          <>
            <div className={`field ${fieldErrors.email ? 'has-error' : ''}`}>
              <label htmlFor="reg-email">{copy.emailLabel}</label>
              <input
                id="reg-email"
                type="email"
                autoComplete="email"
                autoFocus
                value={form.email}
                placeholder={copy.emailPlaceholder}
                onChange={(event) => update('email', event.target.value)}
              />
              {fieldErrors.email && <small className="field__error">{fieldErrors.email}</small>}
            </div>

            <div className="field-row">
              <div className={`field ${fieldErrors.username ? 'has-error' : ''}`}>
                <label htmlFor="reg-username">{copy.usernameLabel}</label>
                <input
                  id="reg-username"
                  type="text"
                  autoComplete="username"
                  value={form.username}
                  placeholder={copy.usernamePlaceholder}
                  onChange={(event) => update('username', event.target.value.toLowerCase())}
                />
                {fieldErrors.username ? (
                  <small className="field__error">{fieldErrors.username}</small>
                ) : (
                  <small className="field__hint">{copy.usernameHint}</small>
                )}
              </div>

              <div className="field">
                <label htmlFor="reg-display">{copy.displayNameLabel}</label>
                <input
                  id="reg-display"
                  type="text"
                  value={form.displayName}
                  placeholder={copy.displayNamePlaceholder}
                  onChange={(event) => update('displayName', event.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="reg-phone">{copy.phoneLabel}</label>
              <input
                id="reg-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={form.phone}
                placeholder={copy.phonePlaceholder}
                onChange={(event) => update('phone', maskPhone(event.target.value))}
              />
            </div>

            <div className="field-row">
              <div className={`field ${fieldErrors.password ? 'has-error' : ''}`}>
                <label htmlFor="reg-password">{copy.passwordLabel}</label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="reg-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={form.password}
                    placeholder={copy.passwordPlaceholder}
                    onChange={(event) => update('password', event.target.value)}
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

              <div className={`field ${fieldErrors.passwordConfirm ? 'has-error' : ''}`}>
                <label htmlFor="reg-password2">{copy.passwordConfirmLabel}</label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="reg-password2"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={form.passwordConfirm}
                    onChange={(event) => update('passwordConfirm', event.target.value)}
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
                {fieldErrors.passwordConfirm && <small className="field__error">{fieldErrors.passwordConfirm}</small>}
              </div>
            </div>
          </>
        )}

        {/* ------------------------- Passo 2 ------------------------- */}
        {step === 1 && (
          <>
            <div className="field-row field-row--zip">
              <div className="field">
                <label htmlFor="reg-zip">{copy.zipLabel}</label>
                <input
                  id="reg-zip"
                  type="text"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  value={form.zip}
                  placeholder="00000-000"
                  onChange={(event) => update('zip', event.target.value)}
                />
              </div>

              <div className={`field ${fieldErrors.street ? 'has-error' : ''}`}>
                <label htmlFor="reg-street">{copy.streetLabel}</label>
                <input
                  id="reg-street"
                  type="text"
                  autoComplete="address-line1"
                  autoFocus
                  value={form.street}
                  onChange={(event) => update('street', event.target.value)}
                />
                {fieldErrors.street && <small className="field__error">{fieldErrors.street}</small>}
              </div>
            </div>

            <div className="field-row">
              <div className={`field ${fieldErrors.number ? 'has-error' : ''}`}>
                <label htmlFor="reg-number">{copy.numberLabel}</label>
                <input
                  id="reg-number"
                  type="text"
                  inputMode="numeric"
                  value={form.number}
                  onChange={(event) => update('number', event.target.value)}
                />
                {fieldErrors.number && <small className="field__error">{fieldErrors.number}</small>}
              </div>

              <div className="field">
                <label htmlFor="reg-complement">{copy.complementLabel}</label>
                <input
                  id="reg-complement"
                  type="text"
                  value={form.complement}
                  onChange={(event) => update('complement', event.target.value)}
                />
              </div>
            </div>

            <div className="field-row field-row--city">
              <div className={`field ${fieldErrors.district ? 'has-error' : ''}`}>
                <label htmlFor="reg-district">{copy.districtLabel}</label>
                <input
                  id="reg-district"
                  type="text"
                  value={form.district}
                  onChange={(event) => update('district', event.target.value)}
                />
                {fieldErrors.district && <small className="field__error">{fieldErrors.district}</small>}
              </div>

              <div className={`field ${fieldErrors.city ? 'has-error' : ''}`}>
                <label htmlFor="reg-city">{copy.cityLabel}</label>
                <input
                  id="reg-city"
                  type="text"
                  autoComplete="address-level2"
                  value={form.city}
                  onChange={(event) => update('city', event.target.value)}
                />
                {fieldErrors.city && <small className="field__error">{fieldErrors.city}</small>}
              </div>

              <div className={`field ${fieldErrors.state ? 'has-error' : ''}`}>
                <label htmlFor="reg-state">{copy.stateLabel}</label>
                <select
                  id="reg-state"
                  value={form.state}
                  onChange={(event) => update('state', event.target.value)}
                >
                  {UFS.map((uf) => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </select>
                {fieldErrors.state && <small className="field__error">{fieldErrors.state}</small>}
              </div>
            </div>

            <div className="field">
              <label htmlFor="reg-reference">{copy.referenceLabel}</label>
              <input
                id="reg-reference"
                type="text"
                value={form.reference}
                placeholder="Ex.: ao lado do posto, portão azul"
                onChange={(event) => update('reference', event.target.value)}
              />
            </div>
          </>
        )}

        {/* ------------------------- Passo 3 ------------------------- */}
        {step === 2 && (
          <div className={`field ${fieldErrors.photo ? 'has-error' : ''}`}>
            <span className="field__label">{copy.photoLabel}</span>

            <div className="auth__photo">
              <div className="auth__photo-preview">
                {photo ? <img src={photo} alt="Sua foto de perfil" /> : <span aria-hidden="true">📷</span>}
              </div>

              <div className="auth__photo-actions">
                <button
                  type="button"
                  className="btn btn--outline"
                  onClick={() => photoInputRef.current?.click()}
                >
                  {photo ? copy.photoChange : copy.photoPick}
                </button>
                <small className="field__hint">{copy.photoHint}</small>
              </div>

              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => void handlePhoto(event.target.files?.[0])}
              />
            </div>

            {fieldErrors.photo && <small className="field__error">{fieldErrors.photo}</small>}
          </div>
        )}

        {error && <p className="alert alert--error">{error}</p>}

        <div className="auth__actions">
          {step > 0 && (
            <button type="button" className="btn btn--ghost" onClick={() => setStep((s) => s - 1)}>
              {copy.back}
            </button>
          )}

          {step < 2 ? (
            <button type="button" className="btn btn--primary btn--lg" onClick={goNext}>
              {copy.next} →
            </button>
          ) : (
            <button type="submit" className="btn btn--primary btn--lg" disabled={submitting}>
              {submitting ? copy.submitting : copy.submit}
            </button>
          )}
        </div>
      </form>
    </AuthLayout>
  );
}
