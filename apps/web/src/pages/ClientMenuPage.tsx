import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ClientOrderFlow, type DadosCheckout } from '../components/phone/ClientOrderFlow';
import type {
  CategoryItem,
  OrderItem,
  PreviewProduct,
  PreviewPromotion,
} from '../components/phone/types';
import { brl } from '../lib/format';
import { io } from 'socket.io-client';

/**
 * `/cliente/:id` — o cardápio que o cliente final abre.
 *
 * O ESPELHO
 * ---------
 * Esta página NÃO desenha o cardápio. Ela busca os dados e entrega ao
 * `ClientOrderFlow`, o mesmo componente que a aba Cliente do aplicativo usa.
 *
 * Antes eram duas telas separadas fazendo a mesma coisa, e o custo disso
 * aparecia devagar: uma promoção nova saía num lado e não no outro, e ninguém
 * descobria até um cliente reclamar do preço no balcão.
 *
 * A única diferença é `mostrarImportacao`, que fica desligada aqui — importar
 * texto do WhatsApp é ferramenta de quem ATENDE, não de quem pede.
 *
 * O FLUXO DO PEDIDO
 * -----------------
 *   1. cria o pedido no banco (`POST /public/apps/:id/orders`);
 *   2. redireciona para o WhatsApp do restaurante com o resumo.
 *
 * Nessa ordem, e não o contrário. Criando primeiro, o pedido já está na
 * Recepção e na Cozinha mesmo que o cliente feche a aba do WhatsApp sem
 * enviar a mensagem — que é o que acontece quando o celular trava. Mandando
 * só a mensagem, o restaurante dependeria de o cliente lembrar de apertar
 * enviar.
 */

const BASE = import.meta.env.VITE_API_URL ?? '/api';

type CardapioPublico = {
  id: string;
  name: string;
  branding: {
    storeName: string;
    tagline: string;
    logoUrl: string | null;
    primaryColor: string;
    theme: 'claro' | 'escuro';
  };
  delivery: {
    enabled: boolean;
    fee: number;
    minOrder: number;
    estimatedMinutes: number;
    whatsapp: string;
  };
  categories: Array<{ id: string; name: string; imageUrl: string | null }>;
  products: Array<{
    id: string;
    name: string;
    description: string;
    price: number;
    pricingType: 'unit' | 'weight';
    category: string;
    imageUrl: string | null;
    isFeatured: boolean;
  }>;
  promotions: Array<{
    id: string;
    type: 'combo' | 'discount';
    name: string;
    description: string;
    promotionalPrice: number;
    comboItems: string[];
    targetProductId: string | null;
  }>;
};

/**
 * Resumo enviado ao WhatsApp.
 *
 * O formato é fixo porque o importador do painel o LÊ de volta: o
 * recepcionista cola a mensagem e o sistema reconstrói o pedido. Mudar a
 * ordem das linhas aqui quebra o parser do outro lado.
 */
export function montarTextoPedido(params: {
  loja: string;
  cliente: string;
  telefone: string;
  endereco: string;
  observacao: string;
  itens: OrderItem[];
  subtotal: number;
  taxa: number;
  codigo?: string;
}): string {
  const { loja, cliente, telefone, endereco, observacao, itens, subtotal, taxa, codigo } = params;

  /* Agrupa por nome: a lista interna tem uma linha por unidade. */
  const contagem = new Map<string, { qtd: number; total: number }>();
  for (const item of itens) {
    const atual = contagem.get(item.name) ?? { qtd: 0, total: 0 };
    contagem.set(item.name, { qtd: atual.qtd + 1, total: atual.total + item.price });
  }

  const linhas = [
    `*Novo pedido — ${loja}*`,
    '',
    `*Cliente:* ${cliente}`,
    `*Telefone:* ${telefone}`,
  ];

  if (endereco) linhas.push(`*Endereço:* ${endereco}`);
  else linhas.push('*Retirada no balcão*');

  linhas.push('', '*Itens:*');
  for (const [nome, { qtd, total }] of contagem) {
    linhas.push(`${qtd}x ${nome} — ${brl(total)}`);
  }

  linhas.push('', `*Subtotal:* ${brl(subtotal)}`);
  if (taxa > 0) linhas.push(`*Entrega:* ${brl(taxa)}`);
  linhas.push(`*Total:* ${brl(subtotal + taxa)}`);

  if (observacao) linhas.push('', `*Observação:* ${observacao}`);
  if (codigo) linhas.push('', `Pedido nº ${codigo}`);

  return linhas.join('\n');
}

export function ClientMenuPage() {
  const { id } = useParams<{ id: string }>();

  const [cardapio, setCardapio] = useState<CardapioPublico | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let vivo = true;

    (async () => {
      try {
        const r = await fetch(`${BASE}/public/apps/${encodeURIComponent(id ?? '')}`);
        const payload = await r.json();
        if (!vivo) return;

        if (!r.ok || payload.ok === false) {
          setErro(payload.error ?? 'Cardápio indisponível.');
        } else {
          setCardapio(payload.data as CardapioPublico);
        }
      } catch {
        if (vivo) setErro('Não foi possível carregar o cardápio.');
      } finally {
        if (vivo) setCarregando(false);
      }
    })();

    return () => {
      vivo = false;
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const origin = BASE.startsWith('http') ? BASE.replace(/\/api\/?$/, '') : window.location.origin;
    const socket = io(origin, {
      auth: { publicAppId: id },
      transports: ['polling', 'websocket'],
    });
    socket.on('menu_item_availability_changed', async () => {
      try {
        const response = await fetch(`${BASE}/public/apps/${encodeURIComponent(id)}`);
        const payload = await response.json();
        if (response.ok && payload.ok !== false) setCardapio(payload.data as CardapioPublico);
      } catch {
        /* A próxima reconexão ou recarga recupera o estado; o carrinho atual é preservado. */
      }
    });
    return () => {
      socket.close();
    };
  }, [id]);

  /*
   * Converte o formato da rota pública para o que os componentes esperam.
   *
   * A tradução acontece AQUI, num lugar só. Espalhada pelos componentes, cada
   * um inventaria o próprio mapeamento e o campo renomeado no servidor
   * quebraria três telas em vez de uma.
   */
  const products = useMemo<PreviewProduct[]>(
    () =>
      (cardapio?.products ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        price: p.price,
        pricingType: p.pricingType,
        category: p.category,
        imageUrl: p.imageUrl,
        isFeatured: p.isFeatured,
      })),
    [cardapio]
  );

  const promotions = useMemo<PreviewPromotion[]>(
    () =>
      (cardapio?.promotions ?? []).map((p) => ({
        _id: p.id,
        type: p.type,
        name: p.name,
        description: p.description,
        promotionalPrice: p.promotionalPrice,
        targetProductId: p.targetProductId,
        comboItems: p.comboItems,
        validUntil: null,
        expiresOnRegisterClose: false,
        active: true,
      })),
    [cardapio]
  );

  const categories = useMemo<CategoryItem[]>(
    () =>
      (cardapio?.categories ?? []).map((c) => ({
        _id: c.id,
        name: c.name,
        image: c.imageUrl,
      })),
    [cardapio]
  );

  async function enviarPedido(dados: DadosCheckout) {
    if (!cardapio || enviando) return;
    setEnviando(true);

    /*
     * Casa o item do carrinho com o produto do cardápio para recuperar o id.
     * O servidor recebe id + quantidade e lê o preço do banco — nunca o preço
     * que o navegador manda.
     */
    const porNome = new Map(products.map((p) => [p.name, p.id]));
    const contagem = new Map<string, number>();
    for (const item of cart) {
      const pid = porNome.get(item.name);
      if (!pid) continue;
      contagem.set(pid, (contagem.get(pid) ?? 0) + 1);
    }

    const endereco = dados.isDelivery
      ? [dados.address.street, dados.address.number].filter(Boolean).join(', ')
      : '';

    let codigo = '';

    try {
      const r = await fetch(`${BASE}/public/apps/${encodeURIComponent(id ?? '')}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: dados.customerName,
          phone: dados.phone,
          notes: dados.notes,
          isDelivery: dados.isDelivery,
          address: dados.isDelivery
            ? {
                street: dados.address.street ?? '',
                number: dados.address.number ?? '',
                district: dados.address.district ?? '',
                city: dados.address.city ?? '',
                reference: dados.address.reference ?? '',
              }
            : {},
          items: [...contagem].map(([productId, quantity]) => ({ productId, quantity })),
        }),
      });

      const payload = await r.json();
      if (r.ok && payload.ok !== false) codigo = String(payload.data.code ?? '');
    } catch {
      /*
       * Sem rede o pedido não entrou. Seguimos para o WhatsApp mesmo assim:
       * a mensagem chega ao restaurante e alguém lança à mão, o que é melhor
       * do que o cliente ficar preso numa tela de erro com o pedido montado.
       */
    } finally {
      setEnviando(false);
    }

    const subtotal = cart.reduce((soma, item) => soma + item.price, 0);
    const taxa = dados.isDelivery ? cardapio.delivery.fee : 0;

    const texto = montarTextoPedido({
      loja: cardapio.branding.storeName,
      cliente: dados.customerName,
      telefone: dados.phone,
      endereco,
      observacao: dados.notes,
      itens: cart,
      subtotal,
      taxa,
      codigo,
    });

    const numero = cardapio.delivery.whatsapp;
    /* Sem número cadastrado, o wa.me abre uma conversa vazia — melhor deixar
       o cliente escolher o contato do que mandá-lo para lugar nenhum. */
    const url = numero
      ? `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`
      : `https://wa.me/?text=${encodeURIComponent(texto)}`;

    setCart([]);
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  if (carregando) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[#FAF8F5]">
        <p className="m-0 text-sm font-semibold text-gray-400">Carregando cardápio...</p>
      </main>
    );
  }

  if (erro || !cardapio) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[#FAF8F5] px-6">
        <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-[0_10px_30px_-4px_rgba(17,17,17,0.06)]">
          <h1 className="m-0 text-xl font-extrabold text-gray-900">Cardápio indisponível</h1>
          <p className="m-0 mt-3 text-[0.95rem] leading-relaxed text-gray-500">
            {erro ?? 'Tente novamente em instantes.'}
          </p>
        </div>
      </main>
    );
  }

  const marca = cardapio.branding.primaryColor;

  return (
    /*
     * As classes `editor-preview` e `theme-*` são o que o CSS dos componentes
     * espera — `.phone__*` é escopado por dentro delas. Sem isso o cardápio
     * sai sem estilo nenhum.
     */
    <main
      className={`client-menu editor-preview theme-${cardapio.branding.theme}`}
      style={{ ['--brand' as string]: marca, ['--on-brand' as string]: '#ffffff' }}
    >
      <div className="editor-preview__screen">
        <ClientOrderFlow
          storeName={cardapio.branding.storeName}
          logoUrl={cardapio.branding.logoUrl}
          brandColor={marca}
          theme={cardapio.branding.theme}
          products={products}
          promotions={promotions}
          categories={categories}
          cart={cart}
          onCartChange={setCart}
          /* Importar do WhatsApp é ferramenta de quem atende. */
          mostrarImportacao={false}
          aceitaEntrega={cardapio.delivery.enabled}
          rotuloEnvio={enviando ? 'Enviando...' : 'Enviar pedido pelo WhatsApp'}
          onSubmit={enviarPedido}
        />
      </div>
    </main>
  );
}
