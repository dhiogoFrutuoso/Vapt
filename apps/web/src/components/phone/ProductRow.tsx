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

/**
 * Item do cardápio na visão do cliente.
 * Extraído para um componente próprio porque a mesma linha aparece em três
 * lugares (destaques, categoria aberta e busca) — antes era copiada e colada.
 */
export function ProductRow({ product, quantity, interactive, onAdd, onRemove }: Props) {
  const copy = demo.preview;

  return (
    <li className="phone__item">
      <div className="phone__item-main">
        <div className="phone__item-text">
          <strong>
            {product.name}
            {product.isPromo && <span style={{ backgroundColor: '#FF6B2C', color: '#fff', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', marginLeft: '6px', fontWeight: 800, verticalAlign: 'middle', letterSpacing: '0.02em' }}>OFERTA</span>}
          </strong>
          {product.description && <p>{product.description}</p>}
          <span className="phone__price">
            {product.originalPrice != null && product.originalPrice > product.price && (
              <s style={{ opacity: 0.5, fontSize: '0.85em', marginRight: '6px', fontWeight: 500 }}>{brl(product.originalPrice)}</s>
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
          <div className="phone__stepper" style={{ gap: '4px' }}>
            <input type="number" step="0.001" min="0.001" placeholder="Kg" id={`kg-${product.name}`} style={{ width: '60px', textAlign: 'center', border: '1px solid #ccc', borderRadius: '4px' }} />
            <button type="button" onClick={() => {
              let el = document.getElementById(`kg-${product.name}`) as HTMLInputElement;
              if(el && el.value) onAdd(product, parseFloat(el.value));
            }} style={{ background: 'var(--ep-primary, #FF6B2C)', color: '#fff', padding: '4px 8px', borderRadius: '4px' }}>Add</button>
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

/** Conta quantas vezes um produto aparece numa lista de itens (carrinho ou comanda). */
export function countInList(items: OrderItem[], productName: string): number {
  return items.filter((item) => item.name === productName).length;
}
