import { brl } from '../../lib/format';
import type { CashMovement } from './types';

type Props = {
  movement: CashMovement;
  storeName: string;
  storePhone?: string;
  draft?: boolean;
};

function dateTime(value: number): string {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

/** Comprovante separado dos pedidos: uma saída não é venda nem pagamento. */
export function CashMovementTicket({ movement, storeName, storePhone, draft = false }: Props) {
  return (
    <div className="print-ticket print-ticket--80" role="document" aria-hidden="true">
      <p className="print-ticket__store">{storeName}</p>
      {storePhone && <p className="print-ticket__store-contact">{storePhone}</p>}
      <hr className="print-ticket__rule" />
      <p className="print-ticket__printed">IMPRESSO EM {dateTime(Date.now())}</p>
      <p className="print-ticket__non-fiscal">*** NÃO É DOCUMENTO FISCAL ***</p>
      <p className="print-ticket__movement-title">SAÍDA DE DINHEIRO</p>
      {draft && <p className="print-ticket__movement-draft">PRÉVIA — NÃO REGISTRADA</p>}
      <dl className="print-ticket__meta">
        {!draft && <div><dt>Registro:</dt><dd>{movement.id}</dd></div>}
        <div><dt>{draft ? 'Prévia:' : 'Registrado em:'}</dt><dd>{dateTime(movement.createdAt)}</dd></div>
        <div><dt>Operador:</dt><dd>{movement.operatorName || 'Equipe Vapt'}</dd></div>
      </dl>
      <hr className="print-ticket__rule" />
      <p className="print-ticket__movement-label">MOTIVO</p>
      <p className="print-ticket__movement-reason">{movement.reason}</p>
      <div className="print-ticket__totals">
        <div className="print-ticket__line print-ticket__line--total">
          <span>VALOR RETIRADO</span><span>{brl(movement.amount)}</span>
        </div>
      </div>
      <p className="print-ticket__movement-signature">Assinatura do responsável</p>
      <p className="print-ticket__signature">Vapt · controle de caixa</p>
      <div className="print-ticket__feed" />
    </div>
  );
}
