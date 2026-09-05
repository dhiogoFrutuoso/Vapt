import { useState } from 'react';
import { ClipboardPaste, X } from 'lucide-react';
import { brl } from '../../lib/format';
import { parseWhatsappOrder, type PedidoImportado } from '../../lib/parseWhatsappOrder';

/**
 * "Importar do WhatsApp" — cola o texto do cliente e monta o carrinho.
 *
 * Serve para o caminho que não passou pelo magic link: o cliente digitou o
 * pedido à mão na conversa, ou o link expirou. Em vez de o funcionário
 * redigitar item por item enquanto o telefone toca, ele cola e revisa.
 *
 * A leitura NÃO cria o pedido: ela preenche o carrinho da aba Cliente. Um
 * texto de WhatsApp é entrada não confiável — quem confirma é a pessoa, com o
 * pedido montado na tela.
 */

type Props = {
  onImport: (pedido: PedidoImportado) => void;
};

export function ImportOrderPanel({ onImport }: Props) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');
  const [previa, setPrevia] = useState<PedidoImportado | null>(null);

  function analisar(valor: string) {
    setTexto(valor);
    // Prévia ao vivo: o funcionário vê o que foi entendido antes de confirmar.
    setPrevia(valor.trim().length > 12 ? parseWhatsappOrder(valor) : null);
  }

  async function colarDaAreaDeTransferencia() {
    try {
      const conteudo = await navigator.clipboard.readText();
      analisar(conteudo);
    } catch {
      /* Sem permissão: o funcionário cola com Ctrl+V no próprio campo. */
    }
  }

  function confirmar() {
    if (!previa || previa.items.length === 0) return;
    onImport(previa);
    setTexto('');
    setPrevia(null);
    setAberto(false);
  }

  if (!aberto) {
    return (
      <button type="button" className="import-order__open" onClick={() => setAberto(true)}>
        <ClipboardPaste size={14} />
        Importar do WhatsApp
      </button>
    );
  }

  return (
    <section className="import-order">
      <header className="import-order__head">
        <strong>Importar do WhatsApp</strong>
        <button
          type="button"
          onClick={() => setAberto(false)}
          aria-label="Fechar importação"
          className="import-order__close"
        >
          <X size={14} />
        </button>
      </header>

      <textarea
        className="import-order__field"
        value={texto}
        onChange={(e) => analisar(e.target.value)}
        placeholder="Cole aqui o texto do pedido que o cliente mandou no WhatsApp."
        rows={5}
      />

      <div className="import-order__actions">
        <button type="button" className="import-order__paste" onClick={() => void colarDaAreaDeTransferencia()}>
          Colar
        </button>
        <button
          type="button"
          className="import-order__submit"
          onClick={confirmar}
          disabled={!previa || previa.items.length === 0}
        >
          Importar
        </button>
      </div>

      {previa && (
        <div className="import-order__preview">
          {previa.items.length === 0 ? (
            <p className="import-order__warn">
              Não encontramos itens nesse texto. Confira se as linhas estão no formato
              <strong> 2x Nome do item — R$ 00,00</strong>.
            </p>
          ) : (
            <>
              <p className="import-order__line">
                <strong>{previa.customerName || 'Sem nome'}</strong>
                {previa.phone ? ` · ${previa.phone}` : ''}
              </p>

              {previa.address && <p className="import-order__line">{previa.address}</p>}

              <ul className="import-order__items">
                {previa.items.map((item, index) => (
                  <li key={`${item.name}-${index}`}>
                    <span>
                      {item.quantity}x {item.name}
                    </span>
                    <span>{item.price > 0 ? brl(item.price * item.quantity) : 'sem valor'}</span>
                  </li>
                ))}
              </ul>

              <p className="import-order__total">
                Total lido: <strong>{brl(previa.total)}</strong>
              </p>

              {previa.faltando.length > 0 && (
                <p className="import-order__warn">Confira antes de importar: {previa.faltando.join(', ')}.</p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
