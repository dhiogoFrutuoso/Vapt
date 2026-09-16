import { useState } from 'react';
import { Bike, ShoppingBag } from 'lucide-react';
import { MenuView } from './MenuView';
import { CheckoutSheet } from './CheckoutSheet';
import { ImportOrderPanel } from './ImportOrderPanel';
import type {
  CategoryItem,
  DeliveryAddress,
  OrderItem,
  PaymentSplit,
  PreviewProduct,
  PreviewPromotion,
} from './types';
import type { PedidoImportado } from '../../lib/parseWhatsappOrder';

/**
 * Fluxo de pedido do cliente — o ESPELHO.
 *
 * O mesmo componente serve dois lugares:
 *
 *   `/cliente/:id`        → o cliente final, no navegador dele;
 *   aba Cliente do app    → o recepcionista montando o pedido por telefone.
 *
 * São a mesma tela porque são a mesma tarefa: escolher itens e informar
 * entrega. Duplicar o código faria a promoção nova aparecer num lado e não no
 * outro, e ninguém descobriria até um cliente reclamar do preço.
 *
 * A ÚNICA diferença é o painel de importação do WhatsApp, que só existe do
 * lado de dentro — é ferramenta de quem atende, não de quem pede. Ela entra
 * por `mostrarImportacao`, e não por uma cópia do arquivo.
 */

export type DadosCheckout = {
  customerName: string;
  phone: string;
  payments: PaymentSplit;
  address: DeliveryAddress;
  notes: string;
  isDelivery: boolean;
};

type Props = {
  storeName: string;
  logoUrl: string | null;
  brandColor: string;
  theme: 'claro' | 'escuro';
  products: PreviewProduct[];
  promotions: PreviewPromotion[];
  categories: CategoryItem[];

  cart: OrderItem[];
  onCartChange: (cart: OrderItem[]) => void;

  /** Só do lado de dentro: importar texto do WhatsApp. */
  mostrarImportacao?: boolean;
  onImportar?: (pedido: PedidoImportado) => void;

  /** Aviso de edição, quando a recepção está corrigindo um pedido. */
  editando?: boolean;
  onCancelarEdicao?: () => void;
  rotuloEnvio?: string;

  /** Valores que voltam ao reidratar um pedido em edição. */
  inicial?: {
    name: string;
    phone: string;
    address: string | DeliveryAddress;
    notes: string;
    payments?: PaymentSplit;
    isDelivery?: boolean;
  };

  /** A loja aceita entrega? Retirada é sempre possível. */
  aceitaEntrega?: boolean;

  onSubmit: (dados: DadosCheckout) => void | Promise<void>;
};

export function ClientOrderFlow({
  storeName,
  logoUrl,
  brandColor,
  theme,
  products,
  promotions,
  categories,
  cart,
  onCartChange,
  mostrarImportacao = false,
  onImportar,
  editando = false,
  onCancelarEdicao,
  rotuloEnvio,
  inicial,
  aceitaEntrega = true,
  onSubmit,
}: Props) {
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  /*
   * O modo começa em "entrega" quando a loja aceita, porque é o caso comum.
   * Reidratando um pedido, respeita o que o cliente escolheu — o
   * recepcionista não deve ter de reescolher o que já estava certo.
   */
  const [isDelivery, setIsDelivery] = useState(
    inicial?.isDelivery ?? (aceitaEntrega ? true : false)
  );
  const [notes, setNotes] = useState(inicial?.notes ?? '');

  function adicionar(p: {
    name: string;
    price: number;
    station?: string;
    isPromo?: boolean;
    components?: OrderItem['components'];
  }) {
    onCartChange([
      ...cart,
      {
        name: p.name,
        price: p.price,
        station: p.station,
        isPromo: p.isPromo,
        components: p.components,
      },
    ]);
  }

  function remover(name: string) {
    const idx = cart.findIndex((i) => i.name === name);
    if (idx === -1) return;
    const novo = [...cart];
    novo.splice(idx, 1);
    onCartChange(novo);
  }

  return (
    <div
      className="phone__content"
      style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
    >
      {mostrarImportacao && (
        <div className="import-order__wrap">
          {editando && (
            <p className="import-order__editing">
              Editando um pedido existente. Ao confirmar, ele é atualizado.
              <button type="button" onClick={onCancelarEdicao}>
                Cancelar
              </button>
            </p>
          )}
          {onImportar && <ImportOrderPanel onImport={onImportar} />}
        </div>
      )}

      <MenuView
        appName={storeName}
        primaryColor={brandColor}
        logoUrl={logoUrl}
        theme={theme}
        interactive
        products={products}
        promotions={promotions}
        categories={categories}
        cart={cart}
        onAddToCart={adicionar}
        onRemoveFromCart={remover}
        onOpenCheckout={() => setCheckoutOpen(true)}
        isCheckoutOpen={checkoutOpen}
      />

      {checkoutOpen && cart.length > 0 && (
        <CheckoutSheet
          items={cart}
          initial={inicial}
          submitLabel={rotuloEnvio}
          /*
           * O toggle e a observação são renderizados PELO CheckoutSheet, via
           * estas props. Ficam ali, e não aqui em cima, porque só fazem
           * sentido no momento de fechar — no meio do cardápio, um campo de
           * endereço vazio só ocupa espaço.
           */
          modoEntrega={isDelivery}
          aceitaEntrega={aceitaEntrega}
          allowCredit={mostrarImportacao}
          onModoEntregaChange={setIsDelivery}
          observacao={notes}
          onObservacaoChange={setNotes}
          onClose={() => setCheckoutOpen(false)}
          onSubmit={(dados) => onSubmit({ ...dados, notes, isDelivery })}
        />
      )}
    </div>
  );
}

/** Ícones do toggle, exportados para o CheckoutSheet usar o mesmo desenho. */
export const IconeEntrega = Bike;
export const IconeRetirada = ShoppingBag;
