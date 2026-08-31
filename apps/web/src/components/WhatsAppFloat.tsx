import { TbBrandWhatsapp } from 'react-icons/tb';
import { site, whatsappLink } from '../data/content';

export function WhatsAppFloat() {
  return (
    <a
      className="wa-float"
      href={whatsappLink(`Ol\u00e1! Vim pelo site do ${site.name} e quero montar o sistema do meu restaurante.`)}
      target="_blank"
      rel="noreferrer"
      aria-label="Falar com o suporte no WhatsApp"
    >
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <TbBrandWhatsapp size={26} />
      </span>
      <span>Falar com uma pessoa</span>
    </a>
  );
}
