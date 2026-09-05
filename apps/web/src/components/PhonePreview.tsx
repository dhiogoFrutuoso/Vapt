import { useMemo } from 'react';
import { EditorPreview } from './EditorPreview';
import type { CategoryItem, DeliveryOrder, PreviewProduct, PreviewPromotion, PreviewTable } from './phone/types';

export type { PreviewProduct, PreviewTable, DeliveryOrder } from './phone/types';

/**
 * Simulador do "Teste Rápido" da landing.
 *
 * Antes este arquivo tinha uma cópia própria do app — cabeçalho, telas e uma
 * barra de 3 abas. Toda vez que o app oficial mudava, a vitrine ficava
 * desatualizada e passava a mostrar um produto que não existe mais. Agora ele
 * é só a MOLDURA: o conteúdo é o mesmo `EditorPreview` que roda em
 * `/painel/app/:id`. A landing não tem mais como divergir do produto.
 *
 * O que continua aqui é o que pertence à vitrine e não ao app: o chassi do
 * celular (bezel, notch), o selo "Atualizando ao vivo" e a API de props que o
 * Hero e o DemoBuilder já usavam.
 */

type Props = {
  storeName: string;
  tagline?: string;
  logoUrl?: string | null;
  logoIcon?: string;
  brandColor: string;
  categories?: CategoryItem[];
  products: PreviewProduct[];
  promotions?: PreviewPromotion[];
  tables?: PreviewTable[];
  /** Passar habilita a interação: comanda, checkout e fila de entrega. */
  onTablesChange?: (tables: PreviewTable[]) => void;
  /** Entregas iniciais (a vitrine do hero usa um exemplo pronto). */
  initialDeliveries?: DeliveryOrder[];
  showRoomTab?: boolean;
  /** Abas de Cliente, Recepção e Entregador. Na vitrine mostramos tudo. */
  showDeliveryTab?: boolean;
  liveBadge?: boolean;
  code?: string | null;
  waiterCommissionRate?: number;
};

export function PhonePreview({
  storeName,
  tagline,
  logoUrl,
  logoIcon = 'burger',
  brandColor,
  categories,
  products,
  promotions = [],
  tables = [],
  onTablesChange,
  initialDeliveries = [],
  showRoomTab = true,
  showDeliveryTab = true,
  liveBadge = false,
  code = null,
  waiterCommissionRate,
}: Props) {
  /**
   * O cardápio do app é navegado por categoria: sem nenhuma, o visitante cai
   * numa tela vazia e conclui que o produto não faz nada. Quando o chamador
   * não passa categorias, derivamos das que os próprios produtos declaram.
   */
  const derivedCategories = useMemo<CategoryItem[]>(() => {
    if (categories && categories.length > 0) return categories;

    const counts = new Map<string, number>();
    for (const product of products) {
      const name = (product.category || '').trim() || 'Destaques';
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }

    return [...counts.entries()].map(([name, itemCount], index) => ({
      _id: `demo-cat-${index}`,
      name,
      image: null,
      itemCount,
    }));
  }, [categories, products]);

  /**
   * As praças de preparo da Cozinha. A vitrine não tem cadastro de saguões,
   * então usamos os nomes que qualquer lojista reconhece — os pedidos do demo
   * caem em "Sem saguão" e o KDS continua legível.
   */
  const stations = useMemo(() => ['Cozinha', 'Bar'], []);

  return (
    <div className="phone">
      {liveBadge && (
        <span className="phone__live">
          <span className="phone__live-dot" /> Atualizando ao vivo
        </span>
      )}

      <div className="phone__frame">
        <div className="phone__notch" />

        {/* O modificador --app remove a moldura própria do EditorPreview:
            quem faz o papel de chassi aqui é o bezel acima. */}
        <div className="phone__screen phone__screen--app">
          <EditorPreview
            storeName={storeName}
            tagline={tagline}
            logoUrl={logoUrl}
            logoIcon={logoIcon}
            brandColor={brandColor}
            categories={derivedCategories}
            products={products}
            promotions={promotions}
            tables={tables}
            onTablesChange={onTablesChange}
            initialDeliveries={initialDeliveries}
            stations={stations}
            showRoomTab={showRoomTab}
            showDeliveryTab={showDeliveryTab}
            code={code}
            waiterCommissionRate={waiterCommissionRate}
          />
        </div>
      </div>
    </div>
  );
}
