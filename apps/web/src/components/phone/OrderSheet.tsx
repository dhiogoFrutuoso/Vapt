import { useEffect, useState } from 'react';
import { demo } from '../../data/content';
import { brl } from '../../lib/format';
import { CategoryGrid } from './CategoryGrid';
import { MoneyInput } from './MoneyInput';
import { IconRenderer } from '../IconRenderer';
import { useConfirm } from '../ConfirmModal';
import { sumItems, type CategoryItem, type OrderItem, type PaymentMethod, type PaymentSplit, type PaymentSplitItem, type PreviewProduct, type TableStatus } from './types';

/** Comanda normalizada: mesa e retirada usam a mesma tela. */
export type Ticket = {
  id: string;
  title: string;
  status: TableStatus;
  items: OrderItem[];
  /** 0.1 na mesa (serviço), 0 na retirada. */
  serviceFeeRate: number;
};

type Props = {
  ticket: Ticket;
  products: PreviewProduct[];
  promotions?: import('./types').PreviewPromotion[];
  categories?: CategoryItem[];
  onAddItem: (item: OrderItem) => void;
  onRemoveItem: (index: number) => void;
  /** Avança de "ocupada" para "fechando". */
  onRequestPayment: () => void;
  /** Fecha de vez, com as formas de pagamento escolhidas (split). */
  onConfirmPayment: (payments: PaymentSplit) => void;
  onCancelOrder: () => void;
  onDismiss: () => void;
};

/**
 * Comanda de mesa ou de retirada.
 *
 * "Lançar item" abre o cardápio com a MESMA navegação da aba do cliente:
 * destaques, grade de categorias e drill-down com botão de voltar.
 *
 * O fechamento tem dois toques de propósito: "Fechar conta" marca a comanda
 * como fechando (o cliente ainda vai pagar) e só então aparece a escolha da
 * forma de pagamento, que é o que entra no caixa.
 */
export function OrderSheet({
  ticket,
  products,
  promotions = [],
  categories = [],
  onAddItem,
  onRemoveItem,
  onRequestPayment,
  onConfirmPayment,
  onCancelOrder,
  onDismiss,
}: Props) {
  const copy = demo.preview;
  const [mode, setMode] = useState<'comanda' | 'cardapio'>('comanda');
  const [selectedCategory, setSelectedCategory] = useState<CategoryItem | null>(null);
  const { confirm, ConfirmElement } = useConfirm();

  const items = ticket.items;
  const subtotal = sumItems(items);
  const service = subtotal * ticket.serviceFeeRate;
  const total = subtotal + service;

  /* ---- Split payment state ---- */
  const [splits, setSplits] = useState<PaymentSplitItem[]>([{ method: 'pix', amount: total }]);
  const [isSplitMode, setIsSplitMode] = useState(false);

  const splitsTotal = splits.reduce((s, p) => s + p.amount, 0);
  const remaining = Math.max(0, total - splitsTotal);
  const isValid = Math.abs(remaining) < 0.01 && splits.every(p => p.amount > 0);

  function addSplit() {
    setSplits(prev => [...prev, { method: 'dinheiro', amount: remaining > 0 ? parseFloat(remaining.toFixed(2)) : 0 }]);
  }

  function removeSplit(index: number) {
    setSplits(prev => prev.filter((_, i) => i !== index));
  }
  function updateSplit(index: number, patch: Partial<PaymentSplitItem>) {
    setSplits(prev => prev.map((item, i) => i === index ? { ...item, ...patch } : item));
  }

  function handleMethodToggle(method: PaymentMethod) {
    if (isSplitMode) {
      const exists = splits.some(s => s.method === method);
      if (exists) {
        if (splits.length > 1) setSplits(prev => prev.filter(s => s.method !== method));
      } else {
        setSplits(prev => [...prev, { method, amount: remaining > 0 ? parseFloat(remaining.toFixed(2)) : 0 }]);
      }
    } else {
      setSplits([{ method, amount: total }]);
    }
  }

  useEffect(() => {
    if (total > 0 && splits.length === 0) {
      setSplits([{ method: 'pix', amount: total }]);
    }
  }, [total]);

  const featured = products.filter((product) => product.isFeatured);
  const categoryProducts = selectedCategory
    ? products.filter((product) => (product.category || copy.uncategorized) === selectedCategory.name)
    : [];

  const fallbackGroups = Array.from(new Set(products.map((p) => p.category || copy.uncategorized)));

  function renderPickerRow(product: PreviewProduct, index: number) {
    const quantity = items.filter((item) => item.name === product.name).length;

    return (
      <li key={product.id ?? `${product.name}-${index}`}>
        <button
          type="button"
          onClick={() => onAddItem({ name: product.name, price: product.price })}
          aria-label={`Lançar ${product.name} em ${ticket.title}`}
        >
          <span className="phone__picker-icon" aria-hidden="true">
            {product.imageUrl ? <img src={product.imageUrl} alt="" /> : <IconRenderer name={product.iconName} size={20} />}
          </span>
          <span className="phone__picker-text">
            <strong>{product.name}</strong>
            {product.description && <small>{product.description}</small>}
          </span>
          <span className="phone__picker-price">
            {brl(product.price)}
            {quantity > 0 && <em>{quantity}x lançado</em>}
          </span>
        </button>
      </li>
    );
  }

  function handleCancel() {
    confirm({
      title: 'Cancelar Pedido',
      message: copy.cancelOrderConfirm,
      confirmText: 'Cancelar',
      isDestructive: true,
      onConfirm: () => onCancelOrder()
    });
  }

  return (
    <div className="phone__sheet" role="dialog" aria-label={`Comanda · ${ticket.title}`}>
      <div className="phone__sheet-head">
        <strong>
          {mode === 'comanda' ? copy.orderTitle : copy.pickerTitle} · {ticket.title}
        </strong>
        <button type="button" onClick={onDismiss} aria-label="Fechar comanda">
          ✕
        </button>
      </div>

      {/* ----------------------- Cardápio (lançar item) ----------------------- */}
      {mode === 'cardapio' && (
        <>
          {products.length === 0 ? (
            <p className="phone__sheet-empty">{copy.pickerEmpty}</p>
          ) : selectedCategory ? (
            <div className="phone__picker-scroll">
              <button type="button" className="cat-back cat-back--sheet" onClick={() => setSelectedCategory(null)}>
                <span aria-hidden="true">←</span> {copy.categoryBack}
              </button>

              <header className="cat-header cat-header--sheet">
                <span className="cat-header__media">
                  {selectedCategory.image ? (
                    <img src={`/api/images/${selectedCategory.image}`} alt="" />
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
                <ul className="phone__picker phone__picker--flat">{categoryProducts.map(renderPickerRow)}</ul>
              )}
            </div>
          ) : (
            <div className="phone__picker-scroll">
              {promotions.length > 0 && (
                <div className="phone__picker-group">
                  <strong className="phone__picker-grouptitle" style={{ color: 'var(--ep-primary, #FF6B2C)' }}>🔥 Promocionais</strong>
                  <ul className="phone__picker phone__picker--flat">
                    {promotions.map((promo, index) => {
                      const originalTotal = promo.type === 'discount'
                        ? (products.find(p => p.id === promo.targetProductId)?.price || 0)
                        : promo.comboItems.reduce((sum, id) => sum + (products.find(p => p.id === id)?.price || 0), 0);
                      
                      const pct = originalTotal > 0 ? Math.round(((originalTotal - promo.promotionalPrice) / originalTotal) * 100) : 0;
                      
                      const quantity = items.filter((item) => item.name === promo.name).length;

                      return (
                        <li key={promo._id ?? `promo-${index}`}>
                          <button
                            type="button"
                            onClick={() => onAddItem({ name: promo.name, price: promo.promotionalPrice })}
                            aria-label={`Lançar ${promo.name} em ${ticket.title}`}
                          >
                            <span className="phone__picker-icon" aria-hidden="true" style={{ fontSize: '1.2rem' }}>
                              {promo.type === 'combo' ? '📦' : '🏷️'}
                            </span>
                            <span className="phone__picker-text">
                              <strong style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ color: 'var(--ep-primary, #FF6B2C)' }}>{promo.name}</span>
                                {pct > 0 && (
                                  <span style={{ backgroundColor: 'var(--ep-primary, #FF6B2C)', color: '#fff', fontSize: '0.65rem', padding: '2px 4px', borderRadius: '4px', fontWeight: 800 }}>-{pct}% OFF</span>
                                )}
                              </strong>
                              {promo.description && <small>{promo.description}</small>}
                            </span>
                            <span className="phone__picker-price">
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.2 }}>
                                {originalTotal > promo.promotionalPrice && (
                                  <span style={{ textDecoration: 'line-through', opacity: 0.6, fontSize: '0.75rem' }}>{brl(originalTotal)}</span>
                                )}
                                <span style={{ color: 'var(--ep-primary, #FF6B2C)', fontWeight: 700 }}>{brl(promo.promotionalPrice)}</span>
                              </div>
                              {quantity > 0 && <em>{quantity}x lançado</em>}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {featured.length > 0 && (
                <div className="phone__picker-group">
                  <strong className="phone__picker-grouptitle">⭐ {copy.featuredTitle}</strong>
                  <ul className="phone__picker phone__picker--flat">{featured.map(renderPickerRow)}</ul>
                </div>
              )}

              {categories.length > 0 ? (
                <div className="phone__picker-group">
                  <strong className="phone__picker-grouptitle">{copy.categoriesTitle}</strong>
                  <CategoryGrid
                    categories={categories}
                    products={products}
                    onSelect={setSelectedCategory}
                    compact
                  />
                </div>
              ) : (
                fallbackGroups.map((group) => {
                  const groupProducts = products.filter((p) => (p.category || copy.uncategorized) === group);
                  if (groupProducts.length === 0) return null;

                  return (
                    <div className="phone__picker-group" key={group}>
                      <strong className="phone__picker-grouptitle">{group}</strong>
                      <ul className="phone__picker phone__picker--flat">{groupProducts.map(renderPickerRow)}</ul>
                    </div>
                  );
                })
              )}
            </div>
          )}

          <button
            type="button"
            className="phone__sheet-btn is-block"
            onClick={() => {
              setMode('comanda');
              setSelectedCategory(null);
            }}
          >
            ← {copy.pickerBack}
          </button>
        </>
      )}

      {/* -------------------------- A comanda --------------------------- */}
      {mode === 'comanda' && (
        <>
          <ul className="phone__sheet-items">
            {items.length === 0 && <li className="is-empty">{copy.orderEmpty}</li>}
            {items.map((item, index) => (
              <li key={`${item.name}-${index}`}>
                <span>{item.name}</span>
                <span className="phone__sheet-right">
                  {brl(item.price)}
                  <button type="button" onClick={() => onRemoveItem(index)} aria-label={`Remover ${item.name}`}>
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ul>

          <div className="phone__sheet-total">
            <span>Subtotal</span>
            <span>{brl(subtotal)}</span>
          </div>
          {ticket.serviceFeeRate > 0 && (
            <div className="phone__sheet-total">
              <span>{copy.serviceFee} ({Math.round(ticket.serviceFeeRate * 100)}%)</span>
              <span>{brl(service)}</span>
            </div>
          )}
          <div className="phone__sheet-total is-final">
            <span>Total</span>
            <strong>{brl(total)}</strong>
          </div>

          {ticket.status === 'pagamento' ? (
            <div className="sheet-pay">
              <span className="sheet-pay__title">{copy.choosePayment}</span>

              {!isSplitMode ? (
                <>
                  <div className="phone__pay">
                    {copy.payments.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={isSplitMode ? (splits.some(s => s.method === option.value) ? 'is-active' : '') : (splits[0].method === option.value ? 'is-active' : '')}
                        onClick={() => handleMethodToggle(option.value as PaymentMethod)}
                      >
                        <span aria-hidden="true" style={{ fontSize: '1.2rem', marginBottom: '4px' }}>
                          <IconRenderer name={option.iconName as string} />
                        </span>
                        {option.label}
                      </button>
                    ))}
                  </div>
                  {splits.length === 1 && splits[0].method === 'dinheiro' && (
                    <div className="phone__field" style={{ marginTop: '12px' }}>
                      <label htmlFor="fw-ordersheet-change">{copy.changeLabel}</label>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#666', fontSize: '1rem', pointerEvents: 'none', zIndex: 2 }}>R$</span>
                        <MoneyInput
                          value={splits[0].amount}
                          onChange={(val) => setSplits([{ method: 'dinheiro', amount: val }])}
                        />
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    className="phone__split-toggle"
                    onClick={() => setIsSplitMode(true)}
                  >
                    Vou pagar com mais de um meio de pagamento (Ex: uma parte pix, e o resto em dinheiro)
                  </button>
                </>
              ) : (
                <div className="split-pay">
                  {splits.map((split, index) => (
                    <div key={index} className="split-pay__row">
                      <select
                        className="split-pay__select"
                        value={split.method}
                        onChange={(e) => updateSplit(index, { method: e.target.value as PaymentMethod })}
                      >
                        <option value="pix">PIX</option>
                        <option value="cartao">Cartão</option>
                        <option value="dinheiro">Dinheiro</option>
                      </select>
                      <div className="split-pay__input-wrapper">
                        <span className="split-pay__input-prefix">R$</span>
                        <MoneyInput
                          value={split.amount}
                          onChange={(val) => updateSplit(index, { amount: val })}
                        />
                      </div>
                      {splits.length > 1 && (
                        <button
                          type="button"
                          className="split-pay__remove"
                          onClick={() => removeSplit(index)}
                          title="Remover"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}

                  {remaining > 0.01 && (
                    <p style={{ fontSize: '0.8rem', color: '#f59e0b', margin: '4px 0' }}>
                      Falta: {brl(remaining)}
                    </p>
                  )}
                  {splitsTotal > total + 0.01 && (
                    <p style={{ fontSize: '0.8rem', color: '#ef4444', margin: '4px 0' }}>
                      Excede o total em {brl(splitsTotal - total)}
                    </p>
                  )}

                  <div className="split-pay__actions">
                    <button
                      type="button"
                      className="split-pay__add-btn"
                      onClick={addSplit}
                    >
                      + Adicionar forma
                    </button>
                    <button
                      type="button"
                      className="split-pay__cancel-btn"
                      onClick={() => {
                        setIsSplitMode(false);
                        setSplits([{ method: 'pix', amount: total }]);
                      }}
                    >
                      Cancelar divisão
                    </button>
                  </div>
                </div>
              )}

              <button
                type="button"
                className="phone__sheet-btn is-primary is-block"
                onClick={() => onConfirmPayment(splits)}
                disabled={!isValid}
                style={{ marginTop: '8px' }}
              >
                {copy.confirmPayment}
              </button>
            </div>
          ) : (
            <div className="phone__sheet-actions">
              <button type="button" className="phone__sheet-btn" onClick={() => setMode('cardapio')}>
                + {copy.addItem}
              </button>
              <button
                type="button"
                className="phone__sheet-btn is-primary"
                onClick={onRequestPayment}
                disabled={subtotal === 0}
              >
                {copy.closeTable}
              </button>
            </div>
          )}

          <button type="button" className="sheet-cancel" onClick={handleCancel}>
            🗑 {copy.cancelOrder}
          </button>
        </>
      )}
      {ConfirmElement}
    </div>
  );
}
