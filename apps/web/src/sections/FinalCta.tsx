import { Link } from 'react-router-dom';
import { TbArrowRight } from 'react-icons/tb';
import { finalCta, site, whatsappLink } from '../data/content';

export function FinalCta() {
  return (
    <section className="final-cta">
      <div className="container">
        <div className="final-cta__box">
          <h2>{finalCta.title}</h2>
          <p>{finalCta.subtitle}</p>
          <div className="final-cta__actions">
            <Link className="btn btn--light btn--lg" to="/register">
              {finalCta.ctaPrimary}
              <span aria-hidden="true" style={{ display: 'inline-flex', verticalAlign: 'middle', marginLeft: '6px' }}><TbArrowRight /></span>
            </Link>
            <a
              className="btn btn--ghost-light btn--lg"
              href={whatsappLink(`Olá! Quero conversar antes de começar no ${site.name}.`)}
              target="_blank"
              rel="noreferrer"
            >
              {finalCta.ctaSecondary}
            </a>
          </div>
          <p className="final-cta__micro">{finalCta.microCopy}</p>
        </div>
      </div>
    </section>
  );
}
