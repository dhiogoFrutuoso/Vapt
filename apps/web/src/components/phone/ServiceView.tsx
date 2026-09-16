import { useEffect, useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Printer } from 'lucide-react';
import { demo } from '../../data/content';
import { brl, maskPhone } from '../../lib/format';
import { sumItems, type PreviewTable, type TableStatus, type TakeoutOrder } from './types';
import { PrintTicket } from './PrintTicket';
import { printReceipt } from '../../lib/printReceipt';

type Props = {
  tables: PreviewTable[];
  takeouts: TakeoutOrder[];
  interactive: boolean;
  flash: string | null;
  onOpenTable: (table: PreviewTable) => void;
  onOpenTakeout: (takeout: TakeoutOrder) => void;
  onCreateTakeout: (customerName: string, phone: string) => void;
  onSetTableStatus: (id: string, status: TableStatus) => void;
  onSetTakeoutStatus: (id: string, status: TableStatus) => void;
  onCancelTakeout?: (id: string) => void;
  showTables?: boolean;
  showTakeouts?: boolean;
  storeName?: string;
  storePhone?: string;
  operatorName?: string;
  serviceFeeRate?: number;
};

const STATUS_OPTIONS: Array<{ value: TableStatus; label: string }> = [
  { value: 'livre', label: 'Livre' },
  { value: 'ocupada', label: 'Ocupada' },
  { value: 'pagamento', label: 'Fechando' },
];

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
  showTables = true,
  showTakeouts = true,
  storeName = 'Vapt',
  storePhone,
  operatorName,
  serviceFeeRate = 0,
}: Props) {
  const copy = demo.preview;
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [printing, setPrinting] = useState<
    | { origin: 'mesa'; table: PreviewTable }
    | { origin: 'retirada'; takeout: TakeoutOrder }
    | null
  >(null);

  useEffect(() => {
    if (!printing) return;
    const id = window.setTimeout(() => {
      void printReceipt()
        .catch((error) => toast.error(error instanceof Error ? error.message : 'Não foi possível imprimir a comanda.'))
        .finally(() => setPrinting(null));
    }, 50);
    return () => window.clearTimeout(id);
  }, [printing]);

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

      {showTakeouts && <section className="svc-block">
        <div className="phone__section-title">
          <span>{copy.takeoutTitle}</span>
          <span className="phone__section-count">{takeouts.length}</span>
        </div>
        <p className="cat-hint">{copy.takeoutHint}</p>

        {interactive && (
          <form
            className="takeout-form mx-auto flex w-full max-w-sm flex-col gap-3"
            onSubmit={handleCreate}
          >
            <label className="takeout-form__field w-full">
              <span>{copy.takeoutNameLabel}</span>
              <input
                type="text"
                value={name}
                placeholder={copy.takeoutNamePlaceholder}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="takeout-form__field w-full">
              <span>{copy.takeoutPhoneLabel}</span>
              <input
                type="tel"
                inputMode="tel"
                value={phone}
                placeholder="(11) 99999-9999"
                onChange={(event) => setPhone(maskPhone(event.target.value))}
              />
            </label>
            <button
              type="submit"
              className="takeout-form__submit w-full"
              disabled={name.trim().length < 2}
            >
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
                    {takeout.items.length > 0 && (
                      <button type="button" className="svc-card__print" onClick={() => setPrinting({ origin: 'retirada', takeout })} aria-label={`Imprimir comanda da retirada ${takeout.label}`}>
                        <Printer size={16} aria-hidden="true" />
                      </button>
                    )}
                    {onCancelTakeout && <button
                      type="button"
                      className="svc-card__cancel"
                      onClick={() => onCancelTakeout(takeout.id)}
                      title={copy.cancelOrder}
                    >
                      ✕
                    </button>}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>}

      {showTables && <section className="svc-block">
        <div className="phone__section-title">
          <span>{copy.tablesTitle}</span>
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
                      {(table.items?.length ?? 0) > 0 && (
                        <button type="button" className="svc-card__print" onClick={() => setPrinting({ origin: 'mesa', table })} aria-label={`Imprimir comanda da mesa ${table.label}`}>
                          <Printer size={16} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </>
        )}

        {flash && <p className="phone__flash">{flash}</p>}
        {interactive && <p className="phone__hint">{demo.tables.testHint}</p>}
      </section>}

      {printing?.origin === 'retirada' && (
        <PrintTicket
          storeName={storeName}
          storePhone={storePhone}
          label={`Pedido N.: ${printing.takeout.label}`}
          origin="retirada"
          customerName={printing.takeout.customerName}
          phone={printing.takeout.phone}
          items={printing.takeout.items}
          createdAt={printing.takeout.createdAt}
          operatorName={operatorName}
          width={80}
        />
      )}
      {printing?.origin === 'mesa' && (
        <PrintTicket
          storeName={storeName}
          storePhone={storePhone}
          label={`Mesa ${printing.table.label}`}
          origin="mesa"
          customerName={`Mesa ${printing.table.label}`}
          items={printing.table.items ?? []}
          serviceFee={sumItems(printing.table.items ?? []) * serviceFeeRate}
          operatorName={operatorName}
          width={80}
        />
      )}
    </div>
  );
}
