import { useState } from 'react';
import { SectionHeading } from '../components/SectionHeading';
import { TbPlus, TbMinus } from 'react-icons/tb';
import { faq } from '../data/content';

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="faq section" id="faq">
      <div className="container container--narrow">
        <SectionHeading eyebrow={faq.eyebrow} title={faq.title} />

        <ul className="faq__list">
          {faq.items.map((item, index) => {
            const isOpen = open === index;
            return (
              <li key={item.q} className={`faq__item ${isOpen ? 'is-open' : ''}`}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : index)}
                >
                  <span>{item.q}</span>
                  <em aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center' }}>
                    {isOpen ? <TbMinus /> : <TbPlus />}
                  </em>
                </button>
                <div className="faq__answer" hidden={!isOpen}>
                  <p>{item.a}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
