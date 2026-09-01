import toast from 'react-hot-toast';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api, getImageUrl, type AppProjectFull } from '../lib/api';
import { EditorPreview } from '../components/EditorPreview';
import type { DeliveryOrder, PreviewProduct, PreviewTable } from '../components/phone/types';
import { useConfirm } from '../components/ConfirmModal';
import { PromotionsModal } from '../components/PromotionsModal';
import { fileToResizedDataUrl } from '../lib/image';
import { ArrowLeft, Sun, Moon, Trash2, Pencil, Star, Camera, Utensils, Lightbulb, Eye, EyeOff, Smartphone, Monitor, Maximize } from 'lucide-react';

/* A fila do entregador comeca VAZIA: so entra pedido feito de verdade na aba do cliente. */
const SAMPLE_DELIVERIES: DeliveryOrder[] = [];

export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { confirm, ConfirmElement } = useConfirm();
  
  const [app, setApp] = useState<AppProjectFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [editorTheme, setEditorTheme] = useState<'claro' | 'escuro'>('escuro');
  const [mobileTab, setMobileTab] = useState<'editor' | 'preview'>('editor');
  const [viewMode, setViewMode] = useState<'mobile' | 'default' | 'fullscreen'>('default');
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const isResizing = useRef(false);

  const handleMouseDown = () => {
    isResizing.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.userSelect = 'none';
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing.current) return;
    let newWidth = e.clientX;
    if (newWidth < 250) newWidth = 250;
    if (newWidth > 600) newWidth = 600;
    setSidebarWidth(newWidth);
  };

  const handleMouseUp = () => {
    isResizing.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.userSelect = '';
  };

  const [appName, setAppName] = useState('');
  const [tagline, setTagline] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#FF6B2C');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [prodName, setProdName] = useState('');
  const [prodDesc, setProdDesc] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodPricingType, setProdPricingType] = useState<'unit' | 'weight'>('unit');
  const [prodCategory, setProdCategory] = useState('');
  const [prodFeatured, setProdFeatured] = useState(false);
  const [prodImage, setProdImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [newCat, setNewCat] = useState('');
  const [isAddingCat, setIsAddingCat] = useState(false);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);

  const [editingTableId, setEditingTableId] = useState<string | null>(null);
  const [tableLabel, setTableLabel] = useState('');
  const [tableSeats, setTableSeats] = useState('');
  const [tableArea, setTableArea] = useState('Salão');

  const [isSavingProd, setIsSavingProd] = useState(false);
  const [isSavingTable, setIsSavingTable] = useState(false);

  const [isPromoModalOpen, setIsPromoModalOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<any>(null);

  const [liveTables, setLiveTables] = useState<PreviewTable[]>([]);

  useEffect(() => {
    async function loadApp() {
      try {
        if (!id) return;
        const data = await api.getApp(id);
        setApp(data);
        setAppName(data.name);
        setTagline(data.brand.tagline || '');
        setPrimaryColor(data.brand.primaryColor || '#FF6B2C');
        setLogoUrl(getImageUrl(data.brand.logo));
        
        if (data.categories && data.categories.length > 0) {
          setProdCategory(data.categories[0].name);
        }
        
        setLiveTables(data.tables.map((t: any) => ({
          id: t._id,
          label: t.label,
          seats: t.seats,
          area: t.area,
          status: 'livre',
          items: []
        })));
      } catch (err) {
        console.error(err);
        toast.error('Erro ao carregar aplicativo.');
        navigate('/painel');
      } finally {
        setLoading(false);
      }
    }
    void loadApp();
  }, [id, navigate]);

  const [catImage, setCatImage] = useState<string | null>(null);
  const catFileInputRef = useRef<HTMLInputElement>(null);

  async function handleToggleWaiterCommission(checked: boolean) {
    if (!app) return;
    try {
      const updated = await api.updateApp(app._id, { dining: { isWaiterCommissionEnabled: checked, waiterCommissionPercentage: app.dining?.waiterCommissionPercentage ?? 10 } });
      setApp(updated);
    } catch (err) {
      toast.error('Erro ao salvar configuração do garçom');
    }
  }

  async function handleUpdateWaiterCommissionPercent(e: React.ChangeEvent<HTMLInputElement>) {
    if (!app) return;
    const value = parseInt(e.target.value, 10);
    if (isNaN(value) || value < 0 || value > 100) return;
    try {
      const updated = await api.updateApp(app._id, { dining: { waiterCommissionPercentage: value } });
      setApp(updated);
    } catch (err) {
      toast.error('Erro ao salvar porcentagem do garçom');
    }
  }

  async function handleSaveCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!app || !newCat.trim()) return;

    const imageBase64 = catImage && catImage.startsWith('data:') ? catImage.split(',')[1] : undefined;

    setIsAddingCat(true);
    try {
      if (editingCatId) {
        const anterior = app.categories.find((c) => c._id === editingCatId);
        const updated = await api.updateCategory(app._id, editingCatId, {
          name: newCat.trim(),
          ...(imageBase64 ? { imageBase64 } : {}),
        });

        const newCats = app.categories.map((c) => (c._id === editingCatId ? updated : c));

        const renamed = Boolean(anterior && anterior.name !== updated.name);
        let newProducts = app.products;

        if (renamed) {
          const afetados = app.products.filter((p) => p.category === anterior!.name);
          await Promise.all(
            afetados.map((p) => api.updateProduct(app._id, p._id, { category: updated.name }))
          );
          newProducts = app.products.map((p) =>
            p.category === anterior!.name ? { ...p, category: updated.name } : p
          );
        }

        setApp({ ...app, categories: newCats, products: newProducts });
        if (renamed && prodCategory === anterior!.name) setProdCategory(updated.name);
      } else {
        const addedCat = await api.addCategory(app._id, {
          name: newCat.trim(),
          imageBase64,
        });
        setApp({ ...app, categories: [...(app.categories || []), addedCat] });
        if (!prodCategory) setProdCategory(addedCat.name);
      }

      cancelCategoryEdit();
    } catch (err) {
      alert(editingCatId ? 'Erro ao salvar categoria' : 'Erro ao criar categoria');
    } finally {
      setIsAddingCat(false);
    }
  }

  function startCategoryEdit(category: { _id: string; name: string; image: string | null }) {
    setEditingCatId(category._id);
    setNewCat(category.name);
    setCatImage(getImageUrl(category.image));
  }

  function cancelCategoryEdit() {
    setEditingCatId(null);
    setNewCat('');
    setCatImage(null);
  }

  async function handleRemoveCategory(categoryId: string, catName: string) {
    if (!app) return;
    
    confirm({
      title: 'Excluir Categoria',
      message: `Tem certeza? Produtos desta categoria (${catName}) não aparecerão corretamente no cardápio.`,
      confirmText: 'Excluir',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await api.removeCategory(app._id, categoryId);
          const newCats = app.categories.filter((c: any) => c._id !== categoryId);
          setApp({ ...app, categories: newCats });
          if (prodCategory === catName) setProdCategory(newCats[0]?.name || '');
          if (editingCatId === categoryId) cancelCategoryEdit();
        } catch (err) {
          toast.error('Erro ao remover');
        }
      }
    });
  }

  async function handleToggleCourierPayment(enabled: boolean) {
    if (!app) return;
    const anterior = app.delivery;
    setApp({ ...app, delivery: { ...app.delivery, courierPaidPerDelivery: enabled } });
    try {
      const updated = await api.updateApp(app._id, {
        delivery: { ...app.delivery, courierPaidPerDelivery: enabled },
      });
      setApp(updated);
    } catch (err) {
      setApp({ ...app, delivery: anterior });
      toast.error('Não foi possível salvar essa configuração.');
    }
  }

  async function handleFileSelect(file: File | undefined) {
    if (!file) return;
    try {
      const dataUrl = await fileToResizedDataUrl(file, 720);
      setProdImage(dataUrl);
    } catch (err) {
      toast.error('Erro ao processar imagem.');
    }
  }

  async function handleSaveProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!app || !prodName || !prodPrice || !prodCategory) return;
    setIsSavingProd(true);
    try {
      const priceVal = parseFloat(prodPrice.replace(',', '.'));
      if (editingProductId) {
        const updatedProd = await api.updateProduct(app._id, editingProductId, {
          name: prodName,
          description: prodDesc,
          price: priceVal,
          pricingType: prodPricingType,
          category: prodCategory,
          isFeatured: prodFeatured,
          imageBase64: prodImage && prodImage.startsWith('data:') ? prodImage.split(',')[1] : undefined
        });
        setApp({ ...app, products: app.products.map((p: any) => p._id === editingProductId ? updatedProd : p) });
      } else {
        const newProd = await api.addProduct(app._id, {
          name: prodName,
          description: prodDesc,
          price: priceVal,
          category: prodCategory,
          isFeatured: prodFeatured,
          imageBase64: prodImage?.split(',')[1]
        });
        setApp({ ...app, products: [...app.products, newProd] });
      }
      resetProdForm();
    } catch (err) {
      toast.error('Erro ao salvar produto.');
    } finally {
      setIsSavingProd(false);
    }
  }

  function editProduct(p: any) {
    setEditingProductId(p._id);
    setProdName(p.name);
    setProdDesc(p.description || '');
    setProdPrice(p.price.toString().replace('.', ','));
    setProdCategory(p.category || app?.categories?.[0]?.name || '');
    setProdFeatured(p.isFeatured || false);
    setProdImage(getImageUrl(p.image));
  }

  function resetProdForm() {
    setEditingProductId(null);
    setProdName('');
    setProdDesc('');
    setProdPrice('');
      setProdPricingType('unit');
      setProdPricingType('unit');
    setProdFeatured(false);
    setProdImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleDeleteProduct(productId: string) {
    if (!app) return;
    confirm({
      title: 'Excluir Produto',
      message: 'Tem certeza que deseja excluir este produto permanentemente?',
      confirmText: 'Excluir',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await api.removeProduct(app._id, productId);
          setApp({ ...app, products: app.products.filter((p: any) => p._id !== productId) });
          if (editingProductId === productId) resetProdForm();
        } catch (err) {
          toast.error('Erro ao excluir produto.');
        }
      }
    });
  }

  async function handleSaveTable(e: React.FormEvent) {
    e.preventDefault();
    if (!app || !tableLabel || !tableSeats) return;
    setIsSavingTable(true);
    try {
      if (editingTableId) {
        const updatedTable = await api.updateTable(app._id, editingTableId, {
          label: tableLabel,
          seats: parseInt(tableSeats, 10),
          area: tableArea,
        });
        setApp({ ...app, tables: app.tables.map((t: any) => t._id === editingTableId ? updatedTable : t) });
        setLiveTables(liveTables.map((t: any) => t.id === editingTableId ? { ...t, label: updatedTable.label, seats: updatedTable.seats, area: updatedTable.area } : t));
      } else {
        const newTable = await api.addTable(app._id, {
          label: tableLabel,
          seats: parseInt(tableSeats, 10),
          area: tableArea,
        });
        setApp({ ...app, tables: [...app.tables, newTable] });
        setLiveTables(prev => [...prev, {
          id: newTable._id,
          label: newTable.label,
          seats: newTable.seats,
          area: newTable.area,
          status: 'livre',
          items: []
        }]);
      }
      resetTableForm();
    } catch (err) {
      toast.error('Erro ao salvar mesa.');
    } finally {
      setIsSavingTable(false);
    }
  }

  function editTable(t: any) {
    setEditingTableId(t._id);
    setTableLabel(t.label);
    setTableSeats(t.seats.toString());
    setTableArea(t.area || 'Salão');
  }

  function resetTableForm() {
    setEditingTableId(null);
    setTableLabel('');
    setTableSeats('');
  }

  async function handleDeleteTable(tableId: string) {
    if (!app) return;
    confirm({
      title: 'Excluir Mesa',
      message: 'Tem certeza? Essa mesa será removida.',
      confirmText: 'Excluir',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await api.removeTable(app._id, tableId);
          setApp({ ...app, tables: app.tables.filter((t: any) => t._id !== tableId) });
          setLiveTables(liveTables.filter((t: any) => t.id !== tableId));
          if (editingTableId === tableId) resetTableForm();
        } catch (err) {
          toast.error('Erro ao excluir mesa');
        }
      }
    });
  }

  async function handleSavePromo(promoData: any) {
    if (!app) return;
    if (editingPromo) {
      const updated = await api.updatePromotion(app._id, editingPromo._id, promoData);
      setApp({ ...app, promotions: app.promotions.map((p: any) => p._id === editingPromo._id ? updated : p) });
    } else {
      const newPromo = await api.addPromotion(app._id, promoData);
      setApp({ ...app, promotions: [...(app.promotions || []), newPromo] });
    }
  }

  async function handleDeletePromo(promoId: string) {
    if (!app) return;
    confirm({
      title: 'Excluir Promoção',
      message: 'Tem certeza que deseja excluir esta promoção?',
      confirmText: 'Excluir',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await api.removePromotion(app._id, promoId);
          setApp({ ...app, promotions: app.promotions.filter((p: any) => p._id !== promoId) });
        } catch (err) {
          toast.error('Erro ao excluir promoção');
        }
      }
    });
  }

  async function handleTogglePromoStatus(promoId: string, currentStatus: boolean) {
    if (!app) return;
    try {
      const updated = await api.updatePromotion(app._id, promoId, { active: !currentStatus });
      setApp({ ...app, promotions: app.promotions.map((p: any) => p._id === promoId ? updated : p) });
    } catch (err) {
      toast.error('Erro ao alterar status da promoção');
    }
  }

  const previewProducts = useMemo<PreviewProduct[]>(() => {
    if (!app) return [];
    return app.products.map((p: any) => ({
      id: p._id,
      name: p.name,
      description: p.description,
      price: p.price,
      category: p.category,
      isFeatured: p.isFeatured,
      imageUrl: getImageUrl(p.image),
      emoji: ''
    }));
  }, [app]);

  if (loading || !app) {
    return (
      <div style={{ padding: '4rem 0', textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <p>Carregando editor...</p>
      </div>
    );
  }

  const isDark = editorTheme === 'escuro';

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden", backgroundColor: "var(--ep-bg)", color: "var(--ep-text)", fontFamily: "Inter, system-ui, sans-serif" }}>
      
      {/* HEADER BAR */}
      <header className="editor-topbar" style={{ padding: "16px 32px", backgroundColor: "var(--ep-sidebar)", borderBottom: "1px solid var(--ep-border)", boxShadow: isDark ? "0 4px 12px rgba(0,0,0,0.3)" : "0 4px 12px rgba(0,0,0,0.03)", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10 , flexWrap: 'wrap', gap: '16px'}}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <Link to="/painel" style={{ color: "var(--ep-text)", textDecoration: 'none', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}><ArrowLeft size={20} /> Voltar</Link>
          <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, backgroundImage: isDark ? 'linear-gradient(to right, #60a5fa, #a78bfa)' : 'linear-gradient(to right, #2563eb, #7c3aed)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}>{app.name}</h1>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => setEditorTheme(isDark ? 'claro' : 'escuro')} className="ep-btn ep-btn-secondary" style={{ width: 'auto', padding: '8px 12px', border: "1px solid var(--ep-border)" }}>
            {isDark ? (<><Sun size={18} style={{ marginRight: 6 }}/> Claro</>) : (<><Moon size={18} style={{ marginRight: 6 }}/> Escuro</>)}
          </button>
          <Link to={`/painel/app/${app._id}/planos`} style={{ backgroundColor: '#10b981', color: '#ffffff', padding: '8px 20px', borderRadius: '8px', textDecoration: 'none', fontWeight: 700, border: 'none', boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.2)', display: 'flex', alignItems: 'center' }}>
            Contratar Plano
          </Link>
        </div>
      </header>

      {/* MOBILE TABS */}
      <div className="mobile-tabs" style={{ display: 'none', width: '100%', backgroundColor: "var(--ep-sidebar)", borderBottom: `1px solid var(--ep-border)` }}>
        <button onClick={() => setMobileTab('editor')} style={{ flex: 1, padding: '12px', background: mobileTab === 'editor' ? 'var(--ep-panel)' : 'transparent', border: 'none', color: "var(--ep-text)", fontWeight: 'bold' }}>Opções (Editar)</button>
        <button onClick={() => setMobileTab('preview')} style={{ flex: 1, padding: '12px', background: mobileTab === 'preview' ? 'var(--ep-panel)' : 'transparent', border: 'none', color: "var(--ep-text)", fontWeight: 'bold' }}>Aplicativo (Visualizar)</button>
      </div>

      {/* EDITOR WORKSPACE */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }} className="editor-workspace">
        
        {/* SIDEBAR */}
        <aside style={{ width: `${sidebarWidth}px`, backgroundColor: "var(--ep-sidebar)", borderRight: "1px solid var(--ep-border)", overflowY: 'auto', WebkitOverflowScrolling: 'touch', display: mobileTab === 'editor' ? 'flex' : 'none', flexDirection: 'column', flexShrink: 0, minHeight: 0, zIndex: 5, boxShadow: isDark ? 'none' : '4px 0 12px rgba(0,0,0,0.02)' }} className="editor-sidebar">
          
          {/* Cardápio e Categorias */}
          <div style={{ padding: "32px 24px", borderBottom: "1px solid var(--ep-border)" }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '16px' }}>Cardápio</h2>
            
            {/* Gerenciar Categorias */}
            <div className="ep-card">
              <h3 style={{ fontSize: "1.05rem", fontWeight: 700, marginBottom: "8px", color: "var(--ep-text)" }}>Categorias</h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--ep-muted)', marginBottom: '16px' }}>
                {editingCatId ? 'Editando a categoria. Troque o nome, a foto, ou cancele.' : 'A categoria vira um card com foto no cardápio do cliente.'}
              </p>

              <form onSubmit={handleSaveCategory} style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'center' }}>
                <div
                  onClick={() => catFileInputRef.current?.click()}
                  title="Foto da categoria"
                  style={{ width: '42px', height: '42px', borderRadius: '8px', border: isDark ? '1px dashed rgba(255,255,255,0.2)' : '1px dashed var(--ep-border)', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', flexDirection: 'column', overflow: 'hidden', cursor: 'pointer', backgroundColor: "var(--ep-panel)", flexShrink: 0 }}
                >
                  {catImage ? <img src={catImage} alt="Foto da categoria" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Camera size={20} color="#94a3b8" style={{ margin: 0, padding: 0, display: "block" }} />}
                </div>
                <input type="file" accept="image/*" hidden ref={catFileInputRef} onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    const dataUrl = await fileToResizedDataUrl(f, 400);
                    setCatImage(dataUrl);
                  }
                }} />
                <input type="text" placeholder="Nome (Ex: Lanches)" required value={newCat} onChange={e => setNewCat(e.target.value)} className="ep-input" style={{ marginBottom: 0, height: '42px' }} />
                <button type="submit" disabled={isAddingCat} className="ep-btn" style={{ marginBottom: 0, height: '42px', width: 'auto', padding: '0 20px' }}>
                  {editingCatId ? 'Salvar' : '+'}
                </button>
                {editingCatId && (
                  <button type="button" onClick={cancelCategoryEdit} className="ep-btn ep-btn-secondary" style={{ width: "auto", height: '42px', padding: '0 14px', marginBottom: 0 }}>
                    Cancelar
                  </button>
                )}
              </form>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {app.categories?.map((c: any) => {
                  const emEdicao = editingCatId === c._id;
                  const itens = app.products.filter((p: any) => p.category === c.name).length;
                  return (
                    <div
                      key={c._id}
                      style={{ padding: '10px 14px', borderRadius: '10px', backgroundColor: "var(--ep-bg)", border: emEdicao ? "1px solid #3b82f6" : (isDark ? "1px solid rgba(255,255,255,0.05)" : "1px solid var(--ep-border)"), display: 'flex', alignItems: 'center', gap: '12px', boxShadow: isDark ? 'none' : '0 2px 4px rgba(0,0,0,0.02)' }}
                    >
                      {c.image
                        ? <img src={getImageUrl(c.image) || undefined} alt="" style={{ width: '32px', height: '32px', borderRadius: '8px', objectFit: 'cover' }} />
                        : <span style={{ width: "32px", height: "32px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--ep-panel)", color: "#9ca3af" }}><Utensils size={16} /></span>}
                      
                      <span style={{ flex: 1, fontSize: '0.95rem', fontWeight: 500, color: 'var(--ep-text)' }}>
                        {c.name} <span style={{ color: 'var(--ep-muted)', fontSize: '0.8rem' }}>({itens} itens)</span>
                      </span>
                      
                      <button type="button" title="Editar categoria" onClick={() => startCategoryEdit(c)} className="ep-btn ep-btn-secondary" style={{ display: "flex", padding: "8px", borderRadius: "8px", width: "auto" }}><Pencil size={16} /></button>
                      <button type="button" title="Remover categoria" onClick={() => void handleRemoveCategory(c._id, c.name)} className="ep-btn ep-btn-danger" style={{ display: "flex", padding: "8px", borderRadius: "8px", width: "auto" }}><Trash2 size={16} /></button>
                    </div>
                  );
                })}
                {(!app.categories || app.categories.length === 0) && (
                  <div style={{ padding: '16px', textAlign: 'center', backgroundColor: 'var(--ep-bg)', borderRadius: '10px', fontSize: '0.85rem', color: 'var(--ep-label)', border: isDark ? '1px dashed rgba(255,255,255,0.1)' : '1px dashed var(--ep-border)' }}>
                    Nenhuma categoria criada.
                  </div>
                )}
              </div>
            </div>

            <form onSubmit={handleSaveProduct} className="ep-card">
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '12px' }}>{editingProductId ? 'Editar Produto' : 'Adicionar Produto'}</h3>
              
              {(!app.categories || app.categories.length === 0) ? (
                <p style={{ fontSize: '0.9rem', color: '#ef4444', fontWeight: 600 }}>Crie uma categoria acima primeiro.</p>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      style={{ width: '80px', height: '80px', borderRadius: '10px', border: isDark ? '2px dashed rgba(255,255,255,0.2)' : '2px dashed var(--ep-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: 'pointer', backgroundColor: "var(--ep-panel)", flexShrink: 0 }}
                    >
                      {prodImage ? <img src={prodImage} alt="Foto" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Camera size={32} color="#94a3b8" />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <input type="text" placeholder="Nome do produto" required value={prodName} onChange={e => setProdName(e.target.value)} className="ep-input" />
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', marginBottom: '16px' }}>R$</span>
                        <input type="text" inputMode="decimal" placeholder="32,90" required value={prodPrice} onChange={e => setProdPrice(e.target.value)} className="ep-input" />
                      </div>
                    </div>
                  </div>
                  
                  <select required value={prodCategory} onChange={e => setProdCategory(e.target.value)} className="ep-input">
                    {app.categories.map((c: any) => <option key={c._id} value={c.name}>{c.name}</option>)}
                  </select>
                  
                  <textarea placeholder="Descrição breve (opcional)" value={prodDesc} onChange={e => setProdDesc(e.target.value)} rows={2} className="ep-input" />
                  <input type="file" accept="image/*" hidden ref={fileInputRef} onChange={e => void handleFileSelect(e.target.files?.[0])} />
                  
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', fontSize: '0.9rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={prodFeatured} onChange={e => setProdFeatured(e.target.checked)} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
                    Destacar no topo do cardápio
                  </label>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    {editingProductId && (
                      <button type="button" onClick={resetProdForm} className="ep-btn ep-btn-secondary">
                        Cancelar
                      </button>
                    )}
                    <button type="submit" disabled={isSavingProd} className="ep-btn">
                      {isSavingProd ? 'Salvando...' : (editingProductId ? 'Salvar Edição' : '+ Adicionar')}
                    </button>
                  </div>
                </>
              )}
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {app.products.map((p: any) => (
                <div key={p._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', border: isDark ? "1px solid rgba(255,255,255,0.05)" : "1px solid var(--ep-border)", borderRadius: '10px', backgroundColor: "var(--ep-bg)", boxShadow: isDark ? 'none' : '0 2px 4px rgba(0,0,0,0.02)' }}>
                  <div>
                    <strong style={{ display: "block", fontSize: "0.95rem", color: "var(--ep-text)" }}>{p.isFeatured && <Star size={14} fill="#f59e0b" color="#f59e0b" style={{ marginRight: "4px", verticalAlign: "middle" }} /> }{p.name}</strong>
                    <span style={{ fontSize: "0.85rem", color: "var(--ep-label)" }}>R$ {p.price.toFixed(2)} - {p.category}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => editProduct(p)} className="ep-btn ep-btn-secondary" style={{ display: "flex", padding: "8px", borderRadius: "8px", width: "auto" }}><Pencil size={18} /></button>
                    <button onClick={() => void handleDeleteProduct(p._id)} className="ep-btn ep-btn-danger" style={{ display: "flex", padding: "8px", borderRadius: "8px", width: "auto" }}><Trash2 size={18} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Promoções */}
          <div style={{ padding: "32px 24px", borderBottom: "1px solid var(--ep-border)" }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Promoções e Combos</h2>
              <button
                type="button"
                className="ep-btn"
                style={{ width: 'auto', padding: '8px 16px', fontSize: '0.9rem' }}
                onClick={() => {
                  setEditingPromo(null);
                  setIsPromoModalOpen(true);
                }}
              >
                + Nova Promoção
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {app.promotions?.length === 0 && (
                <p style={{ color: 'var(--ep-label)', fontSize: '0.9rem' }}>Nenhuma promoção ativa no momento.</p>
              )}
              {app.promotions?.map((p: any) => (
                <div key={p._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', border: isDark ? "1px solid rgba(255,255,255,0.05)" : "1px solid var(--ep-border)", borderRadius: '10px', backgroundColor: "var(--ep-bg)" }}>
                  <div>
                    <strong style={{ display: "block", fontSize: "0.95rem", color: "var(--ep-text)" }}>{p.name}</strong>
                    <span style={{ fontSize: "0.85rem", color: "var(--ep-label)" }}>
                      {p.type === 'combo' ? 'Combo' : 'Desconto'} - R$ {p.promotionalPrice.toFixed(2)}
                      {p.expiresOnRegisterClose && ' (Até fechar o caixa)'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => void handleTogglePromoStatus(p._id, p.active)} className="ep-btn ep-btn-secondary" style={{ display: "flex", padding: "8px", borderRadius: "8px", width: "auto" }} title={p.active ? "Ativo" : "Inativo"}>
                      {p.active ? <Eye size={18} color="#10b981" /> : <EyeOff size={18} color="#9ca3af" />}
                    </button>
                    <button onClick={() => { setEditingPromo(p); setIsPromoModalOpen(true); }} className="ep-btn ep-btn-secondary" style={{ display: "flex", padding: "8px", borderRadius: "8px", width: "auto" }}><Pencil size={18} /></button>
                    <button onClick={() => void handleDeletePromo(p._id)} className="ep-btn ep-btn-danger" style={{ display: "flex", padding: "8px", borderRadius: "8px", width: "auto" }}><Trash2 size={18} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Entrega e pagamento do entregador */}
          <div style={{ padding: "32px 24px", borderBottom: "1px solid var(--ep-border)" }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '16px' }}>Entrega</h2>
            <label
              className="ep-card" style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', cursor: 'pointer', marginBottom: 0 }}
            >
              <input
                type="checkbox"
                checked={Boolean(app.delivery?.courierPaidPerDelivery)}
                onChange={(e) => void handleToggleCourierPayment(e.target.checked)}
                style={{ marginTop: '3px', width: '18px', height: '18px', accentColor: '#3b82f6', flexShrink: 0 }}
              />
              <span>
                <strong style={{ display: 'block', fontSize: '0.95rem', color: 'var(--ep-text)' }}>O entregador recebe por entrega</strong>
                <span style={{ fontSize: '0.85rem', color: 'var(--ep-label)', lineHeight: 1.45, display: 'block', marginTop: '4px' }}>
                  Ligado, o fechamento de caixa separa o valor dos pedidos das taxas de entrega — é o valor
                  que o recepcionista acerta com o entregador no fim do turno.
                </span>
              </span>
            </label>
          </div>

          {/* Mesas */}
          <div style={{ padding: "32px 24px" }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '16px' }}>Salão e Mesas</h2>

            <div className="ep-card" style={{ marginBottom: '24px' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={Boolean(app.dining?.isWaiterCommissionEnabled)}
                  onChange={(e) => void handleToggleWaiterCommission(e.target.checked)}
                  style={{ marginTop: '3px', width: '18px', height: '18px', accentColor: '#3b82f6', flexShrink: 0 }}
                />
                <span>
                  <strong style={{ display: 'block', fontSize: '0.95rem', color: 'var(--ep-text)' }}>Cobrar comissão do garçom</strong>
                  <span style={{ fontSize: '0.85rem', color: 'var(--ep-label)', lineHeight: 1.45, display: 'block', marginTop: '4px' }}>
                    Adiciona automaticamente uma taxa de serviço no total da mesa ao fechar a conta.
                  </span>
                </span>
              </label>

              {app.dining?.isWaiterCommissionEnabled && (
                <div style={{ marginTop: '16px', paddingLeft: '30px' }}>
                  <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--ep-text)', marginBottom: '8px' }}>
                    Porcentagem da comissão (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={app.dining?.waiterCommissionPercentage ?? 10}
                    onChange={handleUpdateWaiterCommissionPercent}
                    className="ep-input"
                    style={{ width: '120px', marginBottom: 0 }}
                  />
                </div>
              )}
            </div>

            <form onSubmit={handleSaveTable} className="ep-card">
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '16px' }}>{editingTableId ? 'Editar Mesa' : 'Adicionar Mesa'}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <input type="text" placeholder="Rótulo (Ex: 01)" required value={tableLabel} onChange={e => setTableLabel(e.target.value)} className="ep-input" style={{ marginBottom: 0 }} />
                <input type="number" placeholder="Lugares (Ex: 4)" min="1" required value={tableSeats} onChange={e => setTableSeats(e.target.value)} className="ep-input" style={{ marginBottom: 0 }} />
              </div>
              <select value={tableArea} onChange={e => setTableArea(e.target.value)} className="ep-input">
                <option value="Salão">Salão Principal</option>
                <option value="Varanda">Varanda</option>
                <option value="Balcão">Balcão</option>
              </select>
              <div style={{ display: 'flex', gap: '8px' }}>
                {editingTableId && (
                  <button type="button" onClick={resetTableForm} className="ep-btn ep-btn-secondary">
                    Cancelar
                  </button>
                )}
                <button type="submit" disabled={isSavingTable} className="ep-btn">
                  {isSavingTable ? 'Salvando...' : (editingTableId ? 'Salvar Edição' : '+ Adicionar')}
                </button>
              </div>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {app.tables.map((t: any) => (
                <div key={t._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', border: isDark ? "1px solid rgba(255,255,255,0.05)" : "1px solid var(--ep-border)", borderRadius: '10px', backgroundColor: "var(--ep-bg)", boxShadow: isDark ? 'none' : '0 2px 4px rgba(0,0,0,0.02)' }}>
                  <div>
                    <strong style={{ display: "block", fontSize: "0.95rem", color: "var(--ep-text)" }}>Mesa {t.label}</strong>
                    <span style={{ fontSize: "0.85rem", color: "var(--ep-label)" }}>{t.seats} lugares - {t.area}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => editTable(t)} className="ep-btn ep-btn-secondary" style={{ display: "flex", padding: "8px", borderRadius: "8px", width: "auto" }}><Pencil size={18} /></button>
                    <button onClick={() => void handleDeleteTable(t._id)} className="ep-btn ep-btn-danger" style={{ display: "flex", padding: "8px", borderRadius: "8px", width: "auto" }}><Trash2 size={18} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </aside>
        <div 
          onMouseDown={handleMouseDown}
          className="editor-resizer"
          style={{ width: '4px', cursor: 'col-resize', backgroundColor: 'var(--ep-border)', zIndex: 10, flexShrink: 0, transition: 'background-color 0.2s' }}
        />
        {/* PREVIEW CONTAINER */}
        <main style={{ flex: 1, padding: viewMode === 'fullscreen' ? '0' : '32px', overflowY: 'auto', WebkitOverflowScrolling: 'touch', display: mobileTab === 'preview' ? 'flex' : 'none', justifyContent: 'flex-start', flexDirection: 'column', backgroundImage: viewMode === 'fullscreen' ? 'none' : (isDark ? 'radial-gradient(rgba(255,255,255,0.05) 1.5px, transparent 1.5px)' : 'radial-gradient(#cbd5e1 1.5px, transparent 1.5px)'), backgroundSize: '24px 24px', backgroundColor: viewMode === 'fullscreen' ? (isDark ? '#111827' : '#fff') : 'transparent' }} className="editor-main">
          
          <div style={{ width: '100%', maxWidth: viewMode === 'fullscreen' ? '100%' : '1200px', display: 'flex', flexDirection: 'column', margin: '0 auto' }}>
            
            {viewMode !== 'fullscreen' && (
              <p style={{ textAlign: 'center', fontSize: '0.9rem', color: 'var(--ep-label)', marginBottom: '16px', fontWeight: 600 }}>
                <Lightbulb size={18} style={{ display: "inline-block", verticalAlign: "middle", marginRight: "6px", color: "#f59e0b" }} />Interaja com o aplicativo abaixo para testar o cardápio, lançar itens nas mesas e ver a fila de entrega.
              </p>
            )}

            <div className="editor-view-controls" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginBottom: viewMode === 'fullscreen' ? '0' : '12px', padding: viewMode === 'fullscreen' ? '12px 16px' : '0' }}>
              <button onClick={() => setViewMode('mobile')} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '6px', border: viewMode === 'mobile' ? '1px solid var(--brand)' : '1px solid var(--ep-border)', background: viewMode === 'mobile' ? 'rgba(255,107,44,0.1)' : 'transparent', color: viewMode === 'mobile' ? 'var(--brand)' : 'var(--ep-label)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                <Smartphone size={16} /> Celular
              </button>
              <button onClick={() => setViewMode('default')} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '6px', border: viewMode === 'default' ? '1px solid var(--brand)' : '1px solid var(--ep-border)', background: viewMode === 'default' ? 'rgba(255,107,44,0.1)' : 'transparent', color: viewMode === 'default' ? 'var(--brand)' : 'var(--ep-label)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                <Monitor size={16} /> Padrão
              </button>
              <button onClick={() => setViewMode('fullscreen')} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '6px', border: viewMode === 'fullscreen' ? '1px solid var(--brand)' : '1px solid var(--ep-border)', background: viewMode === 'fullscreen' ? 'rgba(255,107,44,0.1)' : 'transparent', color: viewMode === 'fullscreen' ? 'var(--brand)' : 'var(--ep-label)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                <Maximize size={16} /> Tela Cheia
              </button>
            </div>
            
            <div className="editor-preview-wrapper" style={{ flex: 1, minHeight: viewMode === 'fullscreen' ? 'calc(100vh - 45px)' : '600px', 
              display: 'flex', 
              border: viewMode === 'fullscreen' ? 'none' : (isDark ? "1px solid rgba(255,255,255,0.05)" : "1px solid var(--ep-border)"), 
              borderRadius: viewMode === 'fullscreen' ? '0' : '16px', 
              overflow: 'hidden', 
              boxShadow: viewMode === 'fullscreen' ? 'none' : (isDark ? '0 10px 40px rgba(0,0,0,0.5)' : '0 10px 40px rgba(0,0,0,0.05)'),
              width: viewMode === 'mobile' ? '414px' : '100%',
              margin: viewMode === 'mobile' ? '0 auto' : '0'
            }}>
              <EditorPreview 
                storeName={appName}
                tagline={tagline}
                brandColor={primaryColor}
                theme={app.brand.theme || 'claro'}
                logoUrl={logoUrl}
                categories={app.categories}
                products={previewProducts}
                promotions={app.promotions}
                tables={liveTables}
                deliveryFee={app.delivery?.fee ?? 0}
                courierPaidPerDelivery={Boolean(app.delivery?.courierPaidPerDelivery)}
                initialDeliveries={SAMPLE_DELIVERIES}
                showRoomTab={true}
                liveBadge={true}
                onTablesChange={setLiveTables} // Agora as mesas ganham vida e salvam os itens lançados!
                onCloseRegister={async () => {
                  if (app) {
                    try {
                      const res = await api.closeCashRegister(app._id);
                      if (res.deactivatedPromotions > 0) {
                        const updatedApp = await api.getApp(app._id);
                        setApp(updatedApp);
                        toast.success(`${res.deactivatedPromotions} promoções foram desativadas com o fechamento do caixa.`);
                      }
                    } catch (e) {
                      console.error('Erro ao fechar o caixa na API:', e);
                    }
                  }
                }}
              />
            </div>
          </div>
        </main>
      </div>

      <style>{`
.editor-resizer:hover, .editor-resizer:active {
  background-color: var(--ep-primary) !important;
}

@media (max-width: 768px) {
  .editor-view-controls { display: none !important; }
  .editor-main { padding: 0 !important; background-image: none !important; background-color: transparent !important; }
  .editor-preview-wrapper { 
    min-height: calc(100vh - 45px) !important; 
    border: none !important; 
    border-radius: 0 !important; 
    box-shadow: none !important; 
    width: 100% !important; 
    margin: 0 !important; 
    max-width: none !important; 
  }
}

        :root {
          --ep-bg: ${isDark ? '#09090b' : '#f8fafc'};
          --ep-sidebar: ${isDark ? '#18181b' : '#ffffff'};
          --ep-panel: ${isDark ? '#27272a' : '#f1f5f9'};
          /*
           * Escala de texto do PAINEL (nao afeta o preview central, que usa
           * suas proprias variaveis --brand/--on-brand e as classes .phone__*).
           *
           * No escuro os tons antigos (#f4f4f5 no texto e #a1a1aa nos labels)
           * se misturavam ao fundo. Agora:
           *   --ep-text        texto principal, quase branco
           *   --ep-label       labels e descricoes, cinza bem claro
           *   --ep-muted       apoio discreto, ainda legivel
           *   --ep-placeholder unico tom mais apagado, so no placeholder
           */
          --ep-text: ${isDark ? '#f9fafb' : '#18181b'};
          --ep-label: ${isDark ? '#e5e7eb' : '#475569'};
          --ep-muted: ${isDark ? '#d1d5db' : '#64748b'};
          --ep-placeholder: ${isDark ? '#9ca3af' : '#94a3b8'};
          --ep-border: ${isDark ? '#3f3f46' : '#e2e8f0'};
          --ep-accent: ${isDark ? '#3b82f6' : '#2563eb'};
          --ep-accent-hover: ${isDark ? '#60a5fa' : '#1d4ed8'};
          --ep-ring: ${isDark ? 'rgba(59, 130, 246, 0.5)' : 'rgba(37, 99, 235, 0.4)'};
        }

        /* Scrollbar customizada e minimalista */
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${isDark ? '#3f3f46' : '#cbd5e1'}; border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: ${isDark ? '#52525b' : '#94a3b8'}; }

        /* Background com Dot Pattern */
        .editor-main {
          background-color: var(--ep-bg);
          background-size: 24px 24px;
        }

        .ep-input {
          width: 100%;
          padding: 12px 16px;
          border-radius: 8px;
          border: 1px solid var(--ep-border);
          font-size: 0.95rem;
          margin-bottom: 16px;
          background-color: var(--ep-bg);
          color: var(--ep-text);
          /* Peso um pouco maior: no escuro a fonte fina "derrete" no fundo. */
          font-weight: ${isDark ? 500 : 400};
          transition: all 0.2s ease;
          outline: none;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
        .ep-input:focus {
          border-color: var(--ep-accent);
          box-shadow: 0 0 0 3px var(--ep-ring);
        }
        /* Antes o placeholder ficava no cinza padrao do navegador e sumia. */
        .ep-input::placeholder {
          color: var(--ep-placeholder);
          opacity: 1;
        }
        /* No Windows a lista do select herda a cor do sistema: forcamos as duas. */
        select.ep-input,
        select.ep-input option {
          color: var(--ep-text);
          background-color: var(--ep-bg);
        }

        .ep-btn {
          width: 100%;
          padding: 12px 16px;
          border-radius: 8px;
          border: 1px solid transparent;
          background-color: var(--ep-accent);
          color: #ffffff;
          font-weight: 600;
          cursor: pointer;
          font-size: 0.95rem;
          transition: all 0.2s ease;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .ep-btn:hover:not(:disabled) {
          background-color: var(--ep-accent-hover);
          transform: translateY(-1px);
        }
        .ep-btn:active:not(:disabled) {
          transform: translateY(0);
        }
        .ep-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .ep-btn-secondary {
          background-color: var(--ep-bg);
          color: var(--ep-text);
          border: ${isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid var(--ep-border)'};
          box-shadow: none;
        }
        .ep-btn-secondary:hover:not(:disabled) {
          background-color: var(--ep-border);
          color: var(--ep-text);
        }

        .ep-btn-danger {
          background-color: ${isDark ? 'rgba(239, 68, 68, 0.1)' : '#fef2f2'};
          color: #ef4444;
          border: 1px solid ${isDark ? 'rgba(239, 68, 68, 0.2)' : '#fecaca'};
        }
        .ep-btn-danger:hover:not(:disabled) {
          background-color: ${isDark ? 'rgba(239, 68, 68, 0.2)' : '#fca5a5'};
          color: ${isDark ? '#f87171' : '#ffffff'};
        }

        .ep-card {
          padding: 24px;
          background-color: var(--ep-sidebar);
          border-radius: 12px;
          border: ${isDark ? '1px solid rgba(255,255,255,0.05)' : '1px solid var(--ep-border)'};
          box-shadow: ${isDark ? 'none' : '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)'};
          margin-bottom: 20px;
        }

        .ep-label {
          display: block;
          font-size: 0.85rem;
          font-weight: ${isDark ? 700 : 600};
          color: var(--ep-label);
          letter-spacing: ${isDark ? '0.01em' : '0'};
          margin-bottom: 6px;
        }

        /* ==================================================================
           NITIDEZ DA TIPOGRAFIA NO MODO ESCURO — apenas painel esquerdo
           e cabecalho.

           Tudo aqui e escopado por .editor-sidebar, .editor-topbar ou pelas
           classes .ep-* (que NAO existem dentro do preview). A area central
           (.editor-main / .editor-preview / classes .phone__*) fica intacta
           de proposito: o preview representa o app do cliente e nao pode
           herdar a tipografia do painel.
           ================================================================== */
        .editor-sidebar,
        .editor-topbar {
          color: var(--ep-text);
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          text-rendering: optimizeLegibility;
        }

        /* Titulos das secoes: no escuro vinham herdando um cinza medio. */
        .editor-sidebar h2,
        .editor-sidebar h3,
        .editor-sidebar h4,
        .editor-sidebar strong,
        .editor-sidebar b {
          color: var(--ep-text);
          ${isDark ? 'font-weight: 700;' : ''}
        }

        /* Texto corrido, descricoes e apoios. */
        .editor-sidebar p,
        .editor-sidebar span,
        .editor-sidebar small,
        .editor-sidebar li,
        .editor-sidebar label {
          color: var(--ep-label);
        }

        /* O <strong> dentro de um paragrafo continua sendo o destaque. */
        .editor-sidebar p strong,
        .editor-sidebar label strong {
          color: var(--ep-text);
        }

        /* Campos fora do .ep-input (checkbox, file, inputs soltos). */
        .editor-sidebar input,
        .editor-sidebar select,
        .editor-sidebar textarea {
          color: var(--ep-text);
        }

        .editor-sidebar input::placeholder,
        .editor-sidebar textarea::placeholder {
          color: var(--ep-placeholder);
          opacity: 1;
        }

        /* Botoes de icone (editar/remover) precisavam de contraste proprio. */
        .editor-sidebar button {
          color: var(--ep-text);
        }

        /* Links do painel: legiveis sem virar azul escuro sobre fundo escuro. */
        .editor-sidebar a,
        .editor-topbar a:not([style*="background"]) {
          color: ${isDark ? '#93c5fd' : 'var(--ep-accent)'};
        }

        /* Sem opacidade em texto: e o que apagava as descricoes no escuro. */
        .editor-sidebar p,
        .editor-sidebar span,
        .editor-sidebar small {
          opacity: 1;
        }

        /* Outros estilos pre-existentes do editor */
        @media (max-width: 900px) {
          .editor-workspace { flex-direction: column !important; }
          .mobile-tabs { display: flex !important; }
          .editor-sidebar { width: 100% !important; border-right: none !important; }
          .editor-main { padding: 12px !important; display: ${mobileTab === 'preview' ? 'flex' : 'none'} !important; }
          .editor-sidebar { display: ${mobileTab === 'editor' ? 'flex' : 'none'} !important; }
        }
        @media (min-width: 901px) {
          .editor-sidebar { display: flex !important; }
          .editor-main { display: flex !important; }
        }
        .editor-main .phone__tabs { padding: 12px; gap: 12px; border-radius: 16px; }
        .editor-main .phone__tabs button { font-size: 1rem; padding: 12px 16px; font-weight: 800; }
      `}</style>
      {isPromoModalOpen && app && (
        <PromotionsModal
          isOpen={isPromoModalOpen}
          onClose={() => setIsPromoModalOpen(false)}
          onSave={handleSavePromo}
          products={app.products}
          categories={app.categories}
          editingPromo={editingPromo}
        />
      )}
      {ConfirmElement}
    </div>
  );
}
