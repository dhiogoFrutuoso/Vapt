import { useState } from 'react';
import { demo } from '../../data/content';
import { brl } from '../../lib/format';
import { CategoryGrid } from './CategoryGrid';
import { ProductRow, countInList } from './ProductRow';
import { getImageUrl } from '../../lib/api';
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

/**
 * Aba "Cliente": o cardápio como o cliente final vê.
 *
 * Navegação em dois níveis (drill-down):
 *   1. hub  -> Destaques + grade de categorias
 *   2. categoria aberta -> cabeçalho com o nome, botão de voltar e os produtos
 *
 * O botão de voltar fica FIXO no topo da lista, com aparência de botão de verdade:
 * na versão anterior ele era um texto sem contraste e ficava invisível no tema claro.
 */
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
  
  const activePromotions = promotions.filter(p => p.active);
  
  let categoryProducts: PreviewProduct[] = [];
  if (selectedCategory) {
    if (selectedCategory.name === 'Combos e Promoções') {
      categoryProducts = activePromotions.map(promo => {
        const targetProd = promo.targetProductId ? products.find(p => p.id === promo.targetProductId) : null;
        // Se a promoção tiver targetProduct, pegamos a imagem/icon dele. Se não (tipo combo genérico), pode ficar null.
        return {
          id: promo._id,
          name: promo.name,
          description: promo.description,
          price: promo.promotionalPrice,
          originalPrice: targetProd ? targetProd.price : undefined,
          imageUrl: targetProd?.imageUrl || null,
          iconName: targetProd?.iconName || 'Star',
          category: 'Combos e Promoções',
          isPromo: true
        };
      });
    } else {
      categoryProducts = products.filter((product) => (product.category || copy.uncategorized) === selectedCategory.name);
    }
  }

  const displayCategories = [...categories];
  if (activePromotions.length > 0) {
    // Busca a primeira imagem disponível entre as promoções ativas para ser a thumbnail
    let firstImage = null;
    for (const p of activePromotions) {
      if (p.targetProductId) {
        const prod = products.find(prod => prod.id === p.targetProductId);
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
      itemCount: activePromotions.length
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
          /* ------------------- Nível 2: categoria aberta ------------------- */
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
          /* --------------------- Nível 1: hub do cardápio ------------------- */
          <>
            {activePromotions.length > 0 && (
              <section className="cat-section">
                <div className="phone__section-title">
                  <span style={{ color: 'var(--ep-primary, #FF6B2C)' }}>🔥 Promocionais</span>
                  <span className="phone__section-count">{activePromotions.length}</span>
                </div>

                <ul className="phone__list">
                  {activePromotions.map((promo, index) => {
                    const originalTotal = promo.type === 'discount'
                      ? (products.find(p => p.id === promo.targetProductId)?.price || 0)
                      : promo.comboItems.reduce((sum, id) => sum + (products.find(p => p.id === id)?.price || 0), 0);
                    
                    const pct = originalTotal > 0 ? Math.round(((originalTotal - promo.promotionalPrice) / originalTotal) * 100) : 0;
                    
                    // Create a mock product so we can use ProductRow
                    const mockProduct: PreviewProduct = {
                      id: promo._id,
                      name: promo.name,
                      description: promo.description || (promo.type === 'combo' ? 'Combo Especial' : 'Desconto Único'),
                      price: promo.promotionalPrice,
                      iconName: promo.type === 'combo' ? 'package' : 'tag',
                    };

                    return (
                      <li className="phone__item" key={promo._id || `promo-${index}`}>
                        <div className="phone__item-main">
                          <div className="phone__item-text" style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                              <strong style={{ color: 'var(--ep-primary, #FF6B2C)' }}>{promo.name}</strong>
                              {pct > 0 && (
                                <span style={{
                                  backgroundColor: 'var(--ep-primary, #FF6B2C)', color: '#fff',
                                  fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 800
                                }}>
                                  -{pct}% OFF
                                </span>
                              )}
                            </div>
                            {mockProduct.description && <p>{mockProduct.description}</p>}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                              {originalTotal > promo.promotionalPrice && (
                                <span style={{ textDecoration: 'line-through', opacity: 0.6, fontSize: '0.85rem' }}>
                                  {brl(originalTotal)}
                                </span>
                              )}
                              <span className="phone__price" style={{ color: 'var(--ep-primary, #FF6B2C)', fontSize: '1.1rem' }}>
                                {brl(promo.promotionalPrice)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {interactive &&
                          (countInList(cart, mockProduct.name) === 0 ? (
                            <button type="button" className="phone__add-btn" onClick={() => onAddToCart(mockProduct)}>
                              <span aria-hidden="true">+</span> {copy.addToCart}
                            </button>
                          ) : (
                            <div className="phone__stepper">
                              <button type="button" onClick={() => onRemoveFromCart(mockProduct.name)} aria-label={`Tirar um ${mockProduct.name}`}>−</button>
                              <span><strong>{countInList(cart, mockProduct.name)}</strong> {copy.addedToCart}</span>
                              <button type="button" onClick={() => onAddToCart(mockProduct)} aria-label={`Adicionar mais um ${mockProduct.name}`}>+</button>
                            </div>
                          ))
                        }
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {featured.length > 0 && (
              <section className="cat-section">
                <div className="phone__section-title">
                  <span>⭐ {copy.featuredTitle}</span>
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

      {/* ------------------------- Barra da sacola ------------------------- */}
      {interactive
        ? !isCheckoutOpen && cart.length > 0 && (
            <div className={`phone__cartbar ${expanded ? 'is-expanded' : ''}`}>
              {expanded && (
                <ul className="phone__cartbar-items">
                  {cart.map((item, index) => (
                    <li key={`${item.name}-${index}`}>
                      <span>{item.name}</span>
                      <span className="phone__cartbar-right">
                        {brl(item.price)}
                        {/* O cliente precisa poder tirar o que colocou sem esvaziar tudo. */}
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
