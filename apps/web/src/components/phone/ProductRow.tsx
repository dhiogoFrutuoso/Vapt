import { demo } from '../../data/content';
import { brl } from '../../lib/format';
import { IconRenderer } from '../IconRenderer';
import type { OrderItem, PreviewProduct } from './types';

type Props = {
  product: PreviewProduct;
  quantity: number;
  interactive: boolean;
  onAdd: (product: PreviewProduct, qty?: number) => void;
  onRemove: (productName: string) => void;
};

export function ProductRow({ product, quantity, interactive, onAdd, onRemove }: Props) {
  const copy = demo.preview;

  return (
    <li className="phone__item">
      <div className="phone__item-main">
        <div className="phone__item-text">
          <strong>
            {product.name}
            {product.isPromo && <span className="cash-badge is-order-feito" style={{ marginLeft: 6 }}>Oferta</span>}
          </strong>
          {product.description && <p>{product.description}</p>}
          <span className="phone__price">
            {product.originalPrice != null && product.originalPrice > product.price && (
              <s style={{ opacity: 0.5, fontSize: '0.85em', marginRight: 6, fontWeight: 500 }}>{brl(product.originalPrice)}</s>
            )}
            {brl(product.price)}
          </span>
        </div>

        <div className="phone__thumb">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.name} loading="lazy" />
          ) : (
            <span className="phone__product-icon">
              <IconRenderer name={product.iconName} size={32} />
            </span>
          )}
        </div>
      </div>

      {interactive &&
        (product.pricingType === 'weight' ? (
          <div className="phone__stepper">
            <input
              type="number"
              step="0.001"
              min="0.001"
              placeholder="Kg"
              id={`kg-${product.name}`}
              className="studio-input"
              style={{ minHeight: 36, padding: '4px 8px', textAlign: 'center' }}
            />
            <span />
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById(`kg-${product.name}`) as HTMLInputElement;
                if (el && el.value) onAdd(product, parseFloat(el.value));
              }}
            >
              +
            </button>
          </div>
        ) : quantity === 0 ? (
          <button type="button" className="phone__add-btn" onClick={() => onAdd(product)}>
            <span aria-hidden="true">+</span> {copy.addToCart}
          </button>
        ) : (
          <div className="phone__stepper">
            <button type="button" onClick={() => onRemove(product.name)} aria-label={`Tirar um ${product.name}`}>
              −
            </button>
            <span>
              <strong>{quantity}</strong> {copy.addedToCart}
            </span>
            <button type="button" onClick={() => onAdd(product)} aria-label={`Adicionar mais um ${product.name}`}>
              +
            </button>
          </div>
        ))}
    </li>
  );
}

export function countInList(items: OrderItem[], productName: string): number {
  return items.filter((item) => item.name === productName).length;
}
