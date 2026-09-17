import toast from 'react-hot-toast';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { brl } from '../../lib/format';
import { useConfirm } from '../ConfirmModal';
import { addressLabel, mapsUrl, paymentCashBalance, paymentsWithDeliveryFee, type CategoryItem, type DeliveryOrder, type PaymentMethod, type PaymentSplit, type PreviewProduct } from './types';
import { demo } from '../../data/content';
import { ArrowLeft, Boxes, PackageCheck, PackageX, Printer, X } from 'lucide-react';
import { PrintTicket } from './PrintTicket';
import { printReceipt } from '../../lib/printReceipt';
import { CategoryGrid } from './CategoryGrid';
import { IconRenderer } from '../IconRenderer';

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  pix: 'PIX',
  cartao: 'Cartão',
  dinheiro: 'Dinheiro',
  fiado: 'Fiado',
};

function formatPayments(payments: PaymentSplit): string {
  if (payments.length === 0) return 'Pendente';
  return payments.map((p) => `${PAYMENT_LABEL[p.method]} ${brl(p.amount)}${p.method === 'dinheiro' && p.changeFor != null ? ` · troco para ${brl(p.changeFor)}` : ''}`).join(' + ');
}

/** Aceita "8", "8,50" e "8.50" — o recepcionista digita como quiser. */
function parseFee(raw: string): number {
  return parseFloat(raw.trim().replace(',', '.'));
}

function feeToInput(value: number): string {
  if (!value) return '';
  return value.toFixed(2).replace('.', ',');
}

interface ReceptionViewProps {
  deliveries: DeliveryOrder[];
  /** Manda o pedido de volta para a aba Cliente, em modo edicao. */
  onEdit?: (id: string) => void;
  /** Taxa configurada no editor: entra pre-preenchida e vira atalho. */
  defaultFee?: number;
  deliveryPeople?: Array<{ id: string; name: string }>;
  onAccept?: (id: string, fee: number, employeeId?: string) => void;
  onReject?: (id: string) => void;
  storeName?: string;
  storePhone?: string;
  operatorName?: string;
  products?: PreviewProduct[];
  categories?: CategoryItem[];
  onToggleAvailability?: (productId: string, available: boolean) => void;
}

function ReceptionOrderItem({
  d,
  defaultFee,
  onAccept,
  onReject,
  onPrint,
  onEdit,
  deliveryPeople,
  confirm,
}: {
  d: DeliveryOrder;
  defaultFee: number;
  onAccept: ReceptionViewProps['onAccept'];
  onReject: ReceptionViewProps['onReject'];
  onPrint: (order: DeliveryOrder) => void;
  onEdit?: ReceptionViewProps['onEdit'];
  deliveryPeople: Array<{ id: string; name: string }>;
  confirm: ReturnType<typeof useConfirm>['confirm'];
}) {
  const [fee, setFee] = useState(() => feeToInput(defaultFee));
  const [employeeId, setEmployeeId] = useState('');
  const [dispatchOpen, setDispatchOpen] = useState(false);

  const parsed = parseFee(fee || '0');
  const feeValid = !Number.isNaN(parsed) && parsed >= 0;
  const itemsTotal = d.items.reduce((sum, item) => sum + item.price, 0);
  const hasCredit = d.payments.some((payment) => payment.method === 'fiado');
  const updatedPayments = paymentsWithDeliveryFee(d.payments, feeValid && d.isDelivery !== false ? parsed : 0);

  /** Atalhos de taxa: gratis e o valor padrao do app, sem repetir. */
  const presets = defaultFee > 0 ? [0, defaultFee] : [0];

  function handleAccept() {
    if (!onAccept) return;
    if (!feeValid) {
      toast.error('Insira um valor válido para a taxa de entrega.');
      return;
    }
    if (d.isDelivery !== false) {
      if (deliveryPeople.length === 0) {
        toast.error('Cadastre um entregador ativo antes de despachar.');
        return;
      }
      setDispatchOpen(true);
      return;
    }
    onAccept(d.id, 0);
  }

  return (
    <li
      className="phone__delivery is-novo"
      style={hasCredit
        ? { listStyle: 'none', borderColor: '#F59E0B', background: '#FFFBEB' }
        : { listStyle: 'none' }}
    >
      <header>
        <strong>#{d.code}</strong>
        <span className="phone__delivery-badge is-novo">Novo</span>
        {hasCredit && <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-extrabold uppercase text-amber-800">Fiado</span>}
      </header>

      <p className="phone__delivery-client">
        {d.customerName} · {d.timeLabel} · {d.distanceLabel}
      </p>

      <ul className="phone__delivery-items">
        {d.items.map((item, index) => (
          <li key={`${item.name}-${index}`}>
            <span>{item.name}</span>
            <span>{brl(item.price)}</span>
          </li>
        ))}
      </ul>

      <div className="phone__delivery-pay">
        <strong>{brl(d.total)}</strong>
        <span>{formatPayments(d.payments)}</span>
      </div>
      {d.payments.some((payment) => payment.method === 'dinheiro' && payment.changeFor != null) && (
        <p className="cash-change-field__total">{paymentCashBalance(d.payments, itemsTotal + (feeValid && d.isDelivery !== false ? parsed : 0)) < 0
          ? `Valor informado insuficiente após taxa: faltam ${brl(-paymentCashBalance(d.payments, itemsTotal + (feeValid && d.isDelivery !== false ? parsed : 0)))}`
          : `Troco após taxa: ${brl(paymentCashBalance(d.payments, itemsTotal + (feeValid && d.isDelivery !== false ? parsed : 0)))}`}</p>
      )}

      {d.isDelivery !== false && <div className="phone__delivery-address">
        <span className="phone__delivery-mode">
          {d.address.mode === 'gps' ? demo.preview.deliveryGps : 'Endereço informado'}
        </span>
        <strong>{addressLabel(d.address)}</strong>
        {d.address.mode === 'manual' && d.address.district && (
          <span>
            {d.address.district} — {d.address.city}
          </span>
        )}
      </div>}

      {d.isDelivery !== false && d.address.reference && (
        <p className="phone__delivery-reference">
          <strong>{demo.preview.deliveryReference}:</strong> {d.address.reference}
        </p>
      )}

      {/* Definir taxa e autoria é uma ação administrativa. */}
      {onAccept && d.isDelivery === false ? (
        <button type="button" className="recep-pickup-confirm" onClick={handleAccept}>
          <PackageCheck size={17} aria-hidden="true" /> Confirmar retirada no balcão
        </button>
      ) : onAccept ? <div className="recep-fee">
        <div className="recep-fee__row">
          <label className="recep-fee__field">
            <span>Valor da entrega</span>
            <input
              type="text"
              inputMode="decimal"
              value={fee}
              onChange={(event) => setFee(event.target.value)}
              placeholder="0,00"
              aria-label={`Valor da entrega do pedido ${d.code}`}
            />
          </label>
          <button
            type="button"
            className="recep-fee__dispatch"
            onClick={handleAccept}
            disabled={!feeValid}
          >
            Despachar
          </button>
        </div>

        <div className="recep-fee__presets">
          {presets.map((value) => (
            <button
              key={value}
              type="button"
              className={`recep-chip ${parsed === value && feeValid ? 'is-active' : ''}`}
              onClick={() => setFee(feeToInput(value))}
            >
              {value === 0 ? 'Grátis' : brl(value)}
            </button>
          ))}
          <span className="recep-fee__sum">
            Total: <strong>{brl(itemsTotal + (feeValid ? parsed : 0))}</strong>
          </span>
        </div>
        {parsed > 0 && feeValid && d.payments.length > 0 && (
          <p className="mt-2 rounded-xl bg-orange-50 px-3 py-2 text-xs font-semibold leading-relaxed text-orange-900 dark:bg-orange-950/40 dark:text-orange-100" role="status">
            Ao despachar, a taxa de {brl(parsed)} será incluída {d.payments.length > 1 ? 'na 1ª forma de pagamento' : 'no pagamento'} ({PAYMENT_LABEL[d.payments[0].method]}).
            {' '}Pagamento atualizado: {formatPayments(updatedPayments)}.
          </p>
        )}
      </div> : (
        <p className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-500">
          Aguardando a Gestão definir taxa e entregador.
        </p>
      )}

      <div className="phone__delivery-actions recep-card__actions" style={{ marginTop: 10 }}>
        {onEdit && (
          <button type="button" className="phone__sheet-btn" onClick={() => onEdit(d.id)}>
            Editar pedido
          </button>
        )}
        {d.isDelivery !== false && <a className="phone__sheet-btn" href={mapsUrl(d.address)} target="_blank" rel="noreferrer">Abrir mapa</a>}
        {onReject && <button
          type="button"
          className="phone__sheet-btn"
          onClick={() => {
            confirm({
              title: 'Recusar Pedido',
              message: 'Tem certeza que deseja recusar e cancelar este pedido?',
              confirmText: 'Recusar',
              isDestructive: true,
              onConfirm: () => onReject(d.id),
            });
          }}
        >
          Recusar
        </button>}
        <button type="button" className="phone__sheet-btn recep-card__print" onClick={() => onPrint(d)} aria-label={`Imprimir comanda do pedido ${d.code}`}>
          <Printer size={16} aria-hidden="true" /> Imprimir comanda
        </button>
      </div>

      {dispatchOpen && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`Selecionar entregador do pedido ${d.code}`}>
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl dark:bg-slate-900">
            <h3 className="m-0 text-lg font-extrabold text-slate-950 dark:text-white">Quem sai com o pedido?</h3>
            <p className="mb-4 mt-1 text-sm text-slate-500">Pedido #{d.code} · escolha um entregador ativo.</p>
            <div className="space-y-2">
              {deliveryPeople.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  className={`flex w-full items-center gap-3 rounded-2xl border border-solid px-4 py-3 text-left text-sm font-bold ${employeeId === person.id ? 'border-[#F95D2A] bg-orange-50 text-[#C2410C]' : 'border-slate-200 bg-white text-slate-800'}`}
                  aria-pressed={employeeId === person.id}
                  onClick={() => setEmployeeId(person.id)}
                >
                  <span className={`h-3 w-3 rounded-full ${employeeId === person.id ? 'bg-[#F95D2A]' : 'bg-slate-200'}`} />
                  {person.name}
                </button>
              ))}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" className="rounded-2xl border border-solid border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700" onClick={() => setDispatchOpen(false)}>Voltar</button>
              <button type="button" className="rounded-2xl border-0 bg-[#F95D2A] px-4 py-3 text-sm font-extrabold text-white disabled:opacity-40" disabled={!employeeId} onClick={() => { onAccept?.(d.id, parsed, employeeId); setDispatchOpen(false); }}>Confirmar despacho</button>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

export function ReceptionView({
  deliveries,
  defaultFee = 0,
  deliveryPeople = [],
  onAccept,
  onReject,
  onEdit,
  storeName = 'Vapt',
  storePhone,
  operatorName,
  products = [],
  categories = [],
  onToggleAvailability,
}: ReceptionViewProps) {
  const { confirm, ConfirmElement } = useConfirm();
  const [printing, setPrinting] = useState<{ order: DeliveryOrder } | null>(null);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<CategoryItem | null>(null);
  function confirmarImpressao(order: DeliveryOrder) {
    confirm({ title: 'Imprimir comanda?', message: `Pedido #${order.code} de ${order.customerName} será enviado à impressora conectada.`,
      confirmText: 'Imprimir comanda', cancelText: 'Voltar', isDestructive: false,
      onConfirm: () => setPrinting({ order }), });
  }
  useEffect(() => {
    if (!printing) return;
    const id = window.setTimeout(() => {
      void printReceipt().catch(() => toast.error('Não foi possível imprimir a comanda.'));
    }, 50);
    return () => window.clearTimeout(id);
  }, [printing]);
  const retiradas = deliveries.filter((d) => d.status === 'novo' && d.isDelivery === false);
  const novos = deliveries.filter((d) => d.status === 'novo' && d.isDelivery !== false);
  const despachados = deliveries.filter((d) => d.status === 'aceito' || d.status === 'a_caminho').length;
  const availabilityCategories = categories.length > 0
      ? categories
      : Array.from(new Set(products.map((product) => product.category || demo.preview.uncategorized))).map((name) => ({
          _id: name,
          name,
          image: null,
        }));
  const categoryProducts = selectedCategory
    ? products.filter((product) => (product.category || demo.preview.uncategorized) === selectedCategory.name)
    : [];

  function toggleProduct(product: PreviewProduct) {
    if (!product.id || !onToggleAvailability) return;
    const available = product.available !== false;
    confirm({
      title: available ? 'Marcar item como esgotado' : 'Reativar item',
      message: available
        ? `${product.name} continuará visível para o cliente, mas ficará cinza e indisponível para compra.`
        : `${product.name} ficará disponível para compra imediatamente.`,
      confirmText: available ? 'Marcar esgotado' : 'Reativar item',
      isDestructive: available,
      onConfirm: () => onToggleAvailability(product.id!, !available),
    });
  }

  return (
    <div className="phone__body">
      <p className="phone__role">Recepção · retiradas e despacho</p>

      {onToggleAvailability && products.length > 0 && (
        <button
          type="button"
          className="recep-menu-control"
          onClick={() => { setSelectedCategory(null); setAvailabilityOpen(true); }}
        >
          <span className="recep-menu-control__icon"><Boxes size={20} aria-hidden="true" /></span>
          <span>
            <strong>Disponibilidade do cardápio</strong>
            <small>{products.filter((product) => product.available === false).length > 0
              ? `${products.filter((product) => product.available === false).length} item(ns) esgotado(s)`
              : 'Todos os itens estão disponíveis'}</small>
          </span>
          <span aria-hidden="true">→</span>
        </button>
      )}

      {retiradas.length > 0 && <>
        <div className="phone__section-title">
          Retiradas pedidas pelo cliente
          <span className="phone__section-count">{retiradas.length}</span>
        </div>
        <p className="cat-hint">Pagamento, inclusive fiado, itens e cliente aparecem completos antes da confirmação.</p>
        <ul className="phone__deliveries">
          {retiradas.map((d) => <ReceptionOrderItem key={d.id} d={d} defaultFee={0} onAccept={onAccept} onReject={onReject} onPrint={confirmarImpressao} onEdit={onEdit} confirm={confirm} deliveryPeople={deliveryPeople} />)}
        </ul>
      </>}

      <div className="phone__section-title reception-dispatch-title">
        Despache de entregas
        <span className="phone__section-count">{novos.length}</span>
      </div>

      {novos.length === 0 ? (
        <div className="phone__empty">
          <strong>Fila limpa</strong>
          <p>As entregas do cliente caem aqui para você definir a taxa e despachar.</p>
        </div>
      ) : (
        <ul className="phone__deliveries">
          {novos.map((d) => (
            <ReceptionOrderItem
              key={d.id}
              d={d}
              defaultFee={defaultFee}
              onAccept={onAccept}
              onReject={onReject}
              onPrint={confirmarImpressao}
              onEdit={onEdit}
              confirm={confirm}
              deliveryPeople={deliveryPeople}
            />
          ))}
        </ul>
      )}

      {despachados > 0 && (
        <p className="recep-hint">
          {despachados} {despachados === 1 ? 'pedido já está' : 'pedidos já estão'} com o entregador.
        </p>
      )}

      {printing && (
        createPortal(<PrintTicket
          storeName={storeName}
          storePhone={storePhone}
          label={`${printing.order.isDelivery === false ? 'Retirada' : 'Entrega'} #${printing.order.code}`}
          origin={printing.order.isDelivery === false ? 'retirada' : 'delivery'}
          customerName={printing.order.customerName}
          phone={printing.order.phone}
          address={printing.order.isDelivery === false ? undefined : addressLabel(printing.order.address)}
          addressReference={printing.order.isDelivery === false ? undefined : printing.order.address.reference}
          notes={printing.order.notes}
          items={printing.order.items}
          deliveryFee={printing.order.deliveryFee}
          payments={printing.order.payments}
          operatorName={operatorName}
          width={80}
        />, document.body)
      )}

      {availabilityOpen && (
        <div className="recep-menu-modal" role="dialog" aria-modal="true" aria-labelledby="availability-title">
          <div className="recep-menu-modal__sheet">
            <header className="recep-menu-modal__head">
              <button
                type="button"
                className="recep-menu-modal__back"
                onClick={() => selectedCategory ? setSelectedCategory(null) : setAvailabilityOpen(false)}
                aria-label={selectedCategory ? 'Voltar às categorias' : 'Fechar disponibilidade do cardápio'}
              >
                {selectedCategory ? <ArrowLeft size={20} /> : <X size={20} />}
              </button>
              <div>
                <span>Recepção</span>
                <h2 id="availability-title">{selectedCategory?.name ?? 'Disponibilidade do cardápio'}</h2>
              </div>
            </header>

            <div className="recep-menu-modal__body">
              {!selectedCategory ? (
                <>
                  <p className="recep-menu-modal__intro">Abra uma categoria e marque rapidamente o que acabou. A mudança chega ao cardápio do cliente em tempo real.</p>
                  <CategoryGrid categories={availabilityCategories} products={products} onSelect={setSelectedCategory} />
                </>
              ) : categoryProducts.length === 0 ? (
                <div className="phone__empty"><p>Nenhum item nesta categoria.</p></div>
              ) : (
                <ul className="recep-products">
                  {categoryProducts.map((product) => {
                    const available = product.available !== false;
                    return (
                      <li key={product.id ?? product.name} className={available ? '' : 'is-sold-out'}>
                        <span className="recep-products__thumb">
                          {product.imageUrl ? <img src={product.imageUrl} alt="" /> : <IconRenderer name={product.iconName} size={24} />}
                        </span>
                        <span className="recep-products__copy">
                          <strong>{product.name}</strong>
                          <small>{available ? 'Disponível para compra' : 'Esgotado no cardápio do cliente'}</small>
                        </span>
                        <button
                          type="button"
                          className={available ? 'is-available' : 'is-paused'}
                          onClick={() => toggleProduct(product)}
                          aria-label={`${available ? 'Marcar' : 'Retirar'} ${product.name} como ${available ? 'esgotado' : 'disponível'}`}
                        >
                          {available ? <PackageCheck size={17} /> : <PackageX size={17} />}
                          {available ? 'Disponível' : 'Esgotado'}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {ConfirmElement}
    </div>
  );
}
