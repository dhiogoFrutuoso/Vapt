import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { auth, site } from '../../data/content';

type Props = {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
  /** Aviso do plano escolhido, quando o usuário veio da tabela de preços. */
  notice?: string | null;
};

/** Moldura das telas de Login e Registro: painel de marca à esquerda, formulário à direita. */
export function AuthLayout({ title, subtitle, children, footer, notice }: Props) {
  return (
    <div className="auth">
      <aside className="auth__brand">
        <Link className="auth__logo" to="/">
          <img src="/vapt-logo.png" alt="VaptApp" style={{ height: "38px", width: "auto", objectFit: "contain" }} />
          <span className="nav__logo-text">
            {site.name}
            <small>aplicativos rápidos</small>
          </span>
        </Link>

        <div className="auth__pitch">
          <h2>{auth.brandPitch.title}</h2>
          <p>{auth.brandPitch.text}</p>
          <ul>
            {auth.brandPitch.bullets.map((item) => (
              <li key={item}>
                <span aria-hidden="true">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <Link className="auth__back" to="/">
          ← Voltar para o site
        </Link>
      </aside>

      <main className="auth__panel">
        <div className="auth__card">
          <header className="auth__head">
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </header>

          {notice && <p className="auth__notice">{notice}</p>}

          {children}

          <footer className="auth__foot">{footer}</footer>
        </div>
      </main>
    </div>
  );
}
