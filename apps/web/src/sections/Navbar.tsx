import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { nav, site } from '../data/content';
import { useAuth } from '../context/AuthContext';

/**
 * Navbar da página comercial.
 *
 * O acesso ao sistema fica explícito aqui: "Entrar" e "Criar conta" levam para
 * as telas isoladas /login e /register. Com sessão ativa, viram um atalho para o painel.
 */
export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { user, loading } = useAuth();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <header className={`nav ${scrolled ? 'nav--scrolled' : ''}`}>
      <div className="container nav__inner">
        <a className="nav__logo" href="#topo" onClick={() => setOpen(false)}>
          <img src="/vapt-logo.png" alt="VaptApp" style={{ height: "38px", width: "auto", objectFit: "contain" }} />
          <span className="nav__logo-text">
            {site.name}
            <small>aplicativos rápidos</small>
          </span>
        </a>

        <nav className={`nav__links ${open ? 'is-open' : ''}`}>
          {nav.links.map((link) => (
            <a key={link.href + link.label} href={link.href} onClick={() => setOpen(false)}>
              {link.label}
            </a>
          ))}

          <div className="nav__mobile-actions">
            {user ? (
              <Link className="btn btn--primary" to="/painel" onClick={() => setOpen(false)}>
                Ir para o painel
              </Link>
            ) : (
              <>
                <Link className="btn btn--outline" to="/login" onClick={() => setOpen(false)}>
                  {nav.loginLabel}
                </Link>
                <Link className="btn btn--primary" to="/register" onClick={() => setOpen(false)}>
                  {nav.registerLabel}
                </Link>
              </>
            )}
          </div>
        </nav>

        <div className="nav__actions">
          {!loading && user ? (
            <Link className="btn btn--primary nav__cta" to="/painel">
              Ir para o painel
            </Link>
          ) : (
            <>
              <Link className="btn btn--ghost nav__login" to="/login">
                {nav.loginLabel}
              </Link>
              <Link className="btn btn--primary nav__cta" to="/register">
                {nav.registerLabel}
              </Link>
            </>
          )}

          <button
            type="button"
            className="nav__burger"
            aria-label={open ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>
    </header>
  );
}
