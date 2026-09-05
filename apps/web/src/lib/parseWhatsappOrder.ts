/**
 * Leitor do texto de pedido colado do WhatsApp.
 *
 * O texto vem do `montarTextoPedido` da página do cliente — formato fixo e
 * previsível, justamente para poder ser lido de volta. Mas o funcionário cola
 * de um app de mensagem, e o que chega raramente é idêntico ao que saiu:
 *
 *   - o WhatsApp pode remover os asteriscos ao copiar;
 *   - o cliente às vezes edita o texto antes de enviar;
 *   - copiar do celular traz espaços não separáveis (U+00A0) e quebras \r\n;
 *   - o encaminhamento adiciona linhas antes e depois.
 *
 * Por isso o parser é TOLERANTE: cada campo é procurado por conta própria, em
 * qualquer linha, e o que não for encontrado volta vazio em vez de derrubar a
 * importação inteira. Um pedido lido pela metade que o funcionário completa é
 * melhor do que um "formato inválido" que o obriga a digitar tudo.
 */

export type ItemImportado = {
  name: string;
  price: number;
  quantity: number;
};

export type PedidoImportado = {
  customerName: string;
  phone: string;
  address: string;
  notes: string;
  items: ItemImportado[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  /** O que não foi encontrado. A tela avisa em vez de fingir que leu tudo. */
  faltando: string[];
};

/** Normaliza o texto antes de qualquer leitura. */
function limpar(texto: string): string {
  return texto
    .replace(/\r\n?/g, '\n')
    // Espaço não separável vira espaço comum: colado do celular, ele aparece
    // no lugar do espaço e faz todo `\s` falhar.
    .replace(/ /g, ' ')
    // Negrito do WhatsApp é opcional: some para os padrões não dependerem dele.
    .replace(/\*/g, '')
    .trim();
}

/**
 * "R$ 1.234,56" -> 1234.56
 *
 * O ponto é separador de milhar e a vírgula é decimal. `parseFloat` direto
 * leria "1.234,56" como 1.234 — erro de mil vezes, silencioso.
 */
export function lerValor(bruto: string): number {
  const limpo = bruto
    .replace(/[R$\s]/gi, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const n = Number.parseFloat(limpo);
  return Number.isFinite(n) ? n : 0;
}

/** Procura um rótulo em qualquer linha e devolve o que vem depois dos dois-pontos. */
function campo(linhas: string[], rotulos: string[]): string {
  for (const linha of linhas) {
    for (const rotulo of rotulos) {
      const padrao = new RegExp(`^\\s*${rotulo}\\s*:\\s*(.+)$`, 'i');
      const m = padrao.exec(linha);
      if (m) return m[1].trim();
    }
  }
  return '';
}

/**
 * Linha de item: `2x Porção de Calabresa — R$ 85,80`
 *
 * O separador aceita travessão, hífen ou nada, porque o WhatsApp às vezes
 * converte "—" e o cliente às vezes reescreve a linha na mão.
 */
const LINHA_ITEM = /^\s*(\d{1,2})\s*[x×]\s*(.+?)\s*(?:[—–-]\s*)?R\$\s*([\d.,]+)\s*$/i;

/** Sem valor na linha: `2x Coca-Cola`. Preço fica 0 e o funcionário completa. */
const LINHA_ITEM_SEM_VALOR = /^\s*(\d{1,2})\s*[x×]\s*(.+?)\s*$/i;

export function parseWhatsappOrder(textoBruto: string): PedidoImportado {
  const texto = limpar(textoBruto);
  const linhas = texto.split('\n').map((l) => l.trim());
  const faltando: string[] = [];

  const customerName = campo(linhas, ['Cliente', 'Nome']);
  const phone = campo(linhas, ['Telefone', 'Fone', 'WhatsApp', 'Celular']);
  const address = campo(linhas, ['Endereço', 'Endereco', 'Entregar em']);
  const notes = campo(linhas, ['Observação', 'Observacao', 'Obs']);

  if (!customerName) faltando.push('nome do cliente');
  if (!phone) faltando.push('telefone');

  /*
   * Os itens ficam entre "Itens:" e a primeira linha de total. Delimitar em
   * vez de varrer o texto inteiro evita que "Subtotal: R$ 100,30" seja lido
   * como um item chamado "Subtotal".
   */
  const inicio = linhas.findIndex((l) => /^itens\s*:?\s*$/i.test(l));
  const items: ItemImportado[] = [];

  const ehTotal = (l: string) => /^(sub\s*total|subtotal|entrega|taxa|total)\s*:/i.test(l);

  for (let i = (inicio >= 0 ? inicio : -1) + 1; i < linhas.length; i += 1) {
    const linha = linhas[i];
    if (!linha) continue;
    if (ehTotal(linha)) break;
    // O magic link vem depois dos totais, mas se o texto for editado pode
    // aparecer antes; uma URL nunca é item.
    if (/^https?:\/\//i.test(linha) || linha.startsWith('—')) continue;

    const comValor = LINHA_ITEM.exec(linha);
    if (comValor) {
      const quantidade = Number.parseInt(comValor[1], 10);
      const totalDaLinha = lerValor(comValor[3]);
      items.push({
        name: comValor[2].trim(),
        // O texto traz o total da linha; o carrinho trabalha com preço unitário.
        price: quantidade > 0 ? Number((totalDaLinha / quantidade).toFixed(2)) : totalDaLinha,
        quantity: quantidade,
      });
      continue;
    }

    const semValor = LINHA_ITEM_SEM_VALOR.exec(linha);
    if (semValor && inicio >= 0) {
      items.push({
        name: semValor[2].trim(),
        price: 0,
        quantity: Number.parseInt(semValor[1], 10),
      });
    }
  }

  if (items.length === 0) faltando.push('itens');

  const subtotalLido = lerValor(campo(linhas, ['Subtotal', 'Sub total']));
  const deliveryFee = lerValor(campo(linhas, ['Entrega', 'Taxa de entrega', 'Taxa']));
  const totalLido = lerValor(campo(linhas, ['Total']));

  /*
   * Somamos os itens em vez de confiar no subtotal escrito. O texto pode ter
   * sido editado à mão, e a conta que vale é a dos itens que a cozinha vai
   * produzir. O subtotal declarado serve só de conferência.
   */
  const subtotalCalculado = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const subtotal = subtotalCalculado > 0 ? Number(subtotalCalculado.toFixed(2)) : subtotalLido;

  if (subtotalLido > 0 && Math.abs(subtotalLido - subtotal) > 0.05) {
    faltando.push('o subtotal do texto não bate com a soma dos itens');
  }

  return {
    customerName,
    phone,
    address,
    notes,
    items,
    subtotal,
    deliveryFee,
    total: totalLido > 0 ? totalLido : subtotal + deliveryFee,
    faltando,
  };
}
