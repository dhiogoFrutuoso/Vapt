import { Reveal } from '../components/Reveal';
import { SectionHeading } from '../components/SectionHeading';
import { TbX } from 'react-icons/tb';
import { site, support, whatsappLink } from '../data/content';

/**
 * Suporte humanizado.
 *
 * Sem formulário: quem quer falar, fala agora. O card de conversa mostra como é
 * o atendimento e o botão logo abaixo abre o WhatsApp de verdade.
 */
export function Support() {
  return (
    <section className="support section" id="suporte">
      <div className="container">
        <SectionHeading eyebrow={support.eyebrow} title={support.title} subtitle={support.subtitle} />

        <div className="support__intro">
          {support.paragraphs.map((paragraph) => (
            <p key={paragraph.slice(0, 24)}>{paragraph}</p>
          ))}
        </div>

        <div className="support__grid">
          {support.pillars.map((pillar, index) => (
            <Reveal as="article" key={pillar.title} delay={index * 80} className="support__card">
              <span aria-hidden="true">{pillar.icon}</span>
              <strong>{pillar.title}</strong>
              <p>{pillar.text}</p>
            </Reveal>
          ))}
        </div>

        <div className="support__bottom">
          <Reveal className="support__norobots">
            <h3>{support.noRobots.title}</h3>
            <ul>
              {support.noRobots.items.map((item) => (
                <li key={item}>
                  <span aria-hidden="true">
                    <TbX />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={120} className="support__chat-wrap">
            <div className="support__chat">
              <div className="bubble bubble--them">
                <strong>Camila · VaptApp</strong>
                Oi, seu Marcos! Vi que o senhor subiu 8 fotos. Quer que eu organize por categoria?
              </div>
              <div className="bubble bubble--me">Quero sim, mas não sei mexer nisso</div>
              <div className="bubble bubble--them">
                Deixa comigo. Faço agora e te mando o print para o senhor aprovar.
              </div>
            </div>

            <a
              className="btn btn--whats btn--lg btn--block"
              href={whatsappLink(
                `Olá! Vim pelo site do ${site.name} e quero ajuda para montar o sistema do meu negócio.`
              )}
              target="_blank"
              rel="noreferrer"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20" fill="currentColor">
                <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.65.08-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.76-1.66-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.01-1.04 2.47s1.06 2.86 1.21 3.06c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35z" />
                <path d="M12.04 2.5c-5.23 0-9.48 4.25-9.48 9.48 0 1.67.44 3.3 1.27 4.74L2.5 21.5l4.9-1.28a9.44 9.44 0 0 0 4.64 1.2h.01c5.23 0 9.48-4.25 9.48-9.48 0-2.53-.99-4.91-2.78-6.7a9.42 9.42 0 0 0-6.7-2.78zm0 17.06h-.01a7.9 7.9 0 0 1-4.02-1.1l-.29-.17-2.91.76.78-2.84-.19-.29a7.87 7.87 0 0 1-1.21-4.21c0-4.35 3.54-7.88 7.89-7.88a7.83 7.83 0 0 1 5.57 2.31 7.83 7.83 0 0 1 2.31 5.58c0 4.35-3.54 7.84-7.92 7.84z" />
              </svg>
              {support.chatCta}
            </a>

            <p className="support__chat-hint">{support.chatCtaHint}</p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
