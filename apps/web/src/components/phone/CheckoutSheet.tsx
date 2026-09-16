import { useEffect, useRef, useState } from 'react';
import { demo } from '../../data/content';
import { brl, maskPhone } from '../../lib/format';
import { MoneyInput } from './MoneyInput';
import { CashChangeField } from './CashChangeField';
import { MapPicker } from './MapPicker';
import { IconRenderer } from '../IconRenderer';
import { hasInvalidChangeFor, type DeliveryAddress, type OrderItem, type PaymentSplit, type PaymentSplitItem, type PaymentMethod } from './types';
import {
  getCurrentCoordinates,
  getLocationFailureMessage,
  isNativeLocationPlatform,
  reverseGeocodeCoordinates,
} from '../../lib/location';

type Props = {
  items: OrderItem[];
  /**
   * Dados ja conhecidos do cliente. Vem da importacao do WhatsApp ou da
   * edicao de um pedido existente — nos dois casos o funcionario nao deve
   * redigitar o que o sistema ja sabe.
   */
  initial?: {
    name: string;
    phone: string;
    address: string | DeliveryAddress;
    notes: string;
    payments?: PaymentSplit;
    deliveryFee?: number;
  };
  /** "Salvar alteracoes" no modo edicao, para o botao nao mentir. */
  submitLabel?: string;

  /**
   * Entrega ou retirada no balcao.
   *
   * O estado vive no componente PAI porque a escolha sobrevive ao fechar e
   * reabrir esta folha — o cliente que ja disse "vou buscar" nao deve ver os
   * campos de endereco voltarem porque tocou fora do painel sem querer.
   */
  modoEntrega?: boolean;
  onModoEntregaChange?: (entrega: boolean) => void;
  /** A loja aceita entrega? Retirada sempre existe. */
  aceitaEntrega?: boolean;
  allowCredit?: boolean;

  /** Observacao do pedido ("sem cebola", "troco para 50"). */
  observacao?: string;
  onObservacaoChange?: (texto: string) => void;

  onClose: () => void;
  onSubmit: (order: {
    customerName: string;
    phone: string;
    payments: PaymentSplit;
    address: DeliveryAddress;
  }) => void | Promise<void>;
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

export function CheckoutSheet({
  items,
  initial,
  submitLabel,
  modoEntrega = true,
  onModoEntregaChange,
  aceitaEntrega = true,
  allowCredit = false,
  observacao = '',
  onObservacaoChange,
  onClose,
  onSubmit,
}: Props) {
  /*
   * Retirada nao tem endereco. Guardar a decisao numa constante deixa as tres
   * consequencias (validacao, campos e botao) lendo a MESMA condicao — foi
   * assim que evitei o classico: esconder o campo e continuar exigindo ele no
   * envio, com o cliente travado num erro sobre uma tela que nao existe.
   */
  const pedeEndereco = aceitaEntrega && modoEntrega;

  const addressObject = initial?.address && typeof initial.address !== 'string' ? initial.address : null;
  const enderecoInicial = separarEndereco(typeof initial?.address === 'string' ? initial.address : '');
  const copy = demo.preview;
  const paymentOptions = allowCredit
    ? [...copy.payments, { value: 'fiado', label: 'Fiado', iconName: 'wallet' }]
    : copy.payments;

  const total = items.reduce((sum, item) => sum + item.price, 0) + (initial?.deliveryFee ?? 0);

  const [customerName, setCustomerName] = useState(initial?.name ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [isSplitMode, setIsSplitMode] = useState((initial?.payments?.length ?? 0) > 1);
  const [splits, setSplits] = useState<PaymentSplitItem[]>(
    initial?.payments?.length ? initial.payments.map((payment) => ({ ...payment })) : [{ method: 'pix', amount: total }]
  );
  const [gpsState, setGpsState] = useState<'idle' | 'loading' | 'done'>(
    addressObject?.mode === 'gps' && Number.isFinite(addressObject.lat) && Number.isFinite(addressObject.lng) ? 'done' : 'idle'
  );
  const [manualOpen, setManualOpen] = useState(Boolean(initial?.address) && addressObject?.mode !== 'gps');
  const [manual, setManual] = useState<{ city: string; district: string; street: string; number: string; reference: string; lat?: number; lng?: number }>({
    city: addressObject?.city ?? '',
    district: addressObject?.district ?? '',
    street: addressObject?.street ?? enderecoInicial.street,
    number: addressObject?.number ?? enderecoInicial.number,
    reference: addressObject?.reference ?? initial?.notes ?? '',
    lat: addressObject?.lat,
    lng: addressObject?.lng,
  });

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [tempCoords, setTempCoords] = useState<{ lat: number; lng: number } | null>(
    addressObject?.lat != null && addressObject.lng != null ? { lat: addressObject.lat, lng: addressObject.lng } : null
  );

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
    setSplits(splits.map((s, i) => (i === index
      ? { ...s, ...updates, changeFor: updates.method && updates.method !== 'dinheiro' ? undefined : 'changeFor' in updates ? updates.changeFor : s.changeFor }
      : s)));
  }

  async function captureLocation() {
    setError(null);
    setManualOpen(false);
    setGpsState('loading');

    try {
      const coords = await getCurrentCoordinates();
      setTempCoords(coords);
      setMapOpen(true);
    } catch (locationError) {
      if (isNativeLocationPlatform()) {
        setTempCoords(null);
        setManualOpen(true);
        setError(getLocationFailureMessage(locationError));
        return;
      }

      setTempCoords(null);
      setManualOpen(true);
      setError('Localização automática indisponível. Informe o endereço manualmente e tente novamente mais tarde.');
    } finally {
      setGpsState('idle');
    }
  }

  async function handleConfirmMap(coords: { lat: number; lng: number }) {
    setGpsState('loading');
    setMapOpen(false);
    
    try {
      const address = await reverseGeocodeCoordinates(coords);
      
      setManual(prev => ({
        ...prev,
        lat: coords.lat,
        lng: coords.lng,
        street: address.street || prev.street,
        city: address.city || prev.city,
        district: address.district || prev.district,
      }));
    } catch (e) {
      setManual(prev => ({ ...prev, lat: coords.lat, lng: coords.lng }));
    }
    setError(null);
    setGpsState('done');
  }

  async function handleSubmit() {
    if (splits.length === 0 || Math.abs(splitsTotal - total) > 0.01 || splits.some((split) => split.amount <= 0) || hasInvalidChangeFor(splits)) {
      setError('Confira os valores do pagamento e o valor informado para troco.');
      return;
    }
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
    const hasCoords = Number.isFinite(manual.lat) && Number.isFinite(manual.lng);

    /* Retirada no balcao dispensa endereco — exigi-lo travaria o cliente
       numa tela que ele nem esta vendo. */
    if (pedeEndereco && (gpsState !== 'done' || !hasCoords) && !hasManual) {
      setError('Compartilhe a localização ou informe rua e número.');
      return;
    }

    const address: DeliveryAddress =
      gpsState === 'done' && hasCoords && !hasManual
        ? {
            mode: 'gps',
            lat: manual.lat,
            lng: manual.lng,
            reference: manual.reference.trim() || undefined,
          }
        : {
            mode: 'manual',
            city: manual.city.trim(),
            district: manual.district.trim(),
            street: manual.street.trim(),
            number: manual.number.trim(),
            reference: manual.reference.trim() || undefined,
          };

    const data = {
      customerName: customerName.trim(),
      phone: phone.trim(),
      payments: splits,
      address,
    };
    setSubmitting(true);
    setError(null);
    try {
      /* Fiado segue exatamente o mesmo caminho das outras formas; somente o
         valor de `method` muda no payload persistido. */
      await onSubmit(data);
    } finally {
      setSubmitting(false);
    }
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
      {(initial?.deliveryFee ?? 0) > 0 && (
        <p className="mb-2 rounded-xl bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-900 dark:bg-orange-950/40 dark:text-orange-100">
          Total com taxa de entrega de {brl(initial?.deliveryFee ?? 0)}: {brl(total)}.
        </p>
      )}
      
      {!isSplitMode ? (
        <>
          <div className={`phone__pay${paymentOptions.length === 4 ? ' phone__pay--four' : ''}`}>
            {paymentOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={splits.length === 1 && splits[0].method === option.value ? 'is-active' : ''}
                aria-pressed={splits.length === 1 && splits[0].method === option.value}
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
            <CashChangeField id="fw-checkout-change" amount={splits[0].amount} changeFor={splits[0].changeFor}
              onChange={(changeFor) => updateSplit(0, { changeFor })} deliveryFeePending={pedeEndereco && !(initial?.deliveryFee ?? 0)} />
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
            <div key={index} className="split-pay__group">
            <div className="split-pay__row">
              <select
                className="split-pay__select"
                value={split.method}
                onChange={(e) => updateSplit(index, { method: e.target.value as PaymentMethod })}
              >
                <option value="pix">PIX</option>
                <option value="cartao">Cartão</option>
                <option value="dinheiro">Dinheiro</option>
                {allowCredit && <option value="fiado">Fiado</option>}
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
            {split.method === 'dinheiro' && <CashChangeField id={`fw-checkout-change-${index}`} amount={split.amount} changeFor={split.changeFor}
              onChange={(changeFor) => updateSplit(index, { changeFor })} deliveryFeePending={pedeEndereco && !(initial?.deliveryFee ?? 0)} />}
            </div>
          ))}

          {remaining > 0.01 && (
            <p style={{ fontSize: '0.8rem', color: '#f59e0b', margin: '4px 0' }}>
              Falta: {brl(remaining)}{initial?.deliveryFee ? ' (incluindo a taxa de entrega)' : ' (sem contar a taxa de entrega)'}
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

      {/* 4. Como o cliente quer receber */}
      {aceitaEntrega && (
        <>
          <p className="phone__sheet-label">Como você quer receber?</p>
          <div className="phone__modo" role="radiogroup" aria-label="Entrega ou retirada">
            <button
              type="button"
              role="radio"
              aria-checked={modoEntrega}
              className={modoEntrega ? 'is-active' : ''}
              onClick={() => onModoEntregaChange?.(true)}
            >
              🛵 Entrega
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={!modoEntrega}
              className={!modoEntrega ? 'is-active' : ''}
              onClick={() => onModoEntregaChange?.(false)}
            >
              🛍️ Retirar no balcão
            </button>
          </div>
        </>
      )}

      {/* 5. Observação do pedido — vale para entrega E retirada. */}
      <div className="phone__field">
        <label htmlFor="fw-obs">Observações do pedido</label>
        <textarea
          id="fw-obs"
          rows={3}
          maxLength={300}
          placeholder="Ex.: sem cebola, ponto da carne, troco para R$ 50"
          value={observacao}
          onChange={(e) => onObservacaoChange?.(e.target.value)}
        />
      </div>

      {/* 6. Localização — some inteira quando é retirada. */}
      {pedeEndereco && (
      <>
      <p className="phone__sheet-label">{copy.locationTitle}</p>

      {gpsState === 'done' ? (
        <div className="phone__gps is-done">
          <strong>📍 {copy.locationDone}</strong>
          <span>{manual.street || 'Pino confirmado'}{manual.number ? `, ${manual.number}` : ''}</span>
          <button
            type="button"
            className="phone__manual-toggle"
            onClick={() => {
              if (manual.lat != null && manual.lng != null) {
                setTempCoords({ lat: manual.lat, lng: manual.lng });
                setMapOpen(true);
              }
            }}
          >
            Ajustar pino no mapa
          </button>
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
      </>
      )}

      {error && <p className="phone__sheet-error">{error}</p>}

      <button 
        type="button" 
        className="phone__sheet-btn is-primary is-block" 
        disabled={submitting || !customerName || !phone || (pedeEndereco && !manualOpen && gpsState !== 'done') || splits.length === 0 || Math.abs(splitsTotal - total) > 0.01 || hasInvalidChangeFor(splits)}
        onClick={() => void handleSubmit()}
      >
        {submitting ? 'Enviando pedido…' : (submitLabel ?? copy.checkoutSubmit)}
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
