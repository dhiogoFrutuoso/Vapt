import { PhonePreview } from '../components/PhonePreview';
import { Reveal } from '../components/Reveal';
import { TbArrowRight } from 'react-icons/tb';
import { hero, site, whatsappLink } from '../data/content';

/** Mesas da vitrine do hero: estáticas, só para mostrar o app da equipe. */
const heroTables = hero.phoneDemo.tables.map((table, index) => ({
  ...table,
  id: `hero-${index}`,
}));

/** Entrega de exemplo, para a aba do entregador já nascer com conteúdo. */
const heroDeliveries = hero.phoneDemo.deliveries.map((order, index) => ({
  ...order,
  id: `hero-delivery-${index}`,
}));

export function Hero() {
  return (
    <section className="hero" id="topo">
      <div className="hero__glow" aria-hidden="true" />
      <div className="container hero__inner">
        <div className="hero__content">
          <Reveal>
            <span className="pill">
              <span className="pill__dot" /> {hero.eyebrow}
            </span>
          </Reveal>

          <Reveal delay={80}>
            <h1 className="hero__title">
              {hero.headlineTop} <mark>{hero.headlineHighlight}</mark> {hero.headlineBottom}
            </h1>
          </Reveal>

          <Reveal delay={160}>
            <p className="hero__subtitle">{hero.subheadline}</p>
          </Reveal>

          <Reveal delay={240}>
            <div className="hero__ctas">
              <a className="btn btn--primary btn--lg" href="#demonstracao">
                {hero.ctaPrimary}
                <span aria-hidden="true" style={{ display: 'inline-flex', verticalAlign: 'middle', marginLeft: '6px' }}><TbArrowRight /></span>
              </a>
              <a
                className="btn btn--ghost btn--lg"
                href={whatsappLink(
                  `Olá! Quero entender como o ${site.name} funciona para o meu restaurante.`
                )}
                target="_blank"
                rel="noreferrer"
              >
                {hero.ctaSecondary}
              </a>
            </div>
            <p className="hero__micro">{hero.microCopy}</p>
          </Reveal>

        </div>

        <Reveal delay={200} className="hero__visual">
          <div className="hero__phone-wrap">
            <PhonePreview
              storeName={hero.phoneDemo.storeName}
              tagline={hero.phoneDemo.tagline}
              brandColor="#FF6B2C"
              products={hero.phoneDemo.items}
              tables={heroTables}
              initialDeliveries={heroDeliveries}
              showRoomTab
              code="FW-8K2M4"
            />

            <div className="hero__card hero__card--code">
              <span className="hero__card-label">Código do restaurante</span>
              <strong>FW-8K2M4</strong>
              <p>A equipe digita isso no app e já está dentro.</p>
            </div>

            <div className="hero__card hero__card--order">
              <span className="hero__card-dot" />
              <div>
                <strong>Novo pedido · Mesa 7</strong>
                <p>2× Smash Duplo · R$ 65,80</p>
              </div>
            </div>
          </div>
        </Reveal>
      </div>

      <div className="container">
        <Reveal delay={120}>
          <dl className="hero__stats">
            {hero.stats.map((stat) => (
              <div key={stat.label}>
                <dt>{stat.value}</dt>
                <dd>{stat.label}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </section>
  );
}
