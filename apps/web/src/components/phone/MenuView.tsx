import { useState } from 'react';
import { demo } from '../../data/content';
import { brl } from '../../lib/format';
import { CategoryGrid } from './CategoryGrid';
import { ProductRow, countInList } from './ProductRow';
import { getImageUrl } from '../../lib/api';
import { promotionParts } from './types';
import type { CategoryItem, OrderItem, PreviewProduct, PreviewPromotion } from './types';

type Props = {
  products: PreviewProduct[];
  promotions?: PreviewPromotion[];
  cart: OrderItem[];
  interactive: boolean;
  onAddToCart: (product: PreviewProduct, qty?: number) => void;
  onRemoveFromCart: (productName: string) => void;
  onOpenCheckout: () => void;
  isCheckoutOpen?: boolean;
  categories?: CategoryItem[];
  appName?: string;
  primaryColor?: string;
  theme?: 'claro' | 'escuro';
  logoUrl?: string | null;
};

export function MenuView({
  products,
  promotions = [],
  cart,
  interactive,
  onAddToCart,
  onRemoveFromCart,
  onOpenCheckout,
  isCheckoutOpen,
  categories = [],
}: Props) {
  const copy = demo.preview;
  const [expanded, setExpanded] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<CategoryItem | null>(null);

  const cartTotal = cart.reduce((sum, item) => sum + item.price, 0);
  const showcaseTotal = products.reduce((sum, item) => sum + item.price, 0);

  const featured = products.filter((product) => product.isFeatured);

  const activePromotions = promotions.filter((p) => p.active);
  const promotionAvailable = (promo: PreviewPromotion) => {
    const ids = promo.type === 'combo' ? promo.comboItems : [promo.targetProductId].filter(Boolean) as string[];
    return ids.length > 0 && ids.every((id) => products.some((product) => product.id === id && product.available !== false));
  };

  let categoryProducts: PreviewProduct[] = [];
  if (selectedCategory) {
    if (selectedCategory.name === 'Combos e Promoções') {
      categoryProducts = activePromotions.map((promo) => {
        const targetProd = promo.targetProductId ? products.find((p) => p.id === promo.targetProductId) : null;
        return {
          id: promo._id,
          name: promo.name,
          description: promo.description,
          price: promo.promotionalPrice,
          originalPrice: targetProd ? targetProd.price : undefined,
          imageUrl: targetProd?.imageUrl || null,
          iconName: targetProd?.iconName || 'Star',
          category: 'Combos e Promoções',
          isPromo: true,
          available: promotionAvailable(promo),
          components: promotionParts(promo, products),
        };
      });
    } else {
      categoryProducts = products.filter(
        (product) => (product.category || copy.uncategorized) === selectedCategory.name
      );
    }
  }

  const displayCategories = [...categories];
  if (activePromotions.length > 0) {
    let firstImage = null;
    for (const p of activePromotions) {
      if (p.targetProductId) {
        const prod = products.find((item) => item.id === p.targetProductId);
        if (prod?.imageUrl) {
          firstImage = prod.imageUrl;
          break;
        }
      }
    }

    displayCategories.unshift({
      _id: 'promo-cat-dyn',
      name: 'Combos e Promoções',
      image: firstImage,
      itemCount: activePromotions.length,
    });
  }

  const isEmpty = products.length === 0 && displayCategories.length === 0;

  return (
    <>
      <div className="phone__body">
        <p className="phone__role">
          <span aria-hidden="true">{copy.roleStrip.menu.icon}</span>
          {copy.roleStrip.menu.text}
        </p>

        {isEmpty && (
          <div className="phone__empty">
            <span>🍽️</span>
            <p>Seu cardápio aparece aqui assim que você cadastrar o primeiro item.</p>
          </div>
        )}

        {selectedCategory ? (
          <section className="cat-view">
            <button type="button" className="cat-back" onClick={() => setSelectedCategory(null)}>
              <span aria-hidden="true">←</span> {copy.categoryBack}
            </button>

            <header className="cat-header">
              <span className="cat-header__media">
                {selectedCategory.image ? (
                  <img src={getImageUrl(selectedCategory.image) || undefined} alt="" />
                ) : (
                  <span aria-hidden="true">🍽️</span>
                )}
              </span>
              <span className="cat-header__text">
                <strong>{selectedCategory.name}</strong>
                <small>{copy.categoryCount(categoryProducts.length)}</small>
              </span>
            </header>

            {categoryProducts.length === 0 ? (
              <p className="cat-empty">{copy.categoryEmpty}</p>
            ) : (
              <ul className="phone__list">
                {categoryProducts.map((product, index) => (
                  <ProductRow
                    key={product.id ?? `${product.name}-${index}`}
                    product={product}
                    quantity={countInList(cart, product.name)}
                    interactive={interactive}
                    onAdd={onAddToCart}
                    onRemove={onRemoveFromCart}
                  />
                ))}
              </ul>
            )}
          </section>
        ) : (
          <>
            {activePromotions.length > 0 && (
              <section className="cat-section">
                <div className="phone__section-title">
                  <span>Promocionais</span>
                  <span className="phone__section-count">{activePromotions.length}</span>
                </div>

                <ul className="phone__list">
                  {activePromotions.map((promo, index) => {
                    const originalTotal =
                      promo.type === 'discount'
                        ? products.find((p) => p.id === promo.targetProductId)?.price || 0
                        : promo.comboItems.reduce(
                            (sum, id) => sum + (products.find((p) => p.id === id)?.price || 0),
                            0
                          );

                    const mockProduct: PreviewProduct = {
                      id: promo._id,
                      name: promo.name,
                      description: promo.description || (promo.type === 'combo' ? 'Combo especial' : 'Desconto único'),
                      price: promo.promotionalPrice,
                      originalPrice: originalTotal > promo.promotionalPrice ? originalTotal : undefined,
                      iconName: promo.type === 'combo' ? 'package' : 'tag',
                      isPromo: true,
                      available: promotionAvailable(promo),
                      components: promotionParts(promo, products),
                    };

                    return (
                      <ProductRow
                        key={promo._id || `promo-${index}`}
                        product={mockProduct}
                        quantity={countInList(cart, mockProduct.name)}
                        interactive={interactive}
                        onAdd={onAddToCart}
                        onRemove={onRemoveFromCart}
                      />
                    );
                  })}
                </ul>
              </section>
            )}

            {featured.length > 0 && (
              <section className="cat-section">
                <div className="phone__section-title">
                  <span>{copy.featuredTitle}</span>
                  <span className="phone__section-count">{copy.categoryCount(featured.length)}</span>
                </div>

                <ul className="phone__list">
                  {featured.map((product, index) => (
                    <ProductRow
                      key={product.id ?? `${product.name}-featured-${index}`}
                      product={product}
                      quantity={countInList(cart, product.name)}
                      interactive={interactive}
                      onAdd={onAddToCart}
                      onRemove={onRemoveFromCart}
                    />
                  ))}
                </ul>
              </section>
            )}

            {displayCategories.length > 0 && (
              <section className="cat-section">
                <div className="phone__section-title">
                  <span>{copy.categoriesTitle}</span>
                  <span className="phone__section-count">{displayCategories.length}</span>
                </div>
                <p className="cat-hint">{copy.categoriesHint}</p>

                <CategoryGrid categories={displayCategories} products={products} onSelect={setSelectedCategory} />
              </section>
            )}
          </>
        )}
      </div>

      {interactive
        ? !isCheckoutOpen &&
          cart.length > 0 && (
            <div className={`phone__cartbar ${expanded ? 'is-expanded' : ''}`}>
              {expanded && (
                <ul className="phone__cartbar-items">
                  {cart.map((item, index) => (
                    <li key={`${item.name}-${index}`}>
                      <span>{item.name}</span>
                      <span className="phone__cartbar-right">
                        {brl(item.price)}
                        <button
                          type="button"
                          className="phone__cartbar-remove"
                          onClick={() => onRemoveFromCart(item.name)}
                          aria-label={`Remover ${item.name} da sacola`}
                        >
                          ✕
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <button
                type="button"
                className="phone__cartbar-toggle"
                onClick={() => setExpanded((open) => !open)}
                aria-expanded={expanded}
                aria-label={expanded ? copy.cartCollapse : copy.cartExpand}
              >
                <span className="phone__cartbar-info">
                  <strong>
                    {copy.cartLabel} · {cart.length}
                  </strong>
                  <small>{expanded ? copy.cartCollapse : copy.cartExpand}</small>
                </span>
                <span className="phone__cartbar-total">{brl(cartTotal)}</span>
                <span className={`phone__chevron ${expanded ? 'is-down' : ''}`} aria-hidden="true" />
              </button>

              <button type="button" className="phone__cartbar-cta" onClick={onOpenCheckout}>
                {copy.checkoutOpen} →
              </button>
            </div>
          )
        : products.length > 0 && (
            <div className="phone__cart">
              <span>
                {copy.cartLabel} · {products.length}
              </span>
              <strong>{brl(showcaseTotal)}</strong>
            </div>
          )}
    </>
  );
}
