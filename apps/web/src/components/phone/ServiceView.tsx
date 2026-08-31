import { useState, type FormEvent } from 'react';
import { demo } from '../../data/content';
import { brl, maskPhone } from '../../lib/format';
import { sumItems, type PreviewTable, type TableStatus, type TakeoutOrder } from './types';

type Props = {
  tables: PreviewTable[];
  takeouts: TakeoutOrder[];
  interactive: boolean;
  flash: string | null;
  onOpenTable: (table: PreviewTable) => void;
  onOpenTakeout: (takeout: TakeoutOrder) => void;
  onCreateTakeout: (customerName: string, phone: string) => void;
  /** Troca de status feita à mão pelo recepcionista. */
  onSetTableStatus: (id: string, status: TableStatus) => void;
  onSetTakeoutStatus: (id: string, status: TableStatus) => void;
  onCancelTakeout: (id: string) => void;
};

const STATUS_OPTIONS: Array<{ value: TableStatus; label: string }> = [
  { value: 'livre', label: 'Livre' },
  { value: 'ocupada', label: 'Ocupada' },
  { value: 'pagamento', label: 'Fechando' },
];

/**
 * Aba "Equipe" — sub-aba Atendimento.
 *
 * Duas partes, na ordem que o balcão usa:
 *   1. RETIRADA: o recepcionista abre um pedido com o nome do cliente e ele
 *      vira um card igual ao de mesa;
 *   2. MESAS: o mapa do salão.
 *
 * O status continua se resolvendo sozinho ao tocar no card (livre -> ocupada),
 * mas agora também dá para forçar na mão pelo seletor de cada card — o salão
 * real tem exceções que o automático não cobre.
 */
export function ServiceView({
  tables,
  takeouts,
  interactive,
  flash,
  onOpenTable,
  onOpenTakeout,
  onCreateTakeout,
  onSetTableStatus,
  onSetTakeoutStatus,
  onCancelTakeout,
}: Props) {
  const copy = demo.preview;
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2) return;
    onCreateTakeout(name.trim(), phone.trim());
    setName('');
    setPhone('');
  }

  return (
    <div className="phone__body">
      <p className="phone__role">
        <span aria-hidden="true">{copy.roleStrip.salao.icon}</span>
        {copy.roleStrip.salao.text}
      </p>

      {/* ----------------------- 1. Retirada no balcão --------------------- */}
      <section className="svc-block">
        <div className="phone__section-title">
          <span>🛍️ {copy.takeoutTitle}</span>
          <span className="phone__section-count">{takeouts.length}</span>
        </div>
        <p className="cat-hint">{copy.takeoutHint}</p>

        {interactive && (
          <form className="takeout-form" onSubmit={handleCreate}>
            <label className="takeout-form__field">
              <span>{copy.takeoutNameLabel}</span>
              <input
                type="text"
                value={name}
                placeholder={copy.takeoutNamePlaceholder}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="takeout-form__field">
              <span>{copy.takeoutPhoneLabel}</span>
              <input
                type="tel"
                inputMode="tel"
                value={phone}
                placeholder="(11) 99999-9999"
                onChange={(event) => setPhone(maskPhone(event.target.value))}
              />
            </label>
            <button type="submit" className="takeout-form__submit" disabled={name.trim().length < 2}>
              + {copy.takeoutCreate}
            </button>
          </form>
        )}

        {takeouts.length === 0 ? (
          <p className="cat-empty">{copy.takeoutEmpty}</p>
        ) : (
          <div className="svc-grid">
            {takeouts.map((takeout) => (
              <article key={takeout.id} className={`svc-card is-${takeout.status}`}>
                <button
                  type="button"
                  className="svc-card__open"
                  onClick={() => onOpenTakeout(takeout)}
                  disabled={!interactive}
                >
                  <span className="svc-card__badge">
                    {copy.takeoutBadge} #{takeout.label}
                  </span>
                  <strong className="svc-card__name">{takeout.customerName}</strong>
                  <span className="svc-card__meta">
                    {takeout.items.length} {takeout.items.length === 1 ? 'item' : 'itens'}
                  </span>
                  {takeout.items.length > 0 && (
                    <span className="svc-card__total">{brl(sumItems(takeout.items))}</span>
                  )}
                </button>

                {interactive && (
                  <div className="svc-card__foot">
                    <label className="svc-status">
                      <span className="sr-only">{copy.statusManualLabel}</span>
                      <select
                        value={takeout.status}
                        onChange={(event) => onSetTakeoutStatus(takeout.id, event.target.value as TableStatus)}
                        aria-label={`${copy.statusManualLabel} da retirada de ${takeout.customerName}`}
                      >
                        {STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="svc-card__cancel"
                      onClick={() => onCancelTakeout(takeout.id)}
                      title={copy.cancelOrder}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {/* --------------------------- 2. Mesas ----------------------------- */}
      <section className="svc-block">
        <div className="phone__section-title">
          <span>🪑 {copy.tablesTitle}</span>
          <span className="phone__section-count">
            {tables.length} {tables.length === 1 ? 'mesa' : 'mesas'}
          </span>
        </div>

        {tables.length === 0 ? (
          <p className="cat-empty">{copy.emptyRoom}</p>
        ) : (
          <>
            <div className="phone__legend">
              {copy.legend.map((item) => (
                <span key={item.status} className={`phone__legend-item is-${item.status}`}>
                  {item.label}
                </span>
              ))}
            </div>

            <div className="svc-grid svc-grid--tables">
              {tables.map((table) => (
                <article key={table.id} className={`svc-card is-${table.status}`}>
                  <button
                    type="button"
                    className="svc-card__open"
                    onClick={() => onOpenTable(table)}
                    disabled={!interactive}
                  >
                    <span className="svc-card__badge">{table.area}</span>
                    <strong className="svc-card__name">Mesa {table.label}</strong>
                    <span className="svc-card__meta">{table.seats} lugares</span>
                    {sumItems(table.items ?? []) > 0 && (
                      <span className="svc-card__total">{brl(sumItems(table.items ?? []))}</span>
                    )}
                  </button>

                  {interactive && (
                    <div className="svc-card__foot">
                      <label className="svc-status">
                        <span className="sr-only">{copy.statusManualLabel}</span>
                        <select
                          value={table.status}
                          onChange={(event) => onSetTableStatus(table.id, event.target.value as TableStatus)}
                          aria-label={`${copy.statusManualLabel} da mesa ${table.label}`}
                        >
                          {STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </>
        )}

        {flash && <p className="phone__flash">{flash}</p>}
        {interactive && <p className="phone__hint">{demo.tables.testHint}</p>}
      </section>
    </div>
  );
}
