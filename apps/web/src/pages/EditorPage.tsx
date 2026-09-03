import toast from 'react-hot-toast';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api, getImageUrl, type AppProjectFull } from '../lib/api';
import { EditorPreview } from '../components/EditorPreview';
import type { DeliveryOrder, PreviewProduct, PreviewTable } from '../components/phone/types';
import { useConfirm } from '../components/ConfirmModal';
import { PromotionsModal } from '../components/PromotionsModal';
import { fileToResizedDataUrl } from '../lib/image';
import {
  ArrowLeft,
  Sun,
  Moon,
  Trash2,
  Pencil,
  Star,
  Camera,
  Utensils,
  Lightbulb,
  Eye,
  EyeOff,
  Smartphone,
  Monitor,
  Maximize,
  Minimize2,
} from 'lucide-react';

const SAMPLE_DELIVERIES: DeliveryOrder[] = [];

export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { confirm, ConfirmElement } = useConfirm();

  const [app, setApp] = useState<AppProjectFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [editorTheme, setEditorTheme] = useState<'claro' | 'escuro'>('claro');
  const [mobileTab, setMobileTab] = useState<'editor' | 'preview'>('editor');
  const [viewMode, setViewMode] = useState<'mobile' | 'default' | 'fullscreen'>('default');

  const [appName, setAppName] = useState('');
  const [tagline, setTagline] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#F95D2A');
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
  const [catImage, setCatImage] = useState<string | null>(null);
  const catFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadApp() {
      try {
        if (!id) return;
        const data = await api.getApp(id);
        setApp(data);
        setAppName(data.name);
        setTagline(data.brand.tagline || '');
        setPrimaryColor(data.brand.primaryColor || '#F95D2A');
        setLogoUrl(getImageUrl(data.brand.logo));

        if (data.categories && data.categories.length > 0) {
          setProdCategory(data.categories[0].name);
        }

        setLiveTables(
          data.tables.map((t: any) => ({
            id: t._id,
            label: t.label,
            seats: t.seats,
            area: t.area,
            status: 'livre',
            items: [],
          }))
        );
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

  async function handleToggleWaiterCommission(checked: boolean) {
    if (!app) return;
    try {
      const updated = await api.updateApp(app._id, {
        dining: {
          isWaiterCommissionEnabled: checked,
          waiterCommissionPercentage: app.dining?.waiterCommissionPercentage ?? 10,
        },
      });
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
          await Promise.all(afetados.map((p) => api.updateProduct(app._id, p._id, { category: updated.name })));
          newProducts = app.products.map((p) => (p.category === anterior!.name ? { ...p, category: updated.name } : p));
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
      toast.error(editingCatId ? 'Erro ao salvar categoria' : 'Erro ao criar categoria');
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
      },
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
          imageBase64: prodImage && prodImage.startsWith('data:') ? prodImage.split(',')[1] : undefined,
        });
        setApp({ ...app, products: app.products.map((p: any) => (p._id === editingProductId ? updatedProd : p)) });
      } else {
        const newProd = await api.addProduct(app._id, {
          name: prodName,
          description: prodDesc,
          price: priceVal,
          pricingType: prodPricingType,
          category: prodCategory,
          isFeatured: prodFeatured,
          imageBase64: prodImage?.split(',')[1],
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
    setProdPricingType(p.pricingType === 'weight' ? 'weight' : 'unit');
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
      },
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
        setApp({ ...app, tables: app.tables.map((t: any) => (t._id === editingTableId ? updatedTable : t)) });
        setLiveTables(
          liveTables.map((t: any) =>
            t.id === editingTableId
              ? { ...t, label: updatedTable.label, seats: updatedTable.seats, area: updatedTable.area }
              : t
          )
        );
      } else {
        const newTable = await api.addTable(app._id, {
          label: tableLabel,
          seats: parseInt(tableSeats, 10),
          area: tableArea,
        });
        setApp({ ...app, tables: [...app.tables, newTable] });
        setLiveTables((prev) => [
          ...prev,
          {
            id: newTable._id,
            label: newTable.label,
            seats: newTable.seats,
            area: newTable.area,
            status: 'livre',
            items: [],
          },
        ]);
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
      },
    });
  }

  async function handleSavePromo(promoData: any) {
    if (!app) return;
    if (editingPromo) {
      const updated = await api.updatePromotion(app._id, editingPromo._id, promoData);
      setApp({ ...app, promotions: app.promotions.map((p: any) => (p._id === editingPromo._id ? updated : p)) });
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
      },
    });
  }

  async function handleTogglePromoStatus(promoId: string, currentStatus: boolean) {
    if (!app) return;
    try {
      const updated = await api.updatePromotion(app._id, promoId, { active: !currentStatus });
      setApp({ ...app, promotions: app.promotions.map((p: any) => (p._id === promoId ? updated : p)) });
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
      pricingType: p.pricingType,
      category: p.category,
      isFeatured: p.isFeatured,
      imageUrl: getImageUrl(p.image),
      emoji: '',
    }));
  }, [app]);

  if (loading || !app) {
    return (
      <div className="studio-root" data-theme="claro">
        <p style={{ padding: '4rem', textAlign: 'center' }}>Carregando editor...</p>
      </div>
    );
  }

  const isDark = editorTheme === 'escuro';
  const planType = app.appPlanType || 'TESTE_COMPLETO';
  const isDeliveryOnly = planType.includes('DELIVERY');
  const isSalaoOnly = planType.includes('SALAO');
  const showDelivery = !isSalaoOnly;
  const showRoom = !isDeliveryOnly;
  const isFullscreen = viewMode === 'fullscreen';

  return (
    <div className="studio-root" data-theme={editorTheme}>
      {!isFullscreen && (
        <header className="studio-topbar">
          <div className="studio-topbar__brand">
            <Link to="/painel" className="studio-pill studio-pill--ghost">
              <ArrowLeft size={18} />
              Voltar
            </Link>
            <h1 className="studio-topbar__title">{app.name}</h1>
          </div>
          <div className="studio-topbar__actions">
            <button
              type="button"
              className="studio-pill studio-pill--ghost"
              onClick={() => setEditorTheme(isDark ? 'claro' : 'escuro')}
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
              {isDark ? 'Claro' : 'Escuro'}
            </button>
            <Link to={`/painel/app/${app._id}/planos`} className="studio-pill studio-pill--success">
              Contratar Plano
            </Link>
          </div>
        </header>
      )}

      {!isFullscreen && (
        <div className="studio-mobile-tabs">
          <button
            type="button"
            className={mobileTab === 'editor' ? 'is-active' : ''}
            onClick={() => setMobileTab('editor')}
          >
            Editar
          </button>
          <button
            type="button"
            className={mobileTab === 'preview' ? 'is-active' : ''}
            onClick={() => setMobileTab('preview')}
          >
            Visualizar
          </button>
        </div>
      )}

      <div className={`studio-workspace ${isFullscreen ? 'is-fullscreen' : ''}`}>
        <aside className={`studio-sidebar ${mobileTab === 'editor' ? 'is-open' : ''}`}>
          <section className="studio-section">
            <h2>Cardápio</h2>
            <div className="studio-card">
              <h3>Categorias</h3>
              <p className="studio-hint">
                {editingCatId
                  ? 'Editando a categoria. Troque o nome, a foto, ou cancele.'
                  : 'A categoria vira um card com foto no cardápio do cliente.'}
              </p>
              <form onSubmit={handleSaveCategory} className="studio-row" style={{ marginBottom: 16 }}>
                <button
                  type="button"
                  className="studio-thumb"
                  title="Foto da categoria"
                  onClick={() => catFileInputRef.current?.click()}
                >
                  {catImage ? <img src={catImage} alt="Foto da categoria" /> : <Camera size={20} color="#a8a29e" />}
                </button>
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  ref={catFileInputRef}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      const dataUrl = await fileToResizedDataUrl(f, 400);
                      setCatImage(dataUrl);
                    }
                  }}
                />
                <input
                  type="text"
                  className="studio-input"
                  placeholder="Nome (Ex: Lanches)"
                  required
                  value={newCat}
                  onChange={(e) => setNewCat(e.target.value)}
                />
                <button type="submit" disabled={isAddingCat} className="studio-pill studio-pill--brand">
                  {editingCatId ? 'Salvar' : 'Adicionar'}
                </button>
                {editingCatId && (
                  <button type="button" onClick={cancelCategoryEdit} className="studio-pill studio-pill--ghost">
                    Cancelar
                  </button>
                )}
              </form>
              <div className="studio-list">
                {app.categories?.map((c: any) => {
                  const emEdicao = editingCatId === c._id;
                  const itens = app.products.filter((p: any) => p.category === c.name).length;
                  return (
                    <div
                      key={c._id}
                      className="studio-item"
                      style={emEdicao ? { borderColor: '#F95D2A', boxShadow: '0 0 0 3px rgba(249,93,42,0.15)' } : undefined}
                    >
                      {c.image ? (
                        <img
                          src={getImageUrl(c.image) || undefined}
                          alt=""
                          style={{ width: 40, height: 40, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }}
                        />
                      ) : (
                        <span className="studio-thumb" style={{ width: 40, height: 40, cursor: 'default' }}>
                          <Utensils size={16} />
                        </span>
                      )}
                      <div className="studio-item__body">
                        <strong>{c.name}</strong>
                        <span>{itens} {itens === 1 ? 'item' : 'itens'}</span>
                      </div>
                      <div className="studio-item__actions">
                        <button
                          type="button"
                          className="studio-pill studio-pill--ghost studio-pill--icon"
                          title="Editar categoria"
                          onClick={() => startCategoryEdit(c)}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          className="studio-pill studio-pill--icon studio-danger"
                          title="Remover categoria"
                          onClick={() => void handleRemoveCategory(c._id, c.name)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {(!app.categories || app.categories.length === 0) && (
                  <div className="studio-empty">Nenhuma categoria criada.</div>
                )}
              </div>
            </div>

            <form onSubmit={handleSaveProduct} className="studio-card">
              <h3>{editingProductId ? 'Editar Produto' : 'Adicionar Produto'}</h3>
              {!app.categories || app.categories.length === 0 ? (
                <p className="studio-hint" style={{ color: '#dc2626', fontWeight: 700 }}>
                  Crie uma categoria acima primeiro.
                </p>
              ) : (
                <>
                  <div className="studio-row" style={{ alignItems: 'stretch', marginBottom: 12 }}>
                    <button
                      type="button"
                      className="studio-thumb studio-thumb--lg"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {prodImage ? <img src={prodImage} alt="Foto" /> : <Camera size={28} color="#a8a29e" />}
                    </button>
                    <div className="flex flex-col gap-2 w-full min-w-0">
                      <input
                        type="text"
                        className="studio-input"
                        placeholder="Nome do produto"
                        required
                        value={prodName}
                        onChange={(e) => setProdName(e.target.value)}
                      />
                      <div className="studio-row">
                        <span style={{ fontWeight: 800, flexShrink: 0 }}>R$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          className="studio-input"
                          placeholder="32,90"
                          required
                          value={prodPrice}
                          onChange={(e) => setProdPrice(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="studio-field" style={{ marginBottom: 12 }}>
                    <span>Categoria</span>
                    <select
                      required
                      value={prodCategory}
                      onChange={(e) => setProdCategory(e.target.value)}
                      className="studio-input"
                    >
                      {app.categories.map((c: any) => (
                        <option key={c._id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="studio-field" style={{ marginBottom: 12 }}>
                    <span>Cobrança</span>
                    <select
                      value={prodPricingType}
                      onChange={(e) => setProdPricingType(e.target.value as 'unit' | 'weight')}
                      className="studio-input"
                    >
                      <option value="unit">Por unidade</option>
                      <option value="weight">Por peso (kg)</option>
                    </select>
                  </div>
                  <textarea
                    className="studio-input"
                    placeholder="Descrição breve (opcional)"
                    value={prodDesc}
                    onChange={(e) => setProdDesc(e.target.value)}
                    rows={2}
                    style={{ marginBottom: 12 }}
                  />
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    ref={fileInputRef}
                    onChange={(e) => void handleFileSelect(e.target.files?.[0])}
                  />
                  <label className="studio-check" style={{ marginBottom: 16 }}>
                    <input
                      type="checkbox"
                      checked={prodFeatured}
                      onChange={(e) => setProdFeatured(e.target.checked)}
                    />
                    <span>
                      <strong style={{ display: 'block', color: 'var(--studio-ink)' }}>Destacar no topo</strong>
                      <span className="studio-hint" style={{ margin: 0 }}>
                        Aparece primeiro na aba do cliente.
                      </span>
                    </span>
                  </label>
                  <div className="studio-row">
                    {editingProductId && (
                      <button type="button" onClick={resetProdForm} className="studio-pill studio-pill--ghost w-full md:w-auto">
                        Cancelar
                      </button>
                    )}
                    <button type="submit" disabled={isSavingProd} className="studio-pill studio-pill--brand w-full md:w-auto">
                      {isSavingProd ? 'Salvando...' : editingProductId ? 'Salvar edição' : 'Adicionar'}
                    </button>
                  </div>
                </>
              )}
            </form>

            <div className="studio-list">
              {app.products.map((p: any) => (
                <div key={p._id} className="studio-item">
                  <div className="studio-item__body">
                    <strong>
                      {p.isFeatured && (
                        <Star size={14} fill="#f59e0b" color="#f59e0b" style={{ marginRight: 4, verticalAlign: 'middle' }} />
                      )}
                      {p.name}
                    </strong>
                    <span>
                      R$ {p.price.toFixed(2)} · {p.category}
                    </span>
                  </div>
                  <div className="studio-item__actions">
                    <button
                      type="button"
                      className="studio-pill studio-pill--ghost studio-pill--icon"
                      onClick={() => editProduct(p)}
                    >
                      <Pencil size={18} />
                    </button>
                    <button
                      type="button"
                      className="studio-pill studio-pill--icon studio-danger"
                      onClick={() => void handleDeleteProduct(p._id)}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="studio-section">
            <div className="studio-section__head">
              <h2>Promoções e Combos</h2>
              <button
                type="button"
                className="studio-pill studio-pill--brand"
                onClick={() => {
                  setEditingPromo(null);
                  setIsPromoModalOpen(true);
                }}
              >
                Nova promoção
              </button>
            </div>
            <div className="studio-list">
              {(!app.promotions || app.promotions.length === 0) && (
                <p className="studio-hint">Nenhuma promoção ativa no momento.</p>
              )}
              {app.promotions?.map((p: any) => (
                <div key={p._id} className="studio-item">
                  <div className="studio-item__body">
                    <strong>{p.name}</strong>
                    <span>
                      {p.type === 'combo' ? 'Combo' : 'Desconto'} · R$ {p.promotionalPrice.toFixed(2)}
                      {p.expiresOnRegisterClose && ' · até fechar o caixa'}
                    </span>
                  </div>
                  <div className="studio-item__actions">
                    <button
                      type="button"
                      className="studio-pill studio-pill--ghost studio-pill--icon"
                      title={p.active ? 'Ativo' : 'Inativo'}
                      onClick={() => void handleTogglePromoStatus(p._id, p.active)}
                    >
                      {p.active ? <Eye size={18} color="#059669" /> : <EyeOff size={18} color="#a8a29e" />}
                    </button>
                    <button
                      type="button"
                      className="studio-pill studio-pill--ghost studio-pill--icon"
                      onClick={() => {
                        setEditingPromo(p);
                        setIsPromoModalOpen(true);
                      }}
                    >
                      <Pencil size={18} />
                    </button>
                    <button
                      type="button"
                      className="studio-pill studio-pill--icon studio-danger"
                      onClick={() => void handleDeletePromo(p._id)}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {showDelivery && (
            <section className="studio-section">
              <h2>Entrega</h2>
              <label className="studio-card studio-check" style={{ marginBottom: 0 }}>
                <input
                  type="checkbox"
                  checked={Boolean(app.delivery?.courierPaidPerDelivery)}
                  onChange={(e) => void handleToggleCourierPayment(e.target.checked)}
                />
                <span>
                  <strong style={{ display: 'block', color: 'var(--studio-ink)' }}>O entregador recebe por entrega</strong>
                  <span className="studio-hint" style={{ margin: 0 }}>
                    Ligado, o fechamento de caixa separa o valor dos pedidos das taxas de entrega — é o valor que o
                    recepcionista acerta com o entregador no fim do turno.
                  </span>
                </span>
              </label>
            </section>
          )}

          {showRoom && (
            <section className="studio-section">
              <h2>Salão e Mesas</h2>
              <div className="studio-card">
                <label className="studio-check">
                  <input
                    type="checkbox"
                    checked={Boolean(app.dining?.isWaiterCommissionEnabled)}
                    onChange={(e) => void handleToggleWaiterCommission(e.target.checked)}
                  />
                  <span>
                    <strong style={{ display: 'block', color: 'var(--studio-ink)' }}>Cobrar comissão do garçom</strong>
                    <span className="studio-hint" style={{ margin: 0 }}>
                      Adiciona automaticamente uma taxa de serviço no total da mesa ao fechar a conta.
                    </span>
                  </span>
                </label>
                {app.dining?.isWaiterCommissionEnabled && (
                  <div className="studio-field" style={{ marginTop: 16, maxWidth: 160 }}>
                    <span>Porcentagem (%)</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={app.dining?.waiterCommissionPercentage ?? 10}
                      onChange={handleUpdateWaiterCommissionPercent}
                      className="studio-input"
                    />
                  </div>
                )}
              </div>

              <form onSubmit={handleSaveTable} className="studio-card">
                <h3>{editingTableId ? 'Editar Mesa' : 'Adicionar Mesa'}</h3>
                <div className="studio-row" style={{ marginBottom: 12 }}>
                  <input
                    type="text"
                    className="studio-input"
                    placeholder="Rótulo (Ex: 01)"
                    required
                    value={tableLabel}
                    onChange={(e) => setTableLabel(e.target.value)}
                  />
                  <input
                    type="number"
                    className="studio-input"
                    placeholder="Lugares (Ex: 4)"
                    min="1"
                    required
                    value={tableSeats}
                    onChange={(e) => setTableSeats(e.target.value)}
                  />
                </div>
                <select value={tableArea} onChange={(e) => setTableArea(e.target.value)} className="studio-input" style={{ marginBottom: 12 }}>
                  <option value="Salão">Salão Principal</option>
                  <option value="Varanda">Varanda</option>
                  <option value="Balcão">Balcão</option>
                </select>
                <div className="studio-row">
                  {editingTableId && (
                    <button type="button" onClick={resetTableForm} className="studio-pill studio-pill--ghost w-full md:w-auto">
                      Cancelar
                    </button>
                  )}
                  <button type="submit" disabled={isSavingTable} className="studio-pill studio-pill--brand w-full md:w-auto">
                    {isSavingTable ? 'Salvando...' : editingTableId ? 'Salvar edição' : 'Adicionar'}
                  </button>
                </div>
              </form>

              <div className="studio-list">
                {app.tables.map((t: any) => (
                  <div key={t._id} className="studio-item">
                    <div className="studio-item__body">
                      <strong>Mesa {t.label}</strong>
                      <span>
                        {t.seats} lugares · {t.area}
                      </span>
                    </div>
                    <div className="studio-item__actions">
                      <button
                        type="button"
                        className="studio-pill studio-pill--ghost studio-pill--icon"
                        onClick={() => editTable(t)}
                      >
                        <Pencil size={18} />
                      </button>
                      <button
                        type="button"
                        className="studio-pill studio-pill--icon studio-danger"
                        onClick={() => void handleDeleteTable(t._id)}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </aside>

        <main className={`studio-stage ${mobileTab === 'preview' ? 'is-open' : ''} ${isFullscreen ? 'is-fullscreen' : ''}`}>
          <div className="studio-stage__bar">
            {viewMode !== 'fullscreen' && (
              <p className="studio-stage__hint">
                <Lightbulb size={16} color="#f59e0b" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
                Interaja com o aplicativo para testar cardápio, mesas e entregas.
              </p>
            )}
            {viewMode === 'fullscreen' && <p className="studio-stage__hint">Simulador em tela cheia</p>}
            <div className="studio-view-toggle" role="group" aria-label="Modo de visualização">
              <button
                type="button"
                className={viewMode === 'mobile' ? 'is-active' : ''}
                onClick={() => setViewMode('mobile')}
              >
                <Smartphone size={16} /> Celular
              </button>
              <button
                type="button"
                className={viewMode === 'default' ? 'is-active' : ''}
                onClick={() => setViewMode('default')}
              >
                <Monitor size={16} /> Padrão
              </button>
              <button
                type="button"
                className={viewMode === 'fullscreen' ? 'is-active' : ''}
                onClick={() => setViewMode(viewMode === 'fullscreen' ? 'default' : 'fullscreen')}
              >
                {viewMode === 'fullscreen' ? <Minimize2 size={16} /> : <Maximize size={16} />}
                {viewMode === 'fullscreen' ? 'Sair' : 'Tela cheia'}
              </button>
            </div>
          </div>

          <div className={`studio-canvas studio-canvas--${viewMode}`}>
            <div className={`studio-device studio-device--${viewMode}`}>
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
                showRoomTab={showRoom}
                showDeliveryTab={showDelivery}
                liveBadge={true}
                waiterCommissionRate={
                  app.dining?.isWaiterCommissionEnabled ? (app.dining.waiterCommissionPercentage ?? 10) / 100 : 0
                }
                onTablesChange={setLiveTables}
                onCloseRegister={async () => {
                  if (app) {
                    try {
                      const res = await api.closeCashRegister(app._id);
                      if (res.deactivatedPromotions > 0) {
                        const updatedApp = await api.getApp(app._id);
                        setApp(updatedApp);
                        toast.success(
                          `${res.deactivatedPromotions} promoções foram desativadas com o fechamento do caixa.`
                        );
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
