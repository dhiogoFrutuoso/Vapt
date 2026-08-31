import { demo } from '../../data/content';
import { getImageUrl } from '../../lib/api';
import type { CategoryItem, PreviewProduct } from './types';

type Props = {
  categories: CategoryItem[];
  products: PreviewProduct[];
  onSelect: (category: CategoryItem) => void;
  /** Variação compacta, usada dentro da comanda da equipe. */
  compact?: boolean;
};

/**
 * Hub de categorias: a grade que o cliente (e o garçom) vê antes de entrar
 * numa categoria. É o mesmo componente nos dois lugares de propósito —
 * a navegação precisa ser idêntica em qualquer aba do aplicativo.
 */
export function CategoryGrid({ categories, products, onSelect, compact = false }: Props) {
  const copy = demo.preview;

  return (
    <div className={`cat-grid ${compact ? 'cat-grid--compact' : ''}`}>
      {categories.map((category) => {
        const count = category.itemCount !== undefined 
          ? category.itemCount 
          : products.filter((product) => (product.category || copy.uncategorized) === category.name).length;

        return (
          <button
            type="button"
            key={category._id}
            className="cat-card"
            onClick={() => onSelect(category)}
            aria-label={`Abrir a categoria ${category.name}`}
          >
            <span className="cat-card__media">
              <div className="phone__category-thumb">
                {category.image ? (
                  <img src={getImageUrl(category.image) || undefined} alt="" />
                ) : (
                  <span className="cat-card__placeholder" aria-hidden="true">
                    🍽️
                  </span>
                )}
              </div>
              <span className="cat-card__badge">{copy.categoryCount(count)}</span>
            </span>

            <span className="cat-card__body">
              <strong className="cat-card__name">{category.name}</strong>
              <span className="cat-card__go" aria-hidden="true">
                Ver itens →
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
