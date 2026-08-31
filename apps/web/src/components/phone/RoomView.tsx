import { demo } from '../../data/content';
import { brl } from '../../lib/format';
import { tableTotal, type PreviewTable } from './types';

type Props = {
  tables: PreviewTable[];
  interactive: boolean;
  flash: string | null;
  hasOpenTable: boolean;
  onOpenTable: (table: PreviewTable) => void;
};

/** Aba "Equipe": o mapa de mesas que o garçom vê no app VaptApp Parceiro. */
export function RoomView({ tables, interactive, flash, hasOpenTable, onOpenTable }: Props) {
  return (
    <div className="phone__body">
      <p className="phone__role">
        <span aria-hidden="true">{demo.preview.roleStrip.salao.icon}</span>
        {demo.preview.roleStrip.salao.text}
      </p>

      <div className="phone__section-title">
        <span>{demo.preview.roomTitle}</span>
        <span className="phone__section-count">
          {tables.length} {tables.length === 1 ? 'mesa' : 'mesas'}
        </span>
      </div>

      {tables.length === 0 ? (
        <div className="phone__empty">
          <span>🪑</span>
          <p>{demo.preview.emptyRoom}</p>
        </div>
      ) : (
        <>
          <div className="phone__legend">
            {demo.preview.legend.map((item) => (
              <span key={item.status} className={`phone__legend-item is-${item.status}`}>
                {item.label}
              </span>
            ))}
          </div>

          <div className="phone__tables">
            {tables.map((table) => (
              <button
                type="button"
                key={table.id}
                className={`phone__table is-${table.status} ${interactive ? '' : 'is-static'}`}
                onClick={() => onOpenTable(table)}
                aria-label={`Mesa ${table.label}, ${table.status}`}
              >
                <strong>{table.label}</strong>
                <span>{table.seats} lug.</span>
                {tableTotal(table) > 0 && <em>{brl(tableTotal(table))}</em>}
              </button>
            ))}
          </div>

          {flash && <p className="phone__flash">{flash}</p>}
          {interactive && !hasOpenTable && <p className="phone__hint">{demo.tables.testHint}</p>}
        </>
      )}
    </div>
  );
}

