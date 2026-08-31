import type { CSSProperties, ReactNode } from 'react';
import { useReveal } from '../hooks/useReveal';

type Props = {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'article';
};

export function Reveal({ children, delay = 0, className = '', as: Tag = 'div' }: Props) {
  const { ref, visible } = useReveal<HTMLDivElement>();
  const style = { '--reveal-delay': `${delay}ms` } as CSSProperties;

  return (
    <Tag
      ref={ref as never}
      style={style}
      className={`reveal ${visible ? 'is-visible' : ''} ${className}`.trim()}
    >
      {children}
    </Tag>
  );
}
