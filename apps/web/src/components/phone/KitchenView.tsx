import { useMemo } from 'react';
import {
  KITCHEN_FLOW,
  KITCHEN_LABEL,
  NO_STATION,
  type KitchenGroup,
  type KitchenStatus,
  type KitchenTicket,
  type OrderItem,
  type OrderSource,
} from './types';

const ORIGIN_LABEL: Record<OrderSource, string> = {
  mesa: 'MESA',
  retirada: 'RETIRADA',
  delivery: 'DELIVERY',
};

type Props = {
  tickets: KitchenTicket[];
  /** Saguões cadastrados pelo dono, na ordem em que ele criou. */
  stations: string[];
  activeStation: string;
  onChangeStation: (station: string) => void;
  /** Estado de produção por (comanda, saguão). */
  statusOf: (ticketId: string, station: string) => KitchenStatus;
  onSetStatus: (ticketId: string, stations: string[], status: KitchenStatus) => void;
};

/** Quantidade some quando é 1: o cozinheiro lê mais rápido sem ruído. */
function quantityLabel(item: OrderItem): string {
  const qty = item.quantity ?? 1;
  return qty > 1 ? `${qty}x` : '1x';
}

function stationOf(item: OrderItem): string {
  const value = (item.station ?? '').trim();
  return value.length > 0 ? value : NO_STATION;
}

/**
 * Quebra a comanda nas praças que a produzem, preservando a ordem em que
 * o dono cadastrou os saguões. É esse agrupamento que faz cada cozinheiro
 * enxergar só a peça que lhe cabe montar.
 */
function groupByStation(
  ticket: KitchenTicket,
  stations: string[],
  statusOf: Props['statusOf']
): KitchenGroup[] {
  const buckets = new Map<string, OrderItem[]>();

  for (const item of ticket.items) {
    const key = stationOf(item);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }

  const ordered = [...stations, NO_STATION].filter((name) => buckets.has(name));
  // Saguão que sumiu do cadastro mas ainda tem item em produção não pode evaporar.
  for (const key of buckets.keys()) {
    if (!ordered.includes(key)) ordered.push(key);
  }

  return ordered.map((station) => ({
    station,
    items: buckets.get(station) ?? [],
    status: statusOf(ticket.id, station),
  }));
}

function ItemLine({ item }: { item: OrderItem }) {
  return (
    <li className={`kds-item ${item.isPromo ? 'is-promo' : ''}`}>
      <span className="kds-item__qty">{quantityLabel(item)}</span>
      <span className="kds-item__name">{item.name}</span>
      {item.isPromo && (
        <span className="kds-item__promo">
          <span aria-hidden="true">★</span> Promo
        </span>
      )}
    </li>
  );
}

function TicketCard({
  ticket,
  groups,
  showStationLabels,
  onSetStatus,
}: {
  ticket: KitchenTicket;
  groups: KitchenGroup[];
  showStationLabels: boolean;
  onSetStatus: Props['onSetStatus'];
}) {
  const stationsInCard = groups.map((group) => group.station);

  /**
   * Com uma praça só, o rodapé comanda aquela praça. Com o filtro em
   * "Todos", ele move a comanda inteira — e cada bloco mostra o próprio
   * estado para o cozinheiro não perder a informação.
   */
  const current = groups.every((group) => group.status === groups[0]?.status)
    ? groups[0]?.status
    : undefined;

  const done = groups.every((group) => group.status === 'pronto');

  return (
    <li className={`kds-card ${done ? 'is-done' : ''}`}>
      <header className="kds-card__head">
        <strong className="kds-card__client">{ticket.customerName}</strong>
        <span className={`kds-card__origin is-${ticket.origin}`}>{ORIGIN_LABEL[ticket.origin]}</span>
      </header>

      <p className="kds-card__meta">
        {ticket.label} ·{' '}
        {new Date(ticket.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
      </p>

      <div className="kds-card__body">
        {groups.map((group) => (
          <div key={group.station} className="kds-group">
            {showStationLabels && (
              <div className="kds-group__head">
                <span className="kds-group__name">{group.station}</span>
                <span className={`kds-group__status is-${group.status}`}>{KITCHEN_LABEL[group.status]}</span>
              </div>
            )}
            <ul className="kds-items">
              {group.items.map((item, index) => (
                <ItemLine key={`${item.name}-${index}`} item={item} />
              ))}
            </ul>
          </div>
        ))}
      </div>

      <footer className="kds-card__foot">
        {KITCHEN_FLOW.map((status) => (
          <button
            key={status}
            type="button"
            className={`kds-btn is-${status} ${current === status ? 'is-active' : ''}`}
            onClick={() => onSetStatus(ticket.id, stationsInCard, status)}
            aria-pressed={current === status}
          >
            {KITCHEN_LABEL[status]}
          </button>
        ))}
      </footer>
    </li>
  );
}

/**
 * KDS — a tela de produção.
 *
 * O cozinheiro escolhe a praça no topo e passa a ver apenas os itens
 * daquela praça, comanda por comanda. Em "Todos" as comandas aparecem
 * inteiras, agrupadas por saguão.
 */
export function KitchenView({
  tickets,
  stations,
  activeStation,
  onChangeStation,
  statusOf,
  onSetStatus,
}: Props) {
  const isAll = activeStation === 'todos';

  /** Saguões que realmente têm item na fila entram nos chips, mesmo sem cadastro. */
  const chips = useMemo(() => {
    const live = new Set<string>();
    for (const ticket of tickets) {
      for (const item of ticket.items) live.add(stationOf(item));
    }

    const ordered = stations.filter((name) => live.has(name));
    for (const name of live) {
      if (!ordered.includes(name)) ordered.push(name);
    }
    return ordered;
  }, [tickets, stations]);

  const visible = useMemo(() => {
    return tickets
      .map((ticket) => {
        const groups = groupByStation(ticket, stations, statusOf);
        const filtered = isAll ? groups : groups.filter((group) => group.station === activeStation);
        return { ticket, groups: filtered };
      })
      .filter((entry) => entry.groups.length > 0)
      .sort((a, b) => {
        const aDone = a.groups.every((g) => g.status === 'pronto') ? 1 : 0;
        const bDone = b.groups.every((g) => g.status === 'pronto') ? 1 : 0;
        // Pronto desce; o resto sobe pela ordem de chegada.
        if (aDone !== bDone) return aDone - bDone;
        return a.ticket.createdAt - b.ticket.createdAt;
      });
  }, [tickets, stations, activeStation, isAll, statusOf]);

  const pending = visible.filter((entry) => entry.groups.some((g) => g.status !== 'pronto')).length;

  return (
    <div className="phone__body">
      <p className="phone__role">
        <span aria-hidden="true">👨‍🍳</span>
        Cozinha · {pending} {pending === 1 ? 'comanda na fila' : 'comandas na fila'}
      </p>

      {/* ------------------------- Filtro de saguões ------------------------- */}
      <div className="kds-stations" role="tablist" aria-label="Saguões da cozinha">
        <button
          type="button"
          role="tab"
          aria-selected={isAll}
          className={`kds-chip ${isAll ? 'is-active' : ''}`}
          onClick={() => onChangeStation('todos')}
        >
          Todos
        </button>
        {chips.map((station) => (
          <button
            key={station}
            type="button"
            role="tab"
            aria-selected={activeStation === station}
            className={`kds-chip ${activeStation === station ? 'is-active' : ''}`}
            onClick={() => onChangeStation(station)}
          >
            {station}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="phone__empty">
          <span>🍳</span>
          <p>
            {tickets.length === 0
              ? 'Nenhuma comanda em produção. Os pedidos do salão, da retirada e do delivery caem aqui.'
              : `Nada para preparar em "${activeStation}" agora.`}
          </p>
        </div>
      ) : (
        <ul className="kds-list">
          {visible.map(({ ticket, groups }) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              groups={groups}
              showStationLabels={isAll}
              onSetStatus={onSetStatus}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
