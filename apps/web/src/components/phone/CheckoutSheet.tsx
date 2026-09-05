import { useEffect, useRef, useState } from 'react';
import { demo } from '../../data/content';
import { brl, maskPhone } from '../../lib/format';
import { MoneyInput } from './MoneyInput';
import { MapPicker } from './MapPicker';
import { IconRenderer } from '../IconRenderer';
import type { DeliveryAddress, OrderItem, PaymentSplit, PaymentSplitItem, PaymentMethod } from './types';

type Props = {
  items: OrderItem[];
  /**
   * Dados ja conhecidos do cliente. Vem da importacao do WhatsApp ou da
   * edicao de um pedido existente — nos dois casos o funcionario nao deve
   * redigitar o que o sistema ja sabe.
   */
  initial?: { name: string; phone: string; address: string; notes: string };
  /** "Salvar alteracoes" no modo edicao, para o botao nao mentir. */
  submitLabel?: string;
  onClose: () => void;
  onSubmit: (order: {
    customerName: string;
    phone: string;
    payments: PaymentSplit;
    address: DeliveryAddress;
  }) => void;
};

/**
 * Recepção do pedido pelo site — versão ILUSTRATIVA.
 *
 * O fluxo real (app) vai pedir a geolocalização do navegador de verdade. Aqui a captura é
 * simulada de propósito: disparar o pedido de permissão de GPS numa landing page assusta o
 * visitante e derruba conversão. A ordem dos campos e os textos são os definidos para o produto.
 *
 * Todo campo usa id + htmlFor explícitos (em vez de label envolvendo o input) para o clique
 * cair sempre no campo certo.
 */
/**
 * Separa "Rua das Flores, 120" em rua e numero.
 *
 * O endereco importado do WhatsApp chega numa linha so, mas a validacao do
 * checkout exige rua E numero — sem separar, o funcionario importa o pedido e
 * trava no envio com "informe rua e numero", tendo o endereco na tela.
 *
 * Conservador de proposito: so separa quando o texto termina em virgula (ou
 * espaco) seguida de numero, que e a forma esmagadoramente comum. Qualquer
 * outro formato fica inteiro na rua e a pessoa completa — melhor deixar um
 * campo vazio do que cortar o endereco no lugar errado.
 */
function separarEndereco(linha: string): { street: string; number: string } {
  const texto = linha.trim();
  if (!texto) return { street: '', number: '' };

  const m = /^(.*?)[,\s]+(\d{1,6}\s*[A-Za-z]?)$/.exec(texto);
  if (m && m[1].trim().length >= 3) {
    return { street: m[1].trim(), number: m[2].trim() };
  }

  return { street: texto, number: '' };
}

export function CheckoutSheet({ items, initial, submitLabel, onClose, onSubmit }: Props) {
  const enderecoInicial = separarEndereco(initial?.address ?? '');
  const copy = demo.preview;

  const total = items.reduce((sum, item) => sum + item.price, 0);

  const [customerName, setCustomerName] = useState(initial?.name ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [splits, setSplits] = useState<PaymentSplitItem[]>([{ method: 'pix', amount: total }]);
  const [gpsState, setGpsState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [manualOpen, setManualOpen] = useState(Boolean(initial?.address));
  const [manual, setManual] = useState<{ city: string; district: string; street: string; number: string; reference: string; lat?: number; lng?: number }>({
    city: '',
    district: '',
    street: enderecoInicial.street,
    number: enderecoInicial.number,
    reference: initial?.notes ?? '',
  });

  const [error, setError] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [tempCoords, setTempCoords] = useState<{ lat: number; lng: number } | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);

  // Abriu a sacola: o cursor já nasce no primeiro campo, sem precisar mirar no toque.
  useEffect(() => {
    const timer = window.setTimeout(() => nameRef.current?.focus({ preventScroll: true }), 320);
    return () => window.clearTimeout(timer);
  }, []);

  const splitsTotal = splits.reduce((sum, s) => sum + s.amount, 0);
  const remaining = Math.max(0, total - splitsTotal);

  function addSplit() {
    setSplits([...splits, { method: 'pix', amount: remaining }]);
  }

  function removeSplit(index: number) {
    setSplits(splits.filter((_, i) => i !== index));
  }

  function updateSplit(index: number, updates: Partial<PaymentSplitItem>) {
    setSplits(splits.map((s, i) => (i === index ? { ...s, ...updates } : s)));
  }

  function captureLocation() {
    setError(null);
    setManualOpen(false);
    
    if (!navigator.geolocation) {
      setError('Geolocalização não suportada pelo seu navegador.');
      return;
    }

    setGpsState('loading');
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setTempCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setMapOpen(true);
        setGpsState('idle');
      },
      () => {
        setGpsState('idle');
        setError('Não foi possível obter a localização. Verifique a permissão do navegador.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  async function handleConfirmMap(coords: { lat: number; lng: number }) {
    setGpsState('loading');
    setMapOpen(false);
    
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.lat}&lon=${coords.lng}`);
      const data = await res.json();
      
      setManual(prev => ({
        ...prev,
        lat: coords.lat,
        lng: coords.lng,
        street: data.address?.road || prev.street,
        city: data.address?.city || data.address?.town || data.address?.village || prev.city,
        district: data.address?.suburb || data.address?.neighbourhood || prev.district,
      }));
    } catch (e) {
      setManual(prev => ({ ...prev, lat: coords.lat, lng: coords.lng }));
    }
    setGpsState('done');
  }

  function handleSubmit() {
    if (customerName.trim().length < 2) {
      setError('Escreva o seu nome para o entregador saber com quem falar.');
      nameRef.current?.focus();
      return;
    }

    if (phone.replace(/\D/g, '').length < 10) {
      setError('Informe um WhatsApp com DDD para o restaurante te avisar.');
      return;
    }

    const hasManual = manual.street.trim() && manual.number.trim();
    if (gpsState !== 'done' && !hasManual) {
      setError('Compartilhe a localização ou informe rua e número.');
      return;
    }

    const address: DeliveryAddress =
      gpsState === 'done' && !hasManual
        ? {
            mode: 'gps',
            lat: manual.lat || -23.5613,
            lng: manual.lng || -46.6565,
            reference: manual.reference.trim() || undefined,
          }
        : {
            mode: 'manual',
            city: manual.city.trim() || 'São Paulo',
            district: manual.district.trim() || 'Centro',
            street: manual.street.trim(),
            number: manual.number.trim(),
            reference: manual.reference.trim() || undefined,
          };

    onSubmit({
      customerName: customerName.trim(),
      phone: phone.trim(),
      payments: splits,
      address,
    });
  }

  return (
    <>
    <div className="phone__sheet phone__sheet--tall" role="dialog" aria-label={copy.checkoutTitle}>
      <div className="phone__sheet-head">
        <strong>{copy.checkoutTitle}</strong>
        <button type="button" onClick={onClose} aria-label="Fechar">
          ✕
        </button>
      </div>

      {/* 1. Pedido */}
      <p className="phone__sheet-label">{copy.checkoutItems}</p>
      <ul className="phone__sheet-items">
        {items.map((item, index) => (
          <li key={`${item.name}-${index}`}>
            <span>{item.name}</span>
            <span>{brl(item.price)}</span>
          </li>
        ))}
      </ul>
      
      <div style={{ backgroundColor: '#fff7ed', border: '1px solid #fed7aa', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>
        <strong style={{ color: '#c2410c', display: 'block', fontSize: '0.9rem', marginBottom: '4px' }}>Aviso Importante:</strong>
        <p style={{ color: '#9a3412', fontSize: '0.85rem', margin: 0, lineHeight: '1.4' }}>
          O valor acima <strong>não é o total final</strong>, pois a <strong>taxa de entrega</strong> será calculada pelo nosso time. 
          O seu pedido será encaminhado para o nosso WhatsApp, onde o atendente informará o valor do frete e enviará a chave PIX (caso seja a forma de pagamento escolhida).
        </p>
      </div>
      <div className="phone__sheet-total is-final">
        <span>Total</span>
        <strong>{brl(total)}</strong>
      </div>

      {/* 2. Quem está pedindo */}
      <div className="phone__field">
        <label htmlFor="fw-checkout-name">{copy.checkoutName}</label>
        <input
          id="fw-checkout-name"
          ref={nameRef}
          type="text"
          name="nome"
          autoComplete="name"
          enterKeyHint="next"
          maxLength={60}
          value={customerName}
          placeholder={copy.checkoutNamePlaceholder}
          onChange={(event) => setCustomerName(event.target.value)}
        />
      </div>

      <div className="phone__field">
        <label htmlFor="fw-checkout-phone">{copy.checkoutPhone}</label>
        <input
          id="fw-checkout-phone"
          type="tel"
          name="telefone"
          inputMode="tel"
          autoComplete="tel"
          enterKeyHint="next"
          value={phone}
          placeholder={copy.checkoutPhonePlaceholder}
          onChange={(event) => setPhone(maskPhone(event.target.value))}
        />
        <small className="phone__field-hint">{copy.checkoutPhoneHint}</small>
      </div>

      {/* 3. Pagamento */}
      <p className="phone__sheet-label">{copy.checkoutPayment}</p>
      
      {!isSplitMode ? (
        <>
          <div className="phone__pay">
            {copy.payments.map((option) => (
              <button
                key={option.value}
                type="button"
                className={splits.length === 1 && splits[0].method === option.value ? 'is-active' : ''}
                onClick={() => setSplits([{ method: option.value as PaymentMethod, amount: total }])}
              >
                <span aria-hidden="true" style={{ fontSize: '1.2rem', marginBottom: '4px' }}>
                  <IconRenderer name={option.iconName as string} />
                </span>
                {option.label}
              </button>
            ))}
          </div>
          {splits.length === 1 && splits[0].method === 'dinheiro' && (
            <div className="phone__field">
              <label htmlFor="fw-checkout-change">{copy.changeLabel}</label>
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
                onChange={(e) => updateSplit(index, { method: e.target.value as any })}
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
              Falta: {brl(remaining)} (sem contar a taxa de entrega)
            </p>
          )}
          {splitsTotal > total + 0.01 && (
            <p style={{ fontSize: '0.8rem', color: '#10b981', margin: '4px 0' }}>
              Entregador levará troco para {brl(splitsTotal - total)} (descontando a taxa)
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

      {/* 4. Localização */}
      <p className="phone__sheet-label">{copy.locationTitle}</p>

      {gpsState === 'done' ? (
        <div className="phone__gps is-done">
          <strong>📍 {copy.locationDone}</strong>
          <span>Rua das Palmeiras, 128 — a 1,2 km do restaurante</span>
        </div>
      ) : (
        <button type="button" className="phone__gps-btn" onClick={captureLocation} disabled={gpsState === 'loading'}>
          📍 {gpsState === 'loading' ? copy.locationLoading : copy.locationButton}
        </button>
      )}

      <button type="button" className="phone__manual-toggle" onClick={() => setManualOpen((open) => !open)}>
        {copy.manualToggle}
      </button>

      {manualOpen && (
        <div className="phone__manual">
          <div className="phone__manual-row">
            <div className="phone__field">
              <label htmlFor="fw-address-city">{copy.manualCity}</label>
              <input
                id="fw-address-city"
                value={manual.city}
                autoComplete="address-level2"
                onChange={(event) => setManual({ ...manual, city: event.target.value })}
              />
            </div>
            <div className="phone__field">
              <label htmlFor="fw-address-district">{copy.manualDistrict}</label>
              <input
                id="fw-address-district"
                value={manual.district}
                onChange={(event) => setManual({ ...manual, district: event.target.value })}
              />
            </div>
          </div>

          <div className="phone__manual-row phone__manual-row--street">
            <div className="phone__field">
              <label htmlFor="fw-address-street">{copy.manualStreet}</label>
              <input
                id="fw-address-street"
                value={manual.street}
                autoComplete="address-line1"
                onChange={(event) => setManual({ ...manual, street: event.target.value })}
              />
            </div>
            <div className="phone__field">
              <label htmlFor="fw-address-number">{copy.manualNumber}</label>
              <input
                id="fw-address-number"
                inputMode="numeric"
                value={manual.number}
                onChange={(event) => setManual({ ...manual, number: event.target.value })}
              />
            </div>
          </div>

          <div className="phone__field">
            <label htmlFor="fw-address-reference">{copy.manualReference}</label>
            <textarea
              id="fw-address-reference"
              rows={2}
              value={manual.reference}
              placeholder={copy.manualReferencePlaceholder}
              onChange={(event) => setManual({ ...manual, reference: event.target.value })}
            />
          </div>
          <p className="phone__reference-hint">💡 {copy.manualReferenceHint}</p>
        </div>
      )}

      {error && <p className="phone__sheet-error">{error}</p>}

      <button 
        type="button" 
        className="phone__sheet-btn is-primary is-block" 
        disabled={!customerName || !phone || (!manualOpen && gpsState !== 'done') || splits.length === 0 || splitsTotal < total - 0.01}
        onClick={handleSubmit}
      >
        {submitLabel ?? copy.checkoutSubmit}
      </button>
    </div>
    
    {mapOpen && tempCoords && (
      <MapPicker
        initialCenter={tempCoords}
        onConfirm={handleConfirmMap}
        onCancel={() => setMapOpen(false)}
      />
    )}
    </>
  );
}
