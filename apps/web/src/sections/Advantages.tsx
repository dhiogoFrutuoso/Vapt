import { Reveal } from '../components/Reveal';
import { SectionHeading } from '../components/SectionHeading';
import { advantages } from '../data/content';

export function Advantages() {
  return (
    <section className="advantages section" id="funcionalidades">
      <div className="container">
        <SectionHeading eyebrow={advantages.eyebrow} title={advantages.title} subtitle={advantages.subtitle} />

        <div className="advantages__grid">
          {advantages.cards.map((card, index) => (
            <Reveal as="article" key={card.id} delay={index * 110} className="feature-card">
              <div className="feature-card__top">
                <span className="feature-card__icon" aria-hidden="true">
                  {card.icon}
                </span>
                <span className="feature-card__badge">{card.badge}</span>
              </div>

              <h3>{card.title}</h3>
              <p className="feature-card__text">{card.text}</p>

              <ul className="feature-card__list">
                {card.bullets.map((bullet) => (
                  <li key={bullet}>
                    <span aria-hidden="true">✓</span>
                    {bullet}
                  </li>
                ))}
              </ul>

              <p className="feature-card__footnote">{card.footnote}</p>
            </Reveal>
          ))}
        </div>

      </div>
    </section>
  );
}
