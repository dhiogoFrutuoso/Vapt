import { Reveal } from '../components/Reveal';
import { trustStrip } from '../data/content';

export function TrustStrip() {
  return (
    <section className="trust">
      <div className="container">
        <h2 className="trust__title">{trustStrip.title}</h2>
        <div className="trust__grid">
          {trustStrip.items.map((item, index) => (
            <Reveal as="article" key={item.title} delay={index * 80} className="trust__card">
              <span aria-hidden="true">{item.icon}</span>
              <strong>{item.title}</strong>
              <p>{item.text}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
