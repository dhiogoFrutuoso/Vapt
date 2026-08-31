type Props = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: 'left' | 'center';
  tone?: 'light' | 'dark';
};

export function SectionHeading({ eyebrow, title, subtitle, align = 'center', tone = 'light' }: Props) {
  return (
    <header className={`section-heading section-heading--${align} section-heading--${tone}`}>
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h2>{title}</h2>
      {subtitle && <p>{subtitle}</p>}
    </header>
  );
}
