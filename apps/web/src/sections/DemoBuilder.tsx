import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PhonePreview, type PreviewProduct, type PreviewTable } from '../components/PhonePreview';
import { IconRenderer } from '../components/IconRenderer';
import { TbCamera, TbConfetti, TbBulb, TbHandClick, TbArrowUp, TbCheck, TbX } from 'react-icons/tb';
import { SectionHeading } from '../components/SectionHeading';
import { demo } from '../data/content';
import { api, ApiError } from '../lib/api';
import { fileToResizedDataUrl } from '../lib/image';
import { brl, parsePrice } from '../lib/format';

const BRAND_COLORS = ['#FF6B2C', '#E11D48', '#16A34A', '#2563EB', '#7C3AED', '#0F172A'];

type Preset = { name: string; description: string; price: number };

const PRESETS_BY_TYPE: Record<string, Preset[]> = {
  restaurante: [
    { name: 'Filé à Parmegiana', description: 'Com arroz, fritas e molho da casa', price: 62.9 },
    { name: 'Feijoada Individual', description: 'Acompanha couve, farofa e laranja', price: 48 },
    { name: 'Salada Caesar', description: 'Frango grelhado, croutons e parmesão', price: 34.5 },
  ],
  bar: [
    { name: 'Porção de Calabresa', description: '400g com cebola caramelizada e pão torrado', price: 44.9 },
    { name: 'Chopp Pilsen 500ml', description: 'Gelado, colarinho na medida', price: 14 },
    { name: 'Caipirinha de Limão', description: 'Cachaça artesanal e limão taiti', price: 22 },
  ],
  lanchonete: [
    { name: 'Smash Duplo da Casa', description: 'Dois blends de 90g, cheddar, picles e pão brioche', price: 32.9 },
    { name: 'Batata Rústica', description: 'Com alecrim e maionese da casa', price: 18 },
    { name: 'Milk Shake 400ml', description: 'Ovomaltine, chocolate ou morango', price: 21 },
  ],
  pizzaria: [
    { name: 'Pizza Margherita', description: 'Molho italiano, muçarela de búfala e manjericão', price: 54 },
    { name: 'Pizza Calabresa', description: 'Calabresa fatiada, cebola e orégano', price: 49 },
    { name: 'Refrigerante 2L', description: 'Gelado, na hora da entrega', price: 12 },
  ],
  cafeteria: [
    { name: 'Cappuccino 300ml', description: 'Espresso, leite vaporizado e canela', price: 15 },
    { name: 'Pão de Queijo (3un)', description: 'Assado na hora, queijo canastra', price: 12 },
    { name: 'Bolo de Cenoura', description: 'Fatia generosa com ganache', price: 14 },
  ],
  mercado: [
    { name: 'Cesta Básica Completa', description: '12 itens essenciais do mês', price: 129.9 },
    { name: 'Água Mineral 5L', description: 'Sem gás, garrafão retornável', price: 9.9 },
    { name: 'Carvão 3kg', description: 'Pronto para o churrasco de domingo', price: 24.9 },
  ],
};

type DemoResult = { code: string; slug: string; offline: boolean };

const SAMPLE_DELIVERIES = [{ ...demo.sampleDelivery, id: 'demo-sample-delivery' }];

function localCode() {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let out = '';
  for (let i = 0; i < 5; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `FW-${out}`;
}

export function DemoBuilder() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  const [businessType, setBusinessType] = useState('restaurante');
  const [restaurantName, setRestaurantName] = useState('');
  const [tagline, setTagline] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [brandColor, setBrandColor] = useState(BRAND_COLORS[0]);

  const [products, setProducts] = useState<PreviewProduct[]>([]);
  const [draft, setDraft] = useState({ name: '', description: '', price: '', imageUrl: '' });

  const [tables, setTables] = useState<PreviewTable[]>([]);
  const [tableForm, setTableForm] = useState({ area: demo.tables.areas[0], seats: 4, quantity: 4 });

  const [ownerEmail, setOwnerEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<DemoResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const typeInfo = demo.businessTypes.find((t) => t.value === businessType) ?? demo.businessTypes[0];
  const displayName = restaurantName.trim() || 'Seu Negócio';

  const previewProducts = useMemo<PreviewProduct[]>(
    () =>
      products.length > 0
        ? products
        : draft.name.trim()
          ? [
              {
                id: 'draft',
                name: draft.name,
                description: draft.description,
                price: parsePrice(draft.price),
                imageUrl: draft.imageUrl || null,
                iconName: typeInfo.iconName,
                category: 'Destaques',
                isFeatured: true,
              },
            ]
          : [],
    [products, draft, typeInfo.iconName]
  );

  const totalSeats = tables.reduce((sum, t) => sum + t.seats, 0);

  async function handleImage(file: File | undefined, target: 'logo' | 'photo') {
    if (!file) return;
    setError(null);
    try {
      const dataUrl = await fileToResizedDataUrl(file, target === 'logo' ? 320 : 720);
      if (target === 'logo') setLogoUrl(dataUrl);
      else setDraft((d) => ({ ...d, imageUrl: dataUrl }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não conseguimos usar essa imagem.');
    }
  }

  function addProduct() {
    if (!draft.name.trim()) {
      setError('Dê um nome ao produto para continuar.');
      return;
    }
    const price = parsePrice(draft.price);
    if (price <= 0) {
      setError('Informe o preço do produto (ex.: 32,90).');
      return;
    }
    setError(null);
    setProducts((list) => [
      ...list,
      {
        id: `p-${Date.now()}`,
        name: draft.name.trim(),
        description: draft.description.trim(),
        price,
        imageUrl: draft.imageUrl || null,
        iconName: typeInfo.iconName,
        category: 'Destaques',
        isFeatured: true,
      },
    ]);
    setDraft({ name: '', description: '', price: '', imageUrl: '' });
  }

  function addPreset(preset: Preset) {
    setDraft({
      name: preset.name,
      description: preset.description,
      price: String(preset.price.toFixed(2)).replace('.', ','),
      imageUrl: '',
    });
    setError(null);
  }

  function addTables(area: string, seats: number, quantity: number) {
    setError(null);
    setTables((list) => {
      const start = list.length;
      const created: PreviewTable[] = Array.from({ length: quantity }, (_, i) => ({
        id: `t-${Date.now()}-${i}`,
        label: String(start + i + 1).padStart(2, '0'),
        seats,
        area,
        status: 'livre',
        items: [],
      }));
      return [...list, ...created].slice(0, 40);
    });
  }

  function removeProduct(id?: string) {
    if (!id) return;
    setProducts((list) => list.filter((p) => p.id !== id));
  }

  function goToStep(next: number) {
    if (next >= 1 && !restaurantName.trim()) {
      setError('Escreva o nome do seu negócio para seguir.');
      setStep(0);
      return;
    }
    if (next >= 2 && products.length === 0) {
      if (draft.name.trim()) {
        addProduct();
      } else {
        setError('Cadastre pelo menos um item do cardápio.');
        setStep(1);
        return;
      }
    }
    setError(null);
    setStep(next);
  }

  async function submit() {
    const finalProducts = products.length > 0 ? products : previewProducts;
    if (!restaurantName.trim() || finalProducts.length === 0) {
      setError('Complete os passos 1 e 2 antes de gerar o código.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const created = await api.createDemoStore({
        restaurantName: restaurantName.trim(),
        businessType,
        tagline: tagline.trim(),
        logoUrl,
        brandColor,
        theme: 'claro',
        ownerEmail: ownerEmail.trim() || undefined,
        products: finalProducts.map((p) => ({
          name: p.name,
          description: p.description ?? '',
          price: p.price,
          imageUrl: p.imageUrl ?? null,
          category: 'Destaques',
        })),
        tables: tables.map((t) => ({ label: t.label, seats: t.seats, area: t.area })),
      });
      setResult({ code: created.code, slug: created.slug, offline: false });
    } catch (err: any) {
      const message = err instanceof ApiError ? err.message : 'Não conseguimos salvar agora.';
      setError(message);
      setResult({ code: localCode(), slug: 'demonstracao', offline: true });
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setStep(0);
    setBusinessType('restaurante');
    setRestaurantName('');
    setTagline('');
    setLogoUrl(null);
    setBrandColor(BRAND_COLORS[0]);
    setProducts([]);
    setDraft({ name: '', description: '', price: '', imageUrl: '' });
    setTables([]);
    setOwnerEmail('');
    setResult(null);
    setError(null);
  }

  const current = demo.steps[step];
  const presets = PRESETS_BY_TYPE[businessType] ?? PRESETS_BY_TYPE.restaurante;

  return (
    <section className="demo section" id="demonstracao">
      <div className="container">
        <SectionHeading eyebrow={demo.eyebrow} title={demo.title} subtitle={demo.subtitle} tone="dark" />

        <div className="demo__shell">
          <div className="demo__panel">
            <ol className="stepper" aria-label="Etapas da demonstração">
              {demo.steps.map((item, index) => (
                <li key={item.key}>
                  <button
                    type="button"
                    className={`stepper__item ${index === step ? 'is-active' : ''} ${index < step ? 'is-done' : ''}`}
                    onClick={() => (index <= step ? setStep(index) : goToStep(index))}
                  >
                    <span className="stepper__num">{index < step ? '✓' : index + 1}</span>
                    {item.label}
                  </button>
                </li>
              ))}
            </ol>

            {!result && (
              <div className="demo__step">
                <h3>{current.title}</h3>
                <p className="demo__helper">{current.helper}</p>

                {step === 0 && (
                  <div className="form">
                    <div className="field">
                      <span className="field__label">{demo.form.typeLabel}</span>
                      <div className="type-grid">
                        {demo.businessTypes.map((type) => (
                          <label key={type.value} className="radio-card">
                            <input
                              type="radio"
                              name="businessType"
                              value={type.value}
                              checked={businessType === type.value}
                              onChange={(e) => setBusinessType(e.target.value)}
                            />
                            <div className="radio-card__content">
                              <span aria-hidden="true" style={{ fontSize: '1.4rem' }}>
                                <IconRenderer name={type.iconName} />
                              </span>
                              <span>{type.label}</span>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="field">
                      <label htmlFor="demo-name">{demo.form.nameLabel}</label>
                      <input
                        id="demo-name"
                        type="text"
                        maxLength={40}
                        placeholder={demo.form.namePlaceholder}
                        value={restaurantName}
                        onChange={(e) => setRestaurantName(e.target.value)}
                      />
                    </div>

                    <div className="field">
                      <label htmlFor="demo-tagline">{demo.form.taglineLabel}</label>
                      <input
                        id="demo-tagline"
                        type="text"
                        maxLength={60}
                        placeholder={demo.form.taglinePlaceholder}
                        value={tagline}
                        onChange={(e) => setTagline(e.target.value)}
                      />
                    </div>

                    <div className="field">
                      <span className="field__label">{demo.form.logoLabel}</span>
                      <div className="upload">
                        <button type="button" className="upload__box" onClick={() => logoInputRef.current?.click()}>
                          {logoUrl ? (
                            <img src={logoUrl} alt="Logo enviada" />
                          ) : (
                            <>
                              <span aria-hidden="true"><TbArrowUp /></span>
                              <strong>Enviar logotipo</strong>
                            </>
                          )}
                        </button>
                        <div className="upload__side">
                          <p className="field__hint">{demo.form.logoHint}</p>
                          <span className="field__label">{demo.form.colorLabel}</span>
                          <div className="colors">
                            {BRAND_COLORS.map((color) => (
                              <button
                                type="button"
                                key={color}
                                className={`color-dot ${brandColor === color ? 'is-active' : ''}`}
                                style={{ background: color }}
                                onClick={() => setBrandColor(color)}
                                aria-label={`Usar a cor ${color}`}
                              />
                            ))}
                            <label className="color-custom">
                              <input
                                type="color"
                                value={brandColor}
                                onChange={(e) => setBrandColor(e.target.value)}
                                aria-label="Escolher outra cor"
                              />
                            </label>
                          </div>
                        </div>
                        <input
                          ref={logoInputRef}
                          type="file"
                          accept="image/*"
                          hidden
                          onChange={(e) => void handleImage(e.target.files?.[0], 'logo')}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {step === 1 && (
                  <div className="form">
                    <div className="presets">
                      <span>Sugestões para {typeInfo.label.toLowerCase()}:</span>
                      <div className="presets__row">
                        {presets.map((preset) => (
                          <button 
                            key={preset.name} 
                            type="button" 
                            className="btn btn--ghost" 
                            onClick={() => addPreset(preset)}
                          >
                            <span style={{ fontSize: '1.1rem', marginRight: '4px', display: 'inline-flex', verticalAlign: 'middle' }}>
                              <IconRenderer name={typeInfo.iconName} />
                            </span>
                            {preset.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="field">
                      <label htmlFor="p-name">{demo.form.productNameLabel}</label>
                      <input
                        id="p-name"
                        type="text"
                        maxLength={60}
                        placeholder={demo.form.productNamePlaceholder}
                        value={draft.name}
                        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      />
                    </div>

                    <div className="field">
                      <label htmlFor="p-desc">{demo.form.productDescLabel}</label>
                      <textarea
                        id="p-desc"
                        rows={2}
                        maxLength={160}
                        placeholder={demo.form.productDescPlaceholder}
                        value={draft.description}
                        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                      />
                    </div>

                    <div className="field-row">
                      <div className="field">
                        <label htmlFor="p-price">{demo.form.productPriceLabel}</label>
                        <div className="input-prefix">
                          <span>R$</span>
                          <input
                            id="p-price"
                            type="text"
                            inputMode="decimal"
                            placeholder="32,90"
                            value={draft.price}
                            onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="field">
                        <span className="field__label">{demo.form.productPhotoLabel}</span>
                        <button type="button" className="upload__thumb" onClick={() => photoInputRef.current?.click()}>
                          {draft.imageUrl ? <img src={draft.imageUrl} alt="Foto do produto" /> : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <TbCamera /> Enviar foto
                            </span>
                          )}
                        </button>
                        <input
                          ref={photoInputRef}
                          type="file"
                          accept="image/*"
                          hidden
                          onChange={(e) => void handleImage(e.target.files?.[0], 'photo')}
                        />
                      </div>
                    </div>
                    <p className="field__hint">{demo.form.productPhotoHint}</p>

                    <button type="button" className="btn btn--soft" onClick={addProduct}>
                      + {demo.form.addProduct}
                    </button>

                    {products.length > 0 && (
                      <ul className="draft-list">
                        {products.map((product) => (
                          <li key={product.id}>
                            <span>{product.name}</span>
                            <span className="draft-list__price">{brl(product.price)}</span>
                            <button
                              type="button"
                              className="btn btn--ghost"
                              onClick={() => removeProduct(product.id)}
                              aria-label={`Remover ${product.name}`}
                              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                              <TbX />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {step === 2 && (
                  <div className="form">
                    <div className="presets">
                      <span>{demo.tables.quickLabel}</span>
                      <div className="presets__row">
                        {demo.tables.quickOptions.map((option) => (
                          <button
                            type="button"
                            key={option.label}
                            onClick={() => addTables(option.area, option.seats, option.quantity)}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="field-row field-row--three">
                      <div className="field">
                        <label htmlFor="t-area">{demo.tables.areaLabel}</label>
                        <select
                          id="t-area"
                          value={tableForm.area}
                          onChange={(e) => setTableForm({ ...tableForm, area: e.target.value })}
                        >
                          {demo.tables.areas.map((area) => (
                            <option key={area} value={area}>
                              {area}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label htmlFor="t-seats">{demo.tables.seatsLabel}</label>
                        <input
                          id="t-seats"
                          type="number"
                          min={1}
                          max={20}
                          value={tableForm.seats}
                          onChange={(e) => setTableForm({ ...tableForm, seats: Number(e.target.value) })}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="t-qty">{demo.tables.quantityLabel}</label>
                        <input
                          id="t-qty"
                          type="number"
                          min={1}
                          max={20}
                          value={tableForm.quantity}
                          onChange={(e) => setTableForm({ ...tableForm, quantity: Number(e.target.value) })}
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      className="btn btn--soft"
                      onClick={() => addTables(tableForm.area, tableForm.seats, tableForm.quantity)}
                    >
                      + {demo.tables.addLabel}
                    </button>

                    {tables.length === 0 ? (
                      <p className="field__hint">{demo.tables.emptyLabel}</p>
                    ) : (
                      <div className="tables-summary">
                        <strong>{demo.tables.countLabel(tables.length, totalSeats)}</strong>
                        <button type="button" className="link-button" onClick={() => setTables([])}>
                          {demo.tables.clearLabel}
                        </button>
                      </div>
                    )}

                    <p className="demo__callout">
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><TbHandClick /> {demo.tables.testHint}</span>
                    </p>
                  </div>
                )}

                {step === 3 && (
                  <div className="form">
                    <ul className="checklist">
                      <li>
                        <span aria-hidden="true" style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: '4px' }}><TbCheck /></span> Site de delivery com a sua marca
                      </li>
                      <li>
                        <span aria-hidden="true" style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: '4px' }}><TbCheck /></span> Cardápio com {previewProducts.length}{' '}
                        {previewProducts.length === 1 ? 'item' : 'itens'}
                      </li>
                      <li>
                        <span aria-hidden="true" style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: '4px' }}><TbCheck /></span>{' '}
                        {tables.length > 0
                          ? `Salão com ${demo.tables.countLabel(tables.length, totalSeats)}`
                          : 'Operação de delivery (salão pode ser ligado depois)'}
                      </li>
                      <li>
                        <span aria-hidden="true" style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: '4px' }}><TbCheck /></span> Código do restaurante para a sua equipe entrar no app
                      </li>
                    </ul>

                    <div className="field">
                      <label htmlFor="demo-email">{demo.form.emailLabel}</label>
                      <input
                        id="demo-email"
                        type="email"
                        placeholder={demo.form.emailPlaceholder}
                        value={ownerEmail}
                        onChange={(e) => setOwnerEmail(e.target.value)}
                      />
                      <p className="field__hint">{demo.form.emailHint}</p>
                    </div>

                    <button
                      type="button"
                      className="btn btn--primary btn--lg btn--block"
                      onClick={() => void submit()}
                      disabled={submitting}
                    >
                      {submitting ? demo.form.submitting : demo.form.submitLabel}
                    </button>
                  </div>
                )}

                <p className="demo__tip">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><TbBulb /> {current.tip}</span>
                </p>
                {error && <p className="alert alert--error">{error}</p>}

                <div className="demo__nav">
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => setStep((s) => Math.max(0, s - 1))}
                    disabled={step === 0}
                  >
                    Voltar
                  </button>
                  {step < 3 && (
                    <button type="button" className="btn btn--primary" onClick={() => goToStep(step + 1)}>
                      {step === 2 && tables.length === 0 ? demo.tables.skipLabel : 'Continuar →'}
                    </button>
                  )}
                </div>

                <p className="demo__encouragement">{demo.encouragement}</p>
              </div>
            )}

            {result && (
              <div className="demo__success">
                <div className="demo__success-head">
                  <div className="demo__success-icon">
                    <TbConfetti size={48} color="var(--brand)" />
                  </div>
                  <h3>Tudo pronto para decolar!</h3>
                  <p>Sua loja e seu aplicativo foram simulados com sucesso. Agora é só criar sua conta para acessar o painel de verdade.</p>
                </div>

                <div className="demo__success-ctas">
                  <button 
                    className="btn btn--primary btn--lg btn--block" 
                    onClick={() => navigate('/register', { 
                      state: { 
                        storeName: restaurantName, 
                        brandColor,
                        businessType,
                        ownerEmail
                      } 
                    })}
                  >
                    Testar aplicativo completo
                  </button>
                </div>

                <button type="button" className="link-button" onClick={reset} style={{ marginTop: '16px' }}>
                  Refazer configurações
                </button>
              </div>
            )}
          </div>

          <div className="demo__preview">
            <PhonePreview
              storeName={displayName}
              tagline={tagline}
              logoUrl={logoUrl}
              logoIcon={typeInfo.iconName}
              brandColor={brandColor}
              products={previewProducts}
              tables={tables}
              onTablesChange={setTables}
              initialDeliveries={SAMPLE_DELIVERIES}
              showRoomTab
              liveBadge
              code={result?.code ?? null}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
