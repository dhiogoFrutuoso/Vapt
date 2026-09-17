import { useEffect, useMemo, useState } from 'react';
import {
  KITCHEN_FLOW,
  KITCHEN_LABEL,
  NO_STATION,
  type ComboPart,
  type KitchenStatus,
  type KitchenTicket,
  type OrderItem,
  type OrderSource,
} from './types';
import { Printer } from 'lucide-react';
import { createPortal } from 'react-dom';
import { PrintTicket } from './PrintTicket';
import { printReceipt } from '../../lib/printReceipt';
import { useConfirm } from '../ConfirmModal';
import toast from 'react-hot-toast';

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
  storeName?: string;
};

/** Linha simples: um produto avulso da comanda. */
type SimpleLine = {
  key: string;
  name: string;
  quantity: number;
  isPromo?: boolean;
};

/**
 * Bloco de um combo. `parts` já vem filtrado pela praça ativa — em "Todos"
 * traz o combo inteiro, num saguão específico traz só o que aquela praça faz.
 */
type ComboBlock = {
  key: string;
  name: string;
  parts: ComboPart[];
  /** Praças que o combo toca. Define o status agregado e o que o rodapé move. */
  stations: string[];
  status: KitchenStatus | 'parcial';
};

type StationBlock = {
  station: string;
  status: KitchenStatus;
  lines: SimpleLine[];
};

type TicketRender = {
  ticket: KitchenTicket;
  stationBlocks: StationBlock[];
  combos: ComboBlock[];
  /** União de todas as praças do card: e o alcance dos botões do rodapé. */
  stations: string[];
};

function normalizeStation(value?: string): string {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : NO_STATION;
}

/** Um item é combo quando traz peças resolvidas dentro dele. */
function partsOf(item: OrderItem): ComboPart[] | null {
  return item.components && item.components.length > 0 ? item.components : null;
}

/** Ordena praças pela sequência que o dono cadastrou; desconhecidas vão ao fim. */
function orderStations(names: Iterable<string>, stations: string[]): string[] {
  const set = new Set(names);
  const ordered = [...stations, NO_STATION].filter((name) => set.has(name));
  for (const name of set) {
    if (!ordered.includes(name)) ordered.push(name);
  }
  return ordered;
}

/**
 * Monta o que o card mostra, já respeitando o filtro de praça.
 *
 * Produto avulso -> entra no bloco do próprio saguão.
 * Combo          -> não tem saguão próprio; quem roteia são as peças. Em
 *                   "Todos" ele aparece inteiro; filtrado, só com as peças
 *                   daquela praça, mantendo o nome do combo como contexto.
 */
function buildTicket(
  ticket: KitchenTicket,
  stations: string[],
  activeStation: string,
  statusOf: Props['statusOf']
): TicketRender | null {
  const isAll = activeStation === 'todos';

  const buckets = new Map<string, SimpleLine[]>();
  const combos: ComboBlock[] = [];
  const touched = new Set<string>();

  ticket.items.forEach((item, index) => {
    const parts = partsOf(item);

    if (!parts) {
      const station = normalizeStation(item.station);
      touched.add(station);
      if (!isAll && station !== activeStation) return;

      const line: SimpleLine = {
        key: `${ticket.id}-i${index}`,
        name: item.name,
        quantity: item.quantity ?? 1,
        isPromo: item.isPromo,
      };
      const bucket = buckets.get(station);
      if (bucket) bucket.push(line);
      else buckets.set(station, [line]);
      return;
    }

    const comboStations = new Set(parts.map((part) => normalizeStation(part.station)));
    for (const station of comboStations) touched.add(station);

    // Filtrado: o combo só aparece se alguma peça for daquela praça.
    const visibleParts = isAll
      ? parts
      : parts.filter((part) => normalizeStation(part.station) === activeStation);
    if (visibleParts.length === 0) return;

    const list = orderStations(comboStations, stations);
    const statuses = list.map((station) => statusOf(ticket.id, station));
    const uniform = statuses.every((value) => value === statuses[0]);

    combos.push({
      key: `${ticket.id}-c${index}`,
      name: item.name,
      parts: visibleParts,
      stations: list,
      status: uniform ? statuses[0] : 'parcial',
    });
  });

  if (buckets.size === 0 && combos.length === 0) return null;

  const stationBlocks = orderStations(buckets.keys(), stations).map((station) => ({
    station,
    status: statusOf(ticket.id, station),
    lines: buckets.get(station) ?? [],
  }));

  return {
    ticket,
    stationBlocks,
    combos,
    stations: orderStations(touched, stations),
  };
}

function PartLine({ part, showStation }: { part: ComboPart; showStation: boolean }) {
  return (
    <li className="kds-item is-part">
      <span className="kds-item__qty">{part.quantity}x</span>
      <span className="kds-item__name">{part.name}</span>
      {showStation && <span className="kds-item__station">{normalizeStation(part.station)}</span>}
    </li>
  );
}

function TicketCard({
  render,
  showStationLabels,
  onSetStatus,
  onPrint,
}: {
  render: TicketRender;
  showStationLabels: boolean;
  onSetStatus: Props['onSetStatus'];
  onPrint: (ticket: KitchenTicket) => void;
}) {
  const { ticket, stationBlocks, combos, stations } = render;

  const statuses = [
    ...stationBlocks.map((block) => block.status),
    ...combos.map((combo) => combo.status),
  ];
  const current = statuses.every((value) => value === statuses[0]) ? statuses[0] : undefined;
  const done = statuses.length > 0 && statuses.every((value) => value === 'pronto');

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
        {stationBlocks.map((block) => (
          <div key={block.station} className="kds-group">
            {showStationLabels && (
              <div className="kds-group__head">
                <span className="kds-group__name">{block.station}</span>
                <span className={`kds-group__status is-${block.status}`}>{KITCHEN_LABEL[block.status]}</span>
              </div>
            )}
            <ul className="kds-items">
              {block.lines.map((line) => (
                <li key={line.key} className={`kds-item ${line.isPromo ? 'is-promo' : ''}`}>
                  <span className="kds-item__qty">{line.quantity}x</span>
                  <span className="kds-item__name">{line.name}</span>
                  {line.isPromo && (
                    <span className="kds-item__promo">
                      <span aria-hidden="true">★</span> Promo
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}

        {combos.map((combo) => (
          <div key={combo.key} className="kds-combo">
            <div className="kds-combo__head">
              <span className="kds-combo__name">
                <span aria-hidden="true">📦</span> {combo.name}
              </span>
              <span className={`kds-group__status is-${combo.status}`}>
                {combo.status === 'parcial' ? 'Parcial' : KITCHEN_LABEL[combo.status]}
              </span>
            </div>
            <ul className="kds-items">
              {combo.parts.map((part, index) => (
                <PartLine key={`${combo.key}-p${index}`} part={part} showStation={showStationLabels} />
              ))}
            </ul>
          </div>
        ))}
      </div>

      <button type="button" className="kds-card__print" onClick={() => onPrint(ticket)}>
        <Printer size={16} aria-hidden="true" /> Imprimir {ticket.label}
      </button>

      <footer className="kds-card__foot">
        {KITCHEN_FLOW.map((status) => (
          <button
            key={status}
            type="button"
            className={`kds-btn is-${status} ${current === status ? 'is-active' : ''}`}
            onClick={() => onSetStatus(ticket.id, stations, status)}
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
 * O cozinheiro escolhe a praça no topo e passa a ver apenas o que aquela
 * praça monta, comanda por comanda — combos inclusive, desmembrados peça a
 * peça. Em "Todos" as comandas aparecem inteiras.
 */
export function KitchenView({
  tickets,
  stations,
  activeStation,
  onChangeStation,
  statusOf,
  onSetStatus,
  storeName = 'Vapt',
}: Props) {
  const { confirm, ConfirmElement } = useConfirm();
  const [printing, setPrinting] = useState<{ ticket: KitchenTicket; station?: string } | null>(null);
  useEffect(() => {
    if (!printing) return;
    const id = window.setTimeout(() => {
      void printReceipt().catch(() => toast.error('Não foi possível imprimir a comanda.'));
    }, 50);
    return () => window.clearTimeout(id);
  }, [printing]);
  const isAll = activeStation === 'todos';

  /** Praças com item na fila entram nos chips, cadastradas ou não. */
  const chips = useMemo(() => {
    const live = new Set<string>();

    for (const ticket of tickets) {
      for (const item of ticket.items) {
        const parts = partsOf(item);
        if (parts) {
          for (const part of parts) live.add(normalizeStation(part.station));
        } else {
          live.add(normalizeStation(item.station));
        }
      }
    }

    return orderStations(live, stations);
  }, [tickets, stations]);

  const visible = useMemo(() => {
    return tickets
      .map((ticket) => buildTicket(ticket, stations, activeStation, statusOf))
      .filter((render): render is TicketRender => render !== null)
      .sort((a, b) => {
        const aDone = a.stations.every((s) => statusOf(a.ticket.id, s) === 'pronto') ? 1 : 0;
        const bDone = b.stations.every((s) => statusOf(b.ticket.id, s) === 'pronto') ? 1 : 0;
        // Pronto desce; o resto sobe pela ordem de chegada.
        if (aDone !== bDone) return aDone - bDone;
        return a.ticket.createdAt - b.ticket.createdAt;
      });
  }, [tickets, stations, activeStation, statusOf]);

  const pending = visible.filter((render) =>
    render.stations.some((station) => statusOf(render.ticket.id, station) !== 'pronto')
  ).length;

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
          {visible.map((render) => (
            <TicketCard
              key={render.ticket.id}
              render={render}
              showStationLabels={isAll}
              onSetStatus={onSetStatus}
              onPrint={(ticket) => confirm({ title: 'Imprimir comanda?', message: `${ticket.label} será enviada à impressora conectada.`,
                confirmText: 'Imprimir comanda', cancelText: 'Voltar', isDestructive: false,
                onConfirm: () => setPrinting({ ticket, station: isAll ? undefined : activeStation }), })}
            />
          ))}
        </ul>
      )}
      {printing && (
        createPortal(<PrintTicket
          storeName={storeName}
          label={printing.ticket.label}
          origin={printing.ticket.origin}
          customerName={printing.ticket.customerName}
          items={printing.ticket.items}
          width={80}
          station={printing.station}
        />, document.body)
      )}
      {ConfirmElement}
    </div>
  );
}
