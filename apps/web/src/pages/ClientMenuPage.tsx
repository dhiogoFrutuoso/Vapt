import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Minus, Plus, ShoppingBag, X } from 'lucide-react';
import { brl } from '../lib/format';

/**
 * `/cliente/:id` — cardápio público do restaurante.
 *
 * O cliente monta o carrinho e finaliza pelo WhatsApp. **Nada é gravado no
 * banco daqui**: a página é anônima e sem autenticação, então aceitar escrita
 * seria um endpoint aberto para qualquer um encher a fila do restaurante com
 * pedidos falsos. O pedido só vira registro quando alguém do restaurante o
 * aceita — pelo link do WhatsApp ou pela importação no painel.
 */

const BASE = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '');

type Produto = {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  imageUrl: string | null;
  isFeatured: boolean;
};

type Cardapio = {
  id: string;
  slug: string;
  name: string;
  branding: {
    storeName: string;
    tagline: string;
    logoUrl: string | null;
    primaryColor: string;
    theme: string;
  };
  delivery: {
    enabled: boolean;
    fee: number;
    minOrder: number;
    estimatedMinutes: number;
    whatsapp: string;
  };
  categories: Array<{ id: string; name: string; imageUrl: string | null }>;
  products: Produto[];
};

type ItemCarrinho = { produto: Produto; quantidade: number };

/**
 * Texto do pedido para o WhatsApp.
 *
 * Formato fixo e previsível de propósito: é ele que o importador do painel
 * vai reconhecer por regex. Mudar a pontuação aqui quebra a leitura lá.
 */
export function montarTextoPedido(params: {
  loja: string;
  itens: ItemCarrinho[];
  subtotal: number;
  taxa: number;
  cliente: string;
  telefone: string;
  endereco: string;
  observacao: string;
  /** Magic link assinado. Vai no fim do texto, se o servidor conseguiu emitir. */
  magicLink?: string;
}): string {
  const linhas = [
    `*Novo pedido — ${params.loja}*`,
    '',
    `*Cliente:* ${params.cliente}`,
    `*Telefone:* ${params.telefone}`,
  ];

  if (params.endereco.trim()) linhas.push(`*Endereço:* ${params.endereco}`);
  linhas.push('', '*Itens:*');

  for (const { produto, quantidade } of params.itens) {
    linhas.push(`${quantidade}x ${produto.name} — ${brl(produto.price * quantidade)}`);
  }

  linhas.push('', `*Subtotal:* ${brl(params.subtotal)}`);
  if (params.taxa > 0) linhas.push(`*Entrega:* ${brl(params.taxa)}`);
  linhas.push(`*Total:* ${brl(params.subtotal + params.taxa)}`);

  if (params.observacao.trim()) linhas.push('', `*Observação:* ${params.observacao}`);

  /*
   * O link fica no FIM, separado. Quem lê pelo celular vê o pedido inteiro
   * primeiro; o link é a ação, e ação vem depois da informação.
   *
   * Se o servidor não conseguiu assinar, o texto sai sem ele — o pedido
   * continua legível e o restaurante digita à mão. Melhor um pedido sem
   * automação do que nenhum pedido.
   */
  if (params.magicLink) {
    linhas.push('', '— — —', 'Registrar este pedido no sistema:', params.magicLink);
  }

  return linhas.join('\n');
}

const INPUT =
  'w-full rounded-2xl border border-solid border-gray-200 bg-white px-4 py-3 text-[0.95rem] ' +
  'text-gray-900 outline-none transition-colors focus:border-[color:var(--marca)]';

export function ClientMenuPage() {
  const { id } = useParams<{ id: string }>();

  const [cardapio, setCardapio] = useState<Cardapio | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [sacolaAberta, setSacolaAberta] = useState(false);
  const [categoria, setCategoria] = useState<string>('todas');

  const [cliente, setCliente] = useState('');
  const [telefone, setTelefone] = useState('');
  const [endereco, setEndereco] = useState('');
  const [observacao, setObservacao] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let vivo = true;

    fetch(`${BASE}/public/apps/${encodeURIComponent(id ?? '')}`)
      .then(async (r) => {
        const payload = await r.json();
        if (!r.ok || payload.ok === false) throw new Error(payload.error ?? 'Cardápio indisponível.');
        return payload.data as Cardapio;
      })
      .then((dados) => {
        if (vivo) setCardapio(dados);
      })
      .catch((e: Error) => {
        if (vivo) setErro(e.message);
      })
      .finally(() => {
        if (vivo) setCarregando(false);
      });

    return () => {
      vivo = false;
    };
  }, [id]);

  const marca = cardapio?.branding.primaryColor ?? '#F95D2A';

  /** Categorias que realmente têm item: uma vazia só gera clique frustrado. */
  const categorias = useMemo(() => {
    if (!cardapio) return [];
    const nomes = new Set(cardapio.products.map((p) => p.category || 'Outros'));
    return [...nomes];
  }, [cardapio]);

  const produtosVisiveis = useMemo(() => {
    if (!cardapio) return [];
    if (categoria === 'todas') return cardapio.products;
    return cardapio.products.filter((p) => (p.category || 'Outros') === categoria);
  }, [cardapio, categoria]);

  const subtotal = carrinho.reduce((s, i) => s + i.produto.price * i.quantidade, 0);
  const taxa = cardapio?.delivery.enabled && endereco.trim() ? cardapio.delivery.fee : 0;
  const totalItens = carrinho.reduce((s, i) => s + i.quantidade, 0);
  const abaixoDoMinimo = (cardapio?.delivery.minOrder ?? 0) > subtotal && subtotal > 0;

  function adicionar(produto: Produto) {
    setCarrinho((atual) => {
      const existente = atual.find((i) => i.produto.id === produto.id);
      if (existente) {
        return atual.map((i) =>
          i.produto.id === produto.id ? { ...i, quantidade: i.quantidade + 1 } : i
        );
      }
      return [...atual, { produto, quantidade: 1 }];
    });
  }

  function remover(produtoId: string) {
    setCarrinho((atual) =>
      atual
        .map((i) => (i.produto.id === produtoId ? { ...i, quantidade: i.quantidade - 1 } : i))
        .filter((i) => i.quantidade > 0)
    );
  }

  async function finalizar() {
    if (!cardapio || enviando) return;
    setEnviando(true);

    /*
     * Pede a assinatura ANTES de abrir o WhatsApp. Se falhar (rede, item que
     * saiu do cardápio), seguimos sem o link em vez de travar o pedido — o
     * cliente não deve perder a venda por causa da automação.
     */
    let magicLink: string | undefined;

    try {
      const r = await fetch(`${BASE}/public/apps/${encodeURIComponent(id ?? '')}/magic-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: cliente.trim(),
          phone: telefone.trim(),
          address: endereco.trim(),
          notes: observacao.trim(),
          items: carrinho.map(({ produto, quantidade }) => ({
            productId: produto.id,
            quantity: quantidade,
          })),
        }),
      });

      const payload = await r.json();
      if (r.ok && payload.ok !== false) magicLink = payload.data.url as string;
    } catch {
      /* Segue sem o link. */
    } finally {
      setEnviando(false);
    }

    const texto = montarTextoPedido({
      magicLink,
      loja: cardapio.branding.storeName,
      itens: carrinho,
      subtotal,
      taxa,
      cliente: cliente.trim(),
      telefone: telefone.trim(),
      endereco: endereco.trim(),
      observacao: observacao.trim(),
    });

    const numero = cardapio.delivery.whatsapp;
    // Sem número cadastrado, o link do wa.me abre uma conversa vazia — melhor
    // deixar o cliente escolher o contato do que mandá-lo para lugar nenhum.
    const url = numero
      ? `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`
      : `https://wa.me/?text=${encodeURIComponent(texto)}`;

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
            {erro ?? 'Não encontramos este restaurante.'}
          </p>
        </div>
      </main>
    );
  }

  const podeFinalizar = cliente.trim().length >= 2 && telefone.replace(/\D/g, '').length >= 10;

  return (
    <main
      className="min-h-[100dvh] bg-[#FAF8F5] pb-28"
      style={{ ['--marca' as string]: marca }}
    >
      <header className="px-5 py-6" style={{ backgroundColor: marca }}>
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/90">
            {cardapio.branding.logoUrl ? (
              <img src={cardapio.branding.logoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-lg font-extrabold" style={{ color: marca }}>
                {cardapio.branding.storeName.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <h1 className="m-0 truncate text-xl font-extrabold text-white">
              {cardapio.branding.storeName}
            </h1>
            {cardapio.branding.tagline && (
              <p className="m-0 mt-0.5 truncate text-sm text-white/85">{cardapio.branding.tagline}</p>
            )}
          </div>
        </div>

        {cardapio.delivery.enabled && (
          <div className="mx-auto mt-4 flex max-w-2xl flex-wrap gap-2">
            <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white">
              Entrega ~{cardapio.delivery.estimatedMinutes} min
            </span>
            <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white">
              Taxa {cardapio.delivery.fee > 0 ? brl(cardapio.delivery.fee) : 'grátis'}
            </span>
            {cardapio.delivery.minOrder > 0 && (
              <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white">
                Mínimo {brl(cardapio.delivery.minOrder)}
              </span>
            )}
          </div>
        )}
      </header>

      <div className="mx-auto max-w-2xl px-5">
        {categorias.length > 1 && (
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 py-4">
            {['todas', ...categorias].map((nome) => (
              <button
                key={nome}
                type="button"
                onClick={() => setCategoria(nome)}
                className="shrink-0 rounded-full border border-solid px-4 py-2 text-sm font-bold transition-colors"
                style={
                  categoria === nome
                    ? { backgroundColor: marca, borderColor: marca, color: '#fff' }
                    : { backgroundColor: '#fff', borderColor: '#e5e7eb', color: '#6b7280' }
                }
              >
                {nome === 'todas' ? 'Todos' : nome}
              </button>
            ))}
          </div>
        )}

        <ul className="m-0 flex list-none flex-col gap-3 p-0 pt-2">
          {produtosVisiveis.map((produto) => {
            const noCarrinho = carrinho.find((i) => i.produto.id === produto.id)?.quantidade ?? 0;

            return (
              <li
                key={produto.id}
                className="flex gap-3 rounded-3xl bg-white p-4 shadow-[0_10px_30px_-4px_rgba(17,17,17,0.06)]"
              >
                {produto.imageUrl && (
                  <img
                    src={produto.imageUrl}
                    alt=""
                    className="h-20 w-20 shrink-0 rounded-2xl object-cover"
                  />
                )}

                <div className="min-w-0 flex-1">
                  <strong className="block text-[0.98rem] font-extrabold text-gray-900">
                    {produto.name}
                  </strong>
                  {produto.description && (
                    <p className="m-0 mt-1 line-clamp-2 text-sm leading-snug text-gray-500">
                      {produto.description}
                    </p>
                  )}
                  <span className="mt-2 block text-[0.98rem] font-extrabold" style={{ color: marca }}>
                    {brl(produto.price)}
                  </span>
                </div>

                <div className="flex shrink-0 flex-col items-center justify-center gap-2">
                  {noCarrinho > 0 && (
                    <button
                      type="button"
                      onClick={() => remover(produto.id)}
                      aria-label={`Remover ${produto.name}`}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-solid border-gray-200 bg-white text-gray-600"
                    >
                      <Minus size={15} />
                    </button>
                  )}

                  {noCarrinho > 0 && (
                    <span className="text-sm font-extrabold text-gray-900">{noCarrinho}</span>
                  )}

                  <button
                    type="button"
                    onClick={() => adicionar(produto)}
                    aria-label={`Adicionar ${produto.name}`}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-white"
                    style={{ backgroundColor: marca }}
                  >
                    <Plus size={15} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        {produtosVisiveis.length === 0 && (
          <p className="py-16 text-center text-[0.95rem] text-gray-400">
            Nenhum item nesta categoria.
          </p>
        )}
      </div>

      {/* --------------------------- Barra da sacola -------------------------- */}
      {totalItens > 0 && !sacolaAberta && (
        <button
          type="button"
          onClick={() => setSacolaAberta(true)}
          className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between px-6 py-4 text-white"
          style={{ backgroundColor: marca, paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <span className="flex items-center gap-2 text-[0.95rem] font-bold">
            <ShoppingBag size={18} />
            Ver sacola · {totalItens}
          </span>
          <span className="text-[0.95rem] font-extrabold">{brl(subtotal)}</span>
        </button>
      )}

      {/* ------------------------------- Checkout ----------------------------- */}
      {sacolaAberta && (
        <div className="fixed inset-0 z-30 flex flex-col justify-end bg-black/40">
          <div className="max-h-[92dvh] overflow-y-auto rounded-t-3xl bg-white p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="m-0 text-lg font-extrabold text-gray-900">Seu pedido</h2>
              <button
                type="button"
                onClick={() => setSacolaAberta(false)}
                aria-label="Fechar sacola"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-600"
              >
                <X size={16} />
              </button>
            </div>

            <ul className="m-0 mb-5 flex list-none flex-col gap-2.5 p-0">
              {carrinho.map(({ produto, quantidade }) => (
                <li key={produto.id} className="flex items-center gap-3 text-[0.95rem]">
                  <span className="font-extrabold" style={{ color: marca }}>
                    {quantidade}x
                  </span>
                  <span className="min-w-0 flex-1 truncate text-gray-900">{produto.name}</span>
                  <span className="font-semibold text-gray-900">
                    {brl(produto.price * quantidade)}
                  </span>
                  <button
                    type="button"
                    onClick={() => remover(produto.id)}
                    aria-label={`Remover um ${produto.name}`}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500"
                  >
                    <Minus size={13} />
                  </button>
                </li>
              ))}
            </ul>

            <div className="mb-5 flex flex-col gap-3">
              <input
                className={INPUT}
                placeholder="Seu nome"
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                autoComplete="name"
              />
              <input
                className={INPUT}
                placeholder="Seu WhatsApp com DDD"
                inputMode="tel"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                autoComplete="tel"
              />
              {cardapio.delivery.enabled && (
                <input
                  className={INPUT}
                  placeholder="Endereço de entrega (deixe vazio para retirar)"
                  value={endereco}
                  onChange={(e) => setEndereco(e.target.value)}
                  autoComplete="street-address"
                />
              )}
              <textarea
                className={`${INPUT} min-h-[72px] resize-y`}
                placeholder="Observação (sem cebola, ponto da carne...)"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
              />
            </div>

            <div className="mb-5 flex flex-col gap-1.5 border-0 border-t border-solid border-gray-100 pt-4 text-[0.95rem]">
              <div className="flex justify-between text-gray-500">
                <span>Subtotal</span>
                <span>{brl(subtotal)}</span>
              </div>
              {taxa > 0 && (
                <div className="flex justify-between text-gray-500">
                  <span>Entrega</span>
                  <span>{brl(taxa)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-extrabold text-gray-900">
                <span>Total</span>
                <span>{brl(subtotal + taxa)}</span>
              </div>
            </div>

            {abaixoDoMinimo && (
              <p className="m-0 mb-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
                O pedido mínimo para entrega é {brl(cardapio.delivery.minOrder)}.
              </p>
            )}

            <button
              type="button"
              onClick={() => void finalizar()}
              disabled={!podeFinalizar || enviando}
              className="w-full rounded-full px-6 py-4 text-[1rem] font-bold text-white
                transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
              style={{ backgroundColor: marca }}
            >
              {enviando
                ? 'Preparando...'
                : podeFinalizar
                  ? 'Enviar pedido pelo WhatsApp'
                  : 'Preencha nome e WhatsApp'}
            </button>

            <p className="m-0 mt-3 text-center text-xs leading-relaxed text-gray-400">
              O pedido abre no WhatsApp do restaurante. A confirmação vem por lá.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
