import { useState, useEffect, useMemo } from 'react';
import type { Product, Promotion, Category } from '../lib/api';
import { FiX, FiClock, FiCalendar, FiTag, FiBox, FiTrash2 } from 'react-icons/fi';

type PromotionsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (promo: Partial<Promotion>) => Promise<void>;
  products: Product[];
  categories: Category[];
  editingPromo?: Promotion | null;
};

export function PromotionsModal({ isOpen, onClose, onSave, products = [], categories = [], editingPromo }: PromotionsModalProps) {
  const [type, setType] = useState<'combo' | 'discount'>(editingPromo?.type || 'discount');
  const [name, setName] = useState(editingPromo?.name || '');
  const [description, setDescription] = useState(editingPromo?.description || '');
  const [promotionalPrice, setPromotionalPrice] = useState(editingPromo?.promotionalPrice?.toString() || '');
  const [targetProductId, setTargetProductId] = useState(editingPromo?.targetProductId || '');
  const [comboItems, setComboItems] = useState<{ productId: string; quantity: number }[]>(() => {
    const initial = editingPromo?.comboItems || [];
    const map = new Map<string, number>();
    initial.forEach((id: string) => map.set(id, (map.get(id) || 0) + 1));
    return Array.from(map.entries()).map(([productId, quantity]) => ({ productId, quantity }));
  });
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  
  // Re-calculates total when comboItems changes
  const comboTotal = useMemo(() => {
    let sum = 0;
    comboItems.forEach(item => {
      const p = products.find(prod => prod._id === item.productId);
      if (p) sum += p.price * item.quantity;
    });
    return sum;
  }, [comboItems, products]);



  useEffect(() => {
    if (type === 'combo' && comboTotal > 0 && !promotionalPrice) {
      // Seta como hint, ou se o usuário quiser preencher autmático:
      // setPromotionalPrice(comboTotal.toFixed(2));
    }
  }, [type, comboTotal, promotionalPrice]);
  
  const [durationMode, setDurationMode] = useState<'today' | '2days' | '1week' | 'custom'>(
    editingPromo?.expiresOnRegisterClose ? 'today' : 'custom'
  );
  const [customDate, setCustomDate] = useState<string>(
    editingPromo?.validUntil ? new Date(editingPromo.validUntil).toISOString().slice(0, 16) : ''
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tema Escuro (buscando variáveis nativas se houver, ou forçando via fallback)
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'auto';
    return () => { document.body.style.overflow = 'auto'; };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAddComboItem = (productId: string) => {
    setComboItems(current => {
      const existing = current.find(i => i.productId === productId);
      if (existing) {
        return current.map(i => i.productId === productId ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...current, { productId, quantity: 1 }];
    });
  };

  const handleRemoveComboItem = (productId: string) => {
    setComboItems(current => {
      const existing = current.find(i => i.productId === productId);
      if (!existing) return current;
      if (existing.quantity > 1) {
        return current.map(i => i.productId === productId ? { ...i, quantity: i.quantity - 1 } : i);
      }
      return current.filter(i => i.productId !== productId);
    });
  };

  const handleDeleteComboItem = (productId: string) => {
    setComboItems(current => current.filter(i => i.productId !== productId));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const price = parseFloat(promotionalPrice);
      if (isNaN(price)) throw new Error('Preço inválido.');
      if (!name.trim()) throw new Error('O nome é obrigatório.');

      let expiresOnRegisterClose = false;
      let validUntil: string | null = null;

      if (durationMode === 'today') expiresOnRegisterClose = true;
      else if (durationMode === '2days') validUntil = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
      else if (durationMode === '1week') validUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      else if (durationMode === 'custom' && customDate) validUntil = new Date(customDate).toISOString();

      await onSave({
        type,
        name: name.trim(),
        description: description.trim(),
        promotionalPrice: price,
        targetProductId: type === 'discount' ? targetProductId : undefined,
        comboItems: type === 'combo' ? comboItems.flatMap(item => Array(item.quantity).fill(item.productId)) : [],
        expiresOnRegisterClose,
        validUntil: validUntil || undefined,
        active: true,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar a promoção.');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '12px 14px',
    borderRadius: '8px',
    border: '1px solid var(--ep-border, #333)',
    backgroundColor: 'var(--ep-bg, #1e1e1e)',
    color: 'var(--ep-text, #fff)',
    fontSize: '0.95rem',
    outline: 'none'
  };

  const labelStyle = {
    display: 'block',
    fontSize: '0.85rem',
    fontWeight: 600,
    color: 'var(--ep-label, #aaa)',
    marginBottom: '6px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px'
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(4px)',
      zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'var(--ep-bg, #111)',
        color: 'var(--ep-text, #fff)',
        width: '100%',
        maxWidth: '560px',
        maxHeight: '90vh',
        borderRadius: '16px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        border: '1px solid var(--ep-border, #333)'
      }}>
        {/* HEADER */}
        <header style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--ep-border, #333)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>
            {editingPromo ? 'Editar Promoção' : 'Nova Promoção / Combo'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--ep-label, #aaa)', cursor: 'pointer', padding: '4px' }}
          >
            <FiX size={24} color="currentColor" />
          </button>
        </header>

        {/* BODY */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {error && (
            <div style={{ backgroundColor: '#ef444420', color: '#ef4444', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.9rem', fontWeight: 500 }}>
              {error}
            </div>
          )}

          {/* TABS (TIPO DA PROMO) */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', backgroundColor: 'var(--ep-border, #222)', padding: '6px', borderRadius: '12px' }}>
            <button
              type="button"
              onClick={() => setType('discount')}
              style={{
                flex: 1, padding: '10px', borderRadius: '8px', border: 'none',
                backgroundColor: type === 'discount' ? 'var(--ep-bg, #333)' : 'transparent',
                color: type === 'discount' ? 'var(--ep-text, #fff)' : 'var(--ep-label, #aaa)',
                fontWeight: type === 'discount' ? 700 : 500,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                boxShadow: type === 'discount' ? '0 2px 4px rgba(0,0,0,0.2)' : 'none',
                transition: 'all 0.2s'
              }}
            >
              <FiTag size={18} /> Desconto Único
            </button>
            <button
              type="button"
              onClick={() => setType('combo')}
              style={{
                flex: 1, padding: '10px', borderRadius: '8px', border: 'none',
                backgroundColor: type === 'combo' ? 'var(--ep-bg, #333)' : 'transparent',
                color: type === 'combo' ? 'var(--ep-text, #fff)' : 'var(--ep-label, #aaa)',
                fontWeight: type === 'combo' ? 700 : 500,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                boxShadow: type === 'combo' ? '0 2px 4px rgba(0,0,0,0.2)' : 'none',
                transition: 'all 0.2s'
              }}
            >
              <FiBox size={18} /> Montar Combo
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Nome da Oferta</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Combo Casal, Pizza 50% OFF" style={inputStyle} required />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Descrição (Opcional)</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Descreva o que vem na oferta..." rows={2} style={{ ...inputStyle, resize: 'none' }} />
            </div>

            <div>
              <label style={labelStyle}>Preço Promocional (R$)</label>
              <input type="number" step="0.01" value={promotionalPrice} onChange={e => setPromotionalPrice(e.target.value)} placeholder="Ex: 29.90" style={inputStyle} required />
              {type === 'combo' && comboTotal > 0 && (
                <div style={{ marginTop: '6px', fontSize: '0.8rem', color: 'var(--ep-label, #aaa)' }}>
                  Valor original somado: <strong>R$ {comboTotal.toFixed(2)}</strong>. Ajuste o valor final promocional.
                </div>
              )}
            </div>

            {type === 'discount' && (
              <div>
                <label style={labelStyle}>Produto Alvo</label>
                <select value={targetProductId} onChange={e => setTargetProductId(e.target.value)} style={inputStyle} required>
                  <option value="">-- Selecione --</option>
                  {products.map(p => (
                    <option key={p._id} value={p._id}>{p.name} (R$ {p.price.toFixed(2)})</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {type === 'combo' && (
            <div style={{ marginBottom: '24px', display: 'flex', gap: '20px', flexDirection: 'column' }}>
              
              {/* Resumo do Combo (Carrinho) */}
              <div style={{ border: '1px solid var(--ep-border, #333)', borderRadius: '12px', padding: '16px', backgroundColor: 'var(--ep-bg, #1a1a1a)' }}>
                <label style={labelStyle}>Resumo do Combo ({comboItems.reduce((acc, item) => acc + item.quantity, 0)} itens)</label>
                {comboItems.length === 0 ? (
                  <p style={{ fontSize: '0.9rem', color: 'var(--ep-label, #aaa)', margin: 0 }}>Nenhum produto adicionado ainda.</p>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {comboItems.map((item) => {
                      const p = products.find(prod => prod._id === item.productId);
                      if (!p) return null;
                      return (
                        <li key={item.productId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--ep-border, #222)', padding: '8px 12px', borderRadius: '8px' }}>
                          <span style={{ fontSize: '0.9rem', color: 'var(--ep-text, #fff)' }}>
                            <strong style={{ color: '#FF6B2C', marginRight: '6px' }}>{item.quantity}x</strong> {p.name}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '0.85rem', color: 'var(--ep-label, #aaa)' }}>R$ {(p.price * item.quantity).toFixed(2)}</span>
                            <button type="button" onClick={() => handleDeleteComboItem(item.productId)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px', display: 'flex' }}>
                              <FiTrash2 size={16} />
                            </button>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              {/* Listagem Completa de Categorias e Produtos */}
              <div>
                <label style={labelStyle}>Adicionar ao Combo</label>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxHeight: '400px', overflowY: 'auto', padding: '4px 0', borderTop: '1px solid var(--ep-border, #333)', paddingTop: '16px' }}>
                  {(!categories || categories.length === 0) ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--ep-label, #aaa)', backgroundColor: 'var(--ep-bg, #1e1e1e)', borderRadius: '8px', border: '1px dashed var(--ep-border, #333)' }}>
                      Carregando produtos do cardápio...
                    </div>
                  ) : (
                    [...categories, { _id: 'outros', name: 'Outros', image: null }].map(cat => {
                      const categoryProducts = products.filter(p => cat.name === 'Outros' ? !p.category : p.category === cat.name);
                      
                      if (categoryProducts.length === 0) return null;
                      
                      const isExpanded = expandedCategory === cat.name;

                      return (
                        <section key={cat._id} className="cat-section" style={{ margin: 0, padding: 0 }}>
                          <button 
                            type="button"
                            onClick={() => setExpandedCategory(isExpanded ? null : cat.name)}
                            className="phone__section-title" 
                            style={{ 
                              marginBottom: isExpanded ? '12px' : '0', 
                              width: '100%', 
                              border: '1px solid var(--ep-border, #333)', 
                              background: isExpanded ? 'var(--ep-bg, #222)' : 'var(--ep-bg, #1a1a1a)', 
                              display: 'flex', 
                              justifyContent: 'space-between', 
                              alignItems: 'center', 
                              cursor: 'pointer', 
                              padding: '12px 16px', 
                              borderRadius: '8px',
                              transition: 'all 0.2s'
                            }}
                          >
                            <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--ep-text, #fff)' }}>{cat.name}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <span className="phone__section-count" style={{ backgroundColor: 'var(--ep-border, #333)', color: 'var(--ep-label, #aaa)' }}>{categoryProducts.length}</span>
                              <span style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: 'var(--ep-label, #aaa)', fontSize: '0.8rem' }}>▼</span>
                            </div>
                          </button>

                          {isExpanded && (
                            <ul className="phone__list" style={{ padding: '0 0 16px 0', margin: 0, listStyle: 'none' }}>
                              {categoryProducts.map(p => {
                                const comboItem = comboItems.find(i => i.productId === p._id);
                                const quantity = comboItem ? comboItem.quantity : 0;
                                return (
                                  <li 
                                    key={p._id} 
                                    className="phone__item"
                                    style={{ 
                                      backgroundColor: quantity > 0 ? '#ff6b2c15' : 'var(--ep-bg, #1e1e1e)',
                                      marginBottom: '8px',
                                      borderRadius: '12px',
                                      border: quantity > 0 ? '1px solid #FF6B2C' : '1px solid transparent',
                                      overflow: 'hidden'
                                    }}
                                  >
                                    <div className="phone__item-main">
                                      <div className="phone__item-text">
                                        <strong style={{ color: 'var(--ep-text, #fff)' }}>{p.name}</strong>
                                        {p.description && <p style={{ color: 'var(--ep-label, #aaa)' }}>{p.description}</p>}
                                        <span className="phone__price" style={{ color: 'var(--ep-text, #fff)' }}>
                                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.price)}
                                        </span>
                                      </div>

                                      <div className="phone__thumb" style={{ backgroundColor: 'var(--ep-border, #333)' }}>
                                        {p.image ? (
                                          <img src={`/api/images/${p.image}`} alt={p.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : (
                                          <span className="phone__product-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '1.5rem' }}>
                                            🍽️
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    {quantity === 0 ? (
                                      <button type="button" className="phone__add-btn" onClick={() => handleAddComboItem(p._id)}>
                                        <span aria-hidden="true">+</span> Adicionar
                                      </button>
                                    ) : (
                                      <div className="phone__stepper">
                                        <button type="button" onClick={() => handleRemoveComboItem(p._id)}>
                                          −
                                        </button>
                                        <span>
                                          <strong>{quantity}</strong> no combo
                                        </span>
                                        <button type="button" onClick={() => handleAddComboItem(p._id)}>
                                          +
                                        </button>
                                      </div>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </section>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--ep-border, #333)', margin: '24px 0', paddingTop: '24px' }}>
            <label style={labelStyle}>Duração da Promoção</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {[
                { id: 'today', icon: FiClock, label: 'Até fechar o caixa' },
                { id: '2days', icon: FiCalendar, label: '2 Dias' },
                { id: '1week', icon: FiCalendar, label: '1 Semana' },
                { id: 'custom', icon: FiCalendar, label: 'Data Exata' }
              ].map(opt => {
                const isActive = durationMode === opt.id;
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setDurationMode(opt.id as any)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      padding: '12px', borderRadius: '8px', border: '1px solid',
                      borderColor: isActive ? '#FF6B2C' : 'var(--ep-border, #333)',
                      backgroundColor: isActive ? '#FF6B2C' : 'transparent',
                      color: isActive ? '#fff' : 'var(--ep-text, #fff)',
                      fontWeight: isActive ? 700 : 500, cursor: 'pointer', transition: 'all 0.2s'
                    }}
                  >
                    <Icon size={16} /> {opt.label}
                  </button>
                )
              })}
            </div>

            {durationMode === 'custom' && (
              <div style={{ marginTop: '16px' }}>
                <label style={labelStyle}>Válido até</label>
                <input
                  type="datetime-local"
                  value={customDate}
                  onChange={e => setCustomDate(e.target.value)}
                  style={inputStyle}
                  required={durationMode === 'custom'}
                />
              </div>
            )}
          </div>
        </div>

        {/* FOOTER */}
        <footer style={{
          padding: '20px 24px', borderTop: '1px solid var(--ep-border, #333)',
          backgroundColor: 'var(--ep-bg, #111)',
          display: 'flex', justifyContent: 'flex-end', gap: '12px'
        }}>
          <button type="button" onClick={onClose} disabled={loading} style={{
            padding: '12px 24px', borderRadius: '8px', border: '1px solid var(--ep-border, #333)',
            backgroundColor: 'transparent', color: 'var(--ep-text, #fff)',
            fontWeight: 600, cursor: 'pointer'
          }}>
            Cancelar
          </button>
          <button type="button" onClick={handleSave} disabled={loading} style={{
            padding: '12px 24px', borderRadius: '8px', border: 'none',
            backgroundColor: '#FF6B2C', color: '#fff',
            fontWeight: 700, cursor: 'pointer'
          }}>
            {loading ? 'Salvando...' : 'Salvar Promoção'}
          </button>
        </footer>
      </div>
    </div>
  );
}
