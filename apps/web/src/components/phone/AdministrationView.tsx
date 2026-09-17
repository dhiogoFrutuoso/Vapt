import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  Banknote,
  Bike,
  CalendarRange,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  LoaderCircle,
  ListFilter,
  Pencil,
  Printer,
  ReceiptText,
  RotateCcw,
  Search,
  ShieldCheck,
  TrendingDown,
  Users,
  X,
} from 'lucide-react';
import { brl } from '../../lib/format';
import { deviceApi } from '../../mobile/deviceApi';
import type { CashEntry, PaymentMethod } from './types';
import type { EstadoOperacao } from '../../mobile/useOperation';
import { getSavedPrinter, listPrinters, printerPlatform, printReceipt, savePrinter, type PrinterDevice } from '../../lib/printer';
import { PrintTicket } from './PrintTicket';
import { useConfirm } from '../ConfirmModal';

type TeamMember = {
  id: string;
  name: string;
  roleId?: string;
  roleName: string;
  permissions: string[];
  isDeliveryman: boolean;
  blocked?: boolean;
};

type TeamRole = { id: string; name: string; permissions: string[] };
type DeviceTeam = { employees: TeamMember[]; roles: TeamRole[] };

type Props = {
  estado: EstadoOperacao;
  equipe: TeamMember[];
  currentEmployeeId?: string;
  currentEmployeeName?: string;
  storeName?: string;
  storePhone?: string;
  onTeamChanged?: () => void | Promise<void>;
};

type Panel = 'pedidos' | 'receita' | 'fiado' | 'saidas' | 'fechamentos' | 'equipe' | 'auditoria' | 'impressoras' | null;
const moneyKeys = ['dinheiro', 'cartao', 'pix'] as const;
const paymentLabel: Record<PaymentMethod, string> = { dinheiro: 'Dinheiro', cartao: 'Cartão', pix: 'PIX', fiado: 'Fiado' };

function startOfToday(): number {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function entryRevenue(entry: CashEntry): number {
  return entry.orderStatus === 'cancelado' ? 0 : Number(entry.total ?? 0);
}

function dateInput(ms: number): string {
  const value = new Date(ms);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function actionArea(action: string): string {
  return action.split(/[.:]/, 1)[0] || 'outros';
}

function actionLabel(action: string): string {
  const label = action.replace(/[._:]+/g, ' ').trim();
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : 'Evento';
}

const areaLabel: Record<string, string> = {
  caixa: 'Caixa',
  pedido: 'Entregas',
  entrega: 'Entregas',
  fiado: 'Fiado',
  mesa: 'Mesas',
  retirada: 'Retiradas',
  cozinha: 'Cozinha',
  menu: 'Cardápio',
  produto: 'Cardápio',
  outros: 'Outros',
};

const permissionLabel: Record<string, string> = {
  cliente: 'Cliente',
  recepcao: 'Recepção',
  salao: 'Salão',
  cozinha: 'Cozinha',
  caixa: 'Caixa',
  entregador: 'Entregador',
  administracao: 'Administração',
};

function MetricButton({ label, value, hint, Icon, onClick }: {
  label: string;
  value: string;
  hint: string;
  Icon: typeof Banknote;
  onClick: () => void;
}) {
  return (
    <button type="button" className="management-metric" onClick={onClick}>
      <span className="management-metric__icon"><Icon size={18} aria-hidden="true" /></span>
      <strong>{value}</strong>
      <span>{label}</span>
      <small>{hint}</small>
      <ChevronRight size={16} className="management-metric__arrow" aria-hidden="true" />
    </button>
  );
}

export function AdministrationView({ estado, equipe, currentEmployeeId, currentEmployeeName, storeName = 'Vapt', storePhone, onTeamChanged }: Props) {
  const { confirm, ConfirmElement } = useConfirm();
  const [panel, setPanel] = useState<Panel>(null);
  const [closureFrom, setClosureFrom] = useState('');
  const [closureTo, setClosureTo] = useState('');
  const [closureOperator, setClosureOperator] = useState('todos');
  const [closureStatus, setClosureStatus] = useState<'todos' | 'correto' | 'divergente'>('todos');
  const [auditSearch, setAuditSearch] = useState('');
  const [auditFrom, setAuditFrom] = useState('');
  const [auditTo, setAuditTo] = useState('');
  const [auditOperator, setAuditOperator] = useState('todos');
  const [auditAction, setAuditAction] = useState('todos');
  const [auditArea, setAuditArea] = useState('todos');
  const [auditOrder, setAuditOrder] = useState<'recentes' | 'antigos'>('recentes');
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(equipe);
  const [teamRoles, setTeamRoles] = useState<TeamRole[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState('');
  const [selectedTeamMember, setSelectedTeamMember] = useState<TeamMember | null>(null);
  const [teamName, setTeamName] = useState('');
  const [teamRoleId, setTeamRoleId] = useState('');
  const [teamSaving, setTeamSaving] = useState(false);
  const [printers, setPrinters] = useState<PrinterDevice[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState('');
  const [printerLoading, setPrinterLoading] = useState(false);
  const platform = printerPlatform();

  const loadPrinters = useCallback(async () => {
    setPrinterLoading(true);
    try {
      const [devices, saved] = await Promise.all([listPrinters(), getSavedPrinter()]);
      setPrinters(devices);
      setSelectedPrinter(saved || devices.find((item) => item.isDefault)?.name || '');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível consultar as impressoras.');
    } finally {
      setPrinterLoading(false);
    }
  }, []);

  useEffect(() => {
    if (panel === 'impressoras') void loadPrinters();
  }, [loadPrinters, panel]);

  async function selectPrinter(deviceName: string) {
    try {
      await savePrinter(deviceName);
      setSelectedPrinter(deviceName);
      toast.success('Impressora conectada a este dispositivo.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível conectar a impressora.');
    }
  }

  async function testPrinter() {
    try {
      await printReceipt();
      toast.success(platform === 'android' ? 'Impressão enviada ao sistema Android.' : 'Comanda de teste enviada.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível imprimir o teste.');
    }
  }
  const [teamConfirmingRole, setTeamConfirmingRole] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const modalCloseRef = useRef<HTMLButtonElement>(null);
  const auditSearchRef = useRef<HTMLInputElement>(null);
  const teamNameRef = useRef<HTMLInputElement>(null);

  const loadTeam = useCallback(async () => {
    setTeamLoading(true);
    setTeamError('');
    try {
      const data = await deviceApi.get<DeviceTeam>('/device/team');
      setTeamMembers(data.employees);
      setTeamRoles(data.roles);
    } catch (error) {
      setTeamMembers(equipe);
      setTeamError(error instanceof Error ? error.message : 'Não foi possível carregar a equipe.');
    } finally {
      setTeamLoading(false);
    }
  }, [equipe]);

  useEffect(() => {
    if (panel !== 'equipe') {
      setSelectedTeamMember(null);
      return;
    }
    void loadTeam();
  }, [panel, loadTeam]);

  useEffect(() => {
    if (!selectedTeamMember) return;
    setTeamName(selectedTeamMember.name);
    setTeamRoleId(selectedTeamMember.roleId ?? '');
    setTeamConfirmingRole(false);
    const frame = window.requestAnimationFrame(() => teamNameRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [selectedTeamMember]);

  useEffect(() => {
    if (!panel) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = window.requestAnimationFrame(() => {
      if (panel === 'auditoria') auditSearchRef.current?.focus();
      else if (panel === 'equipe' && selectedTeamMember) teamNameRef.current?.focus();
      else modalCloseRef.current?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (selectedTeamMember) {
          setSelectedTeamMember(null);
          return;
        }
        setPanel(null);
        return;
      }
      if (event.key !== 'Tab' || !modalRef.current) return;
      const focusable = Array.from(modalRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [panel, selectedTeamMember]);

  const allEntries = useMemo(() => {
    const unique = new Map<string, CashEntry>();
    for (const entry of [...estado.cashArchive, ...estado.cashEntries]) unique.set(entry.id, entry);
    return [...unique.values()];
  }, [estado.cashArchive, estado.cashEntries]);

  const today = startOfToday();
  const activeOrders = estado.deliveries.filter((order) => order.status !== 'entregue');
  const closedToday = allEntries.filter((entry) => (entry.closedAt ?? entry.createdAt) >= today && entry.paymentStatus === 'concluido');
  const revenueToday = closedToday.reduce((sum, entry) => sum + entryRevenue(entry), 0);
  const fiados = allEntries.filter((entry) => ['open', 'partial'].includes(entry.creditStatus ?? 'none'));
  const saldoFiado = fiados.reduce((sum, entry) => sum + Number(entry.creditOriginalAmount ?? 0) - Number(entry.creditPaid ?? 0), 0);
  const outflows = estado.cashMovements.filter((movement) => movement.type === 'sangria');
  const outflowTotal = outflows.reduce((sum, movement) => sum + Number(movement.amount ?? 0), 0);
  const paymentsToday = closedToday.reduce<Record<PaymentMethod, number>>((totals, entry) => {
    if (entry.orderStatus === 'cancelado') return totals;
    for (const payment of entry.payments) totals[payment.method] += Number(payment.amount ?? 0);
    return totals;
  }, { dinheiro: 0, cartao: 0, pix: 0, fiado: 0 });

  const closureOperators = Array.from(new Set(estado.cashClosures.map((closure) => closure.operatorName || 'Operador'))).sort();
  const filteredClosures = estado.cashClosures.filter((closure) => {
    const day = dateInput(closure.createdAt);
    const hasDifference = moneyKeys.some((key) => Math.abs(Number(closure.difference[key] ?? 0)) >= 0.01);
    if (closureFrom && day < closureFrom) return false;
    if (closureTo && day > closureTo) return false;
    if (closureOperator !== 'todos' && (closure.operatorName || 'Operador') !== closureOperator) return false;
    if (closureStatus === 'correto' && hasDifference) return false;
    if (closureStatus === 'divergente' && !hasDifference) return false;
    return true;
  });

  const auditOperators = useMemo(
    () => Array.from(new Set(estado.auditLog.map((entry) => entry.operatorName || 'Operador'))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [estado.auditLog]
  );
  const auditActions = useMemo(
    () => Array.from(new Set(estado.auditLog.map((entry) => entry.action))).sort((a, b) => actionLabel(a).localeCompare(actionLabel(b), 'pt-BR')),
    [estado.auditLog]
  );
  const auditAreas = useMemo(
    () => Array.from(new Set(estado.auditLog.map((entry) => actionArea(entry.action)))).sort((a, b) => (areaLabel[a] ?? a).localeCompare(areaLabel[b] ?? b, 'pt-BR')),
    [estado.auditLog]
  );
  const filteredAudit = useMemo(() => {
    const term = normalizeText(auditSearch.trim());
    return estado.auditLog
      .filter((entry) => {
        const day = dateInput(entry.createdAt);
        if (auditFrom && day < auditFrom) return false;
        if (auditTo && day > auditTo) return false;
        if (auditOperator !== 'todos' && (entry.operatorName || 'Operador') !== auditOperator) return false;
        if (auditAction !== 'todos' && entry.action !== auditAction) return false;
        if (auditArea !== 'todos' && actionArea(entry.action) !== auditArea) return false;
        if (!term) return true;
        return normalizeText([
          entry.summary,
          entry.operatorName || 'Operador',
          entry.action,
          actionLabel(entry.action),
          entry.targetId || '',
          areaLabel[actionArea(entry.action)] ?? actionArea(entry.action),
        ].join(' ')).includes(term);
      })
      .sort((a, b) => auditOrder === 'recentes' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt);
  }, [estado.auditLog, auditSearch, auditFrom, auditTo, auditOperator, auditAction, auditArea, auditOrder]);
  const hasAuditFilters = Boolean(auditSearch.trim() || auditFrom || auditTo || auditOperator !== 'todos' || auditAction !== 'todos' || auditArea !== 'todos' || auditOrder !== 'recentes');

  function clearAuditFilters() {
    setAuditSearch('');
    setAuditFrom('');
    setAuditTo('');
    setAuditOperator('todos');
    setAuditAction('todos');
    setAuditArea('todos');
    setAuditOrder('recentes');
  }

  async function saveTeamMember(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedTeamMember || teamSaving) return;

    const name = teamName.trim();
    if (name.length < 2) {
      toast.error('Informe um nome com pelo menos 2 caracteres.');
      teamNameRef.current?.focus();
      return;
    }
    if (!teamRoleId) {
      toast.error('Selecione uma tag de função.');
      return;
    }

    const roleChanged = teamRoleId !== selectedTeamMember.roleId;
    if (roleChanged && !teamConfirmingRole) {
      setTeamConfirmingRole(true);
      return;
    }

    setTeamSaving(true);
    try {
      const data = await deviceApi.patch<{ employee: TeamMember }>(
        `/device/team/employees/${selectedTeamMember.id}`,
        { name, roleId: teamRoleId }
      );
      setTeamMembers((current) => current.map((member) => member.id === data.employee.id ? data.employee : member));
      await onTeamChanged?.();
      toast.success('Funcionário atualizado.');
      setSelectedTeamMember(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível atualizar o funcionário.');
    } finally {
      setTeamSaving(false);
    }
  }

  const panelTitle: Record<Exclude<Panel, null>, string> = {
    pedidos: 'Pedidos em andamento',
    receita: 'Receita do dia',
    fiado: 'Fiado em aberto',
    saidas: 'Saídas de dinheiro',
    fechamentos: 'Fechamentos de caixa',
    equipe: 'Equipe ativa',
    auditoria: 'Auditoria da operação',
    impressoras: 'Impressoras e comandas',
  };

  const managementTitle = panel === 'equipe' && selectedTeamMember
    ? 'Editar funcionário'
    : panel ? panelTitle[panel] : '';
  const selectedTeamRole = teamRoles.find((role) => role.id === teamRoleId) ?? null;

  return (
    <div className="phone__body management-page">
      <header className="management-hero">
        <span className="management-hero__icon"><ShieldCheck size={22} aria-hidden="true" /></span>
        <div><p>Gestão financeira</p><h2>Visão do restaurante</h2><small>Indicadores, conferências e trilha de auditoria</small></div>
      </header>

      <section className="management-summary" aria-label="Indicadores financeiros e operacionais">
        <MetricButton label="Receita hoje" value={brl(revenueToday)} hint={`${closedToday.length} venda(s) concluída(s)`} Icon={CircleDollarSign} onClick={() => setPanel('receita')} />
        <MetricButton label="Fiado em aberto" value={brl(saldoFiado)} hint={`${fiados.length} conta(s) pendente(s)`} Icon={Banknote} onClick={() => setPanel('fiado')} />
        <MetricButton label="Saídas no turno" value={brl(outflowTotal)} hint={`${outflows.length} movimentação(ões)`} Icon={TrendingDown} onClick={() => setPanel('saidas')} />
        <MetricButton label="Pedidos em curso" value={String(activeOrders.length)} hint="Fila operacional ativa" Icon={Bike} onClick={() => setPanel('pedidos')} />
      </section>

      <button type="button" className="management-closures-cta" onClick={() => setPanel('fechamentos')}>
        <span><CalendarRange size={20} aria-hidden="true" /></span>
        <span><strong>Ver todos os fechamentos de caixa</strong><small>{estado.cashClosures.length} fechamento(s), com filtros e diferenças</small></span>
        <ChevronRight size={19} aria-hidden="true" />
      </button>

      <section className="management-section">
        <header><div><span>Operação</span><h3>Controle e segurança</h3></div></header>
        <div className="management-wide-grid">
          <button type="button" onClick={() => setPanel('equipe')}><Users size={19} /><span><strong>{equipe.length} pessoas ativas</strong><small>Funções, tags e permissões efetivas</small></span><ChevronRight size={16} /></button>
          <button type="button" onClick={() => setPanel('auditoria')}><ClipboardList size={19} /><span><strong>{estado.auditLog.length} eventos auditados</strong><small>Ações críticas com operador e horário</small></span><ChevronRight size={16} /></button>
          <button type="button" onClick={() => setPanel('impressoras')}><Printer size={19} /><span><strong>Conectar impressoras</strong><small>Configuração guiada e teste de comanda</small></span><ChevronRight size={16} /></button>
        </div>
      </section>

      {estado.cashClosures[0] && (
        <button type="button" className="management-last-close" onClick={() => setPanel('fechamentos')}>
          <span className="management-last-close__title"><ReceiptText size={18} /> Último fechamento</span>
          <strong>{new Date(estado.cashClosures[0].createdAt).toLocaleString('pt-BR')}</strong>
          <small>{estado.cashClosures[0].operatorName || 'Operador'} · toque para conferir valores e diferenças</small>
        </button>
      )}

      {panel && (
        <div className={`management-modal ${panel === 'auditoria' ? 'is-audit' : ''}`} role="dialog" aria-modal="true" aria-labelledby="management-modal-title">
          <div className="management-modal__sheet" ref={modalRef}>
            <header className="management-modal__head">
              <div><span>Gestão</span><h2 id="management-modal-title">{managementTitle}</h2></div>
              <button ref={modalCloseRef} type="button" onClick={() => setPanel(null)} aria-label="Fechar detalhes"><X size={20} aria-hidden="true" /></button>
            </header>

            <div className="management-modal__body">
              {panel === 'receita' && <>
                <div className="management-feature-value"><span>Total recebido hoje</span><strong>{brl(revenueToday)}</strong></div>
                <div className="management-breakdown">{Object.entries(paymentsToday).map(([method, value]) => <div key={method}><span>{paymentLabel[method as PaymentMethod]}</span><strong>{brl(value)}</strong></div>)}</div>
                <ul className="management-detail-list">{closedToday.map((entry) => <li key={entry.id}><span><strong>{entry.label}</strong><small>{entry.customerName} · {entry.orderStatus === 'cancelado' ? 'Cancelada' : 'Concluída'}</small></span><b>{brl(entryRevenue(entry))}</b></li>)}{closedToday.length === 0 && <li className="is-empty">Nenhuma venda concluída hoje.</li>}</ul>
              </>}

              {panel === 'fiado' && <ul className="management-detail-list">{fiados.map((entry) => {
                const balance = Number(entry.creditOriginalAmount ?? 0) - Number(entry.creditPaid ?? 0);
                return <li key={entry.id}><span><strong>{entry.customerName || entry.label}</strong><small>{entry.label} · pago {brl(Number(entry.creditPaid ?? 0))}</small></span><b>{brl(balance)}</b></li>;
              })}{fiados.length === 0 && <li className="is-empty">Nenhum valor fiado em aberto.</li>}</ul>}

              {panel === 'saidas' && <ul className="management-detail-list">{outflows.map((movement) => <li key={movement.id}><span><strong>{movement.reason}</strong><small>{movement.operatorName || 'Operador'} · {new Date(movement.createdAt).toLocaleString('pt-BR')}</small></span><b className="is-negative">− {brl(movement.amount)}</b></li>)}{outflows.length === 0 && <li className="is-empty">Nenhuma saída registrada no turno atual.</li>}</ul>}

              {panel === 'pedidos' && <ul className="management-detail-list">{activeOrders.map((order) => <li key={order.id}><span><strong>Entrega #{order.code}</strong><small>{order.customerName} · {order.status.replace('_', ' ')}</small></span><b>{brl(order.total)}</b></li>)}{activeOrders.length === 0 && <li className="is-empty">Nenhum pedido em andamento.</li>}</ul>}

              {panel === 'equipe' && !selectedTeamMember && <div className="management-team">
                <p className="management-team__intro">Toque em um funcionário para alterar o nome e a tag de acesso. As permissões passam a valer imediatamente.</p>

                {teamLoading && <div className="management-team__state"><LoaderCircle size={24} className="animate-spin" aria-hidden="true" /><span>Carregando equipe...</span></div>}

                {!teamLoading && teamError && <div className="management-team__state is-error"><strong>Não foi possível carregar a gestão da equipe.</strong><span>{teamError}</span><button type="button" onClick={() => void loadTeam()}>Tentar novamente</button></div>}

                {!teamLoading && !teamError && <ul className="management-team__list">
                  {teamMembers.map((member) => <li key={member.id}>
                    <button type="button" onClick={() => setSelectedTeamMember(member)} aria-label={`Editar ${member.name}`}>
                      <span className="management-person"><i>{member.name.slice(0, 1).toUpperCase()}</i><span><strong>{member.name}{member.id === currentEmployeeId && <em>Você</em>}</strong><small>{member.roleName} · {member.permissions.length} permissão(ões){member.blocked ? ' · bloqueado' : ''}</small></span></span>
                      <span className="management-team__edit"><Pencil size={16} aria-hidden="true" /></span>
                    </button>
                  </li>)}
                  {teamMembers.length === 0 && <li className="management-team__state">Nenhum funcionário cadastrado.</li>}
                </ul>}
              </div>}

              {panel === 'equipe' && selectedTeamMember && <form className="management-team-editor" onSubmit={saveTeamMember}>
                <button type="button" className="management-team-editor__back" onClick={() => setSelectedTeamMember(null)}><ArrowLeft size={17} aria-hidden="true" /> Voltar para a equipe</button>

                <div className="management-team-editor__identity">
                  <i>{selectedTeamMember.name.slice(0, 1).toUpperCase()}</i>
                  <span><strong>{selectedTeamMember.name}</strong><small>{selectedTeamMember.roleName}{selectedTeamMember.id === currentEmployeeId ? ' · seu acesso' : ''}</small></span>
                </div>

                <label className="management-team-editor__field">
                  <span>Nome do funcionário</span>
                  <input ref={teamNameRef} value={teamName} maxLength={60} autoComplete="off" onChange={(event) => setTeamName(event.target.value)} />
                </label>

                <fieldset className="management-team-editor__roles">
                  <legend>Tag de função</legend>
                  <div>{teamRoles.map((role) => {
                    const active = teamRoleId === role.id;
                    return <label key={role.id} className={active ? 'is-active' : undefined}>
                      <input type="radio" name="team-role" value={role.id} checked={active} onChange={() => { setTeamRoleId(role.id); setTeamConfirmingRole(false); }} />
                      <span>{role.name}</span>
                    </label>;
                  })}</div>
                </fieldset>

                {selectedTeamRole && <section className="management-team-editor__permissions" aria-label="Permissões da tag selecionada">
                  <span>Permissões incluídas</span>
                  <div>{selectedTeamRole.permissions.map((permission) => <small key={permission}>{permissionLabel[permission] ?? permission}</small>)}</div>
                </section>}

                {teamConfirmingRole && <div className="management-team-editor__warning" role="alert">
                  <strong>Confirmar alteração de função?</strong>
                  <span>{selectedTeamMember.id === currentEmployeeId ? 'Seu acesso será encerrado e você precisará entrar novamente com as novas permissões.' : `Os aparelhos de ${selectedTeamMember.name} serão desconectados para aplicar as novas permissões.`}</span>
                </div>}

                <div className="management-team-editor__actions">
                  <button type="button" onClick={() => setSelectedTeamMember(null)} disabled={teamSaving}>Cancelar</button>
                  <button type="submit" className="is-primary" disabled={teamSaving || teamName.trim().length < 2 || !teamRoleId}>
                    {teamSaving ? <><LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> Salvando...</> : teamConfirmingRole ? 'Confirmar alteração' : 'Salvar alterações'}
                  </button>
                </div>
              </form>}

              {panel === 'impressoras' && <div className="management-printers">
                <section className="management-printers__guide">
                  <span><strong>1</strong><i>Ligue e conecte</i><small>{platform === 'windows' ? 'Conecte por USB, rede ou Bluetooth e confirme que a impressora aparece no Windows.' : platform === 'android' ? 'Pareie a impressora no Bluetooth/Wi‑Fi e instale o serviço de impressão do fabricante, se solicitado.' : 'Adicione a impressora nas configurações do sistema ou do navegador.'}</small></span>
                  <span><strong>2</strong><i>Escolha no Vapt</i><small>{platform === 'windows' ? 'Selecione abaixo a impressora que ficará memorizada neste caixa.' : 'Toque em “Abrir impressão de teste” e escolha a impressora no painel nativo.'}</small></span>
                  <span><strong>3</strong><i>Faça o teste</i><small>Confira largura, corte e legibilidade antes de usar durante o atendimento.</small></span>
                </section>

                {platform === 'windows' && <section className="management-printers__devices">
                  <header><strong>Impressoras encontradas</strong><button type="button" onClick={() => void loadPrinters()} disabled={printerLoading}><RotateCcw size={15} className={printerLoading ? 'animate-spin' : ''} /> Atualizar</button></header>
                  {printerLoading && <p>Procurando impressoras do Windows...</p>}
                  {!printerLoading && printers.map((printer) => <button key={printer.name} type="button" className={selectedPrinter === printer.name ? 'is-selected' : ''} onClick={() => void selectPrinter(printer.name)}>
                    <Printer size={18} aria-hidden="true" /><span><strong>{printer.displayName}</strong><small>{printer.isDefault ? 'Padrão do Windows · ' : ''}{selectedPrinter === printer.name ? 'Conectada ao Vapt' : 'Toque para conectar'}</small></span>{selectedPrinter === printer.name && <em>Conectada</em>}
                  </button>)}
                  {!printerLoading && printers.length === 0 && <p>Nenhuma impressora encontrada. Instale-a no Windows e toque em Atualizar.</p>}
                </section>}

                <button type="button" className="management-printers__test" onClick={() => confirm({ title: 'Imprimir comanda de teste?',
                  message: 'O teste será enviado à impressora selecionada neste dispositivo.', confirmText: 'Imprimir teste',
                  cancelText: 'Voltar', isDestructive: false, onConfirm: () => void testPrinter(), })} disabled={platform === 'windows' && !selectedPrinter}>
                  <Printer size={18} aria-hidden="true" />
                  <span><strong>{platform === 'windows' ? 'Imprimir comanda de teste' : 'Abrir impressão de teste'}</strong><small>{platform === 'android' ? 'O Android abrirá a lista de impressoras e permitirá adicionar uma nova.' : platform === 'web' ? 'O navegador abrirá a janela de impressão.' : 'Será enviada para a impressora conectada.'}</small></span>
                </button>

                <PrintTicket storeName={storeName} storePhone={storePhone} label="Pedido N.: TESTE" origin="retirada" customerName="CLIENTE TESTE" items={[{ name: 'Item de teste', price: 10, quantity: 1 }]} payments={[{ method: 'pix', amount: 10 }]} operatorName={currentEmployeeName} width={80} />
              </div>}

              {panel === 'auditoria' && <div className="management-audit">
                <section className="management-audit__filters" aria-label="Filtros da auditoria">
                  <label className="management-audit__search">
                    <span>Pesquisar em toda a auditoria</span>
                    <div><Search size={18} aria-hidden="true" /><input ref={auditSearchRef} type="search" value={auditSearch} onChange={(event) => setAuditSearch(event.target.value)} placeholder="Pedido, funcionário, ação ou código" /></div>
                  </label>
                  <div className="management-audit__filter-grid">
                    <label><span>Data inicial</span><input type="date" value={auditFrom} max={auditTo || dateInput(Date.now())} onChange={(event) => setAuditFrom(event.target.value)} /></label>
                    <label><span>Data final</span><input type="date" value={auditTo} min={auditFrom || undefined} max={dateInput(Date.now())} onChange={(event) => setAuditTo(event.target.value)} /></label>
                    <label><span>Funcionário</span><select value={auditOperator} onChange={(event) => setAuditOperator(event.target.value)}><option value="todos">Todos</option>{auditOperators.map((operator) => <option key={operator}>{operator}</option>)}</select></label>
                    <label><span>Área</span><select value={auditArea} onChange={(event) => setAuditArea(event.target.value)}><option value="todos">Todas</option>{auditAreas.map((area) => <option key={area} value={area}>{areaLabel[area] ?? actionLabel(area)}</option>)}</select></label>
                    <label><span>Tipo de ação</span><select value={auditAction} onChange={(event) => setAuditAction(event.target.value)}><option value="todos">Todos</option>{auditActions.map((action) => <option key={action} value={action}>{actionLabel(action)}</option>)}</select></label>
                    <label><span>Ordenação</span><select value={auditOrder} onChange={(event) => setAuditOrder(event.target.value as typeof auditOrder)}><option value="recentes">Mais recentes</option><option value="antigos">Mais antigos</option></select></label>
                  </div>
                </section>

                <div className="management-audit__results">
                  <span><ListFilter size={16} aria-hidden="true" /><strong>{filteredAudit.length}</strong> de {estado.auditLog.length} evento(s)</span>
                  {hasAuditFilters && <button type="button" onClick={clearAuditFilters}><RotateCcw size={15} aria-hidden="true" /> Limpar filtros</button>}
                </div>

                <ol className="management-audit__list">
                  {filteredAudit.map((entry) => {
                    const area = actionArea(entry.action);
                    return <li key={entry.id}>
                      <div className="management-audit__event-head">
                        <span className={`management-audit__area is-${area}`}>{areaLabel[area] ?? actionLabel(area)}</span>
                        <time dateTime={new Date(entry.createdAt).toISOString()}>{new Date(entry.createdAt).toLocaleString('pt-BR')}</time>
                      </div>
                      <strong>{entry.summary}</strong>
                      <div className="management-audit__meta">
                        <span>{entry.operatorName || 'Operador'}</span>
                        <span>{actionLabel(entry.action)}</span>
                        {entry.targetId && <span>Ref. {entry.targetId}</span>}
                      </div>
                    </li>;
                  })}
                  {filteredAudit.length === 0 && <li className="management-audit__empty"><ClipboardList size={30} aria-hidden="true" /><strong>Nenhum evento encontrado</strong><span>Revise a pesquisa ou limpe os filtros para ampliar o resultado.</span>{hasAuditFilters && <button type="button" onClick={clearAuditFilters}>Limpar todos os filtros</button>}</li>}
                </ol>
              </div>}

              {panel === 'fechamentos' && <>
                <div className="management-closure-filters">
                  <label><span>De</span><input type="date" value={closureFrom} onChange={(event) => setClosureFrom(event.target.value)} /></label>
                  <label><span>Até</span><input type="date" value={closureTo} onChange={(event) => setClosureTo(event.target.value)} /></label>
                  <label><span>Operador</span><select value={closureOperator} onChange={(event) => setClosureOperator(event.target.value)}><option value="todos">Todos</option>{closureOperators.map((operator) => <option key={operator}>{operator}</option>)}</select></label>
                  <label><span>Conferência</span><select value={closureStatus} onChange={(event) => setClosureStatus(event.target.value as typeof closureStatus)}><option value="todos">Todas</option><option value="correto">Sem diferença</option><option value="divergente">Com diferença</option></select></label>
                </div>
                <p className="management-filter-result">{filteredClosures.length} fechamento(s) encontrado(s)</p>
                <div className="management-closure-list">{filteredClosures.map((closure) => {
                  const hasDifference = moneyKeys.some((key) => Math.abs(Number(closure.difference[key] ?? 0)) >= 0.01);
                  const closureOutflows = (closure.movements ?? []).filter((movement) => movement.type === 'sangria').reduce((sum, movement) => sum + movement.amount, 0);
                  return <article key={closure.id}><header><span><strong>{new Date(closure.createdAt).toLocaleDateString('pt-BR')}</strong><small>{new Date(closure.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · {closure.operatorName || 'Operador'}{closureOutflows > 0 ? ` · saídas ${brl(closureOutflows)}` : ''}</small></span><em className={hasDifference ? 'is-alert' : 'is-ok'}>{hasDifference ? 'Com diferença' : 'Conferido'}</em></header>{moneyKeys.map((key) => <div key={key}><span className="capitalize">{key}</span><small>Esperado {brl(closure.expected[key])}</small><strong className={Math.abs(closure.difference[key]) < 0.01 ? 'is-ok' : 'is-alert'}>{closure.difference[key] > 0 ? '+' : ''}{brl(closure.difference[key])}</strong></div>)}</article>;
                })}{filteredClosures.length === 0 && <div className="phone__empty"><p>Nenhum fechamento corresponde aos filtros.</p></div>}</div>
              </>}
            </div>
          </div>
        </div>
      )}
      {ConfirmElement}
    </div>
  );
}
