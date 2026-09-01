import { footer, site } from '../data/content';

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="container footer__inner">
        <div className="footer__brand">
          <a className="nav__logo" href="#topo">
            <img src="/vapt-logo.png" alt="VaptApp" style={{ height: "38px", width: "auto", objectFit: "contain" }} />
            <span className="nav__logo-text">
              {site.name}
              <small>aplicativos rápidos</small>
            </span>
          </a>
          <p>{footer.description}</p>
          <div className="footer__contact">
            <a href={`mailto:${site.email}`}>{site.email}</a>
          </div>
        </div>

        {footer.columns.map((column) => (
          <nav className="footer__col" key={column.title}>
            <h4>{column.title}</h4>
            <ul>
              {column.links.map((link) => (
                <li key={link.label}>
                  <a href={link.href}>{link.label}</a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="container footer__legal">
        <span>
          © {year} {site.name}. Todos os direitos reservados.
        </span>
      </div>
    </footer>
  );
}
