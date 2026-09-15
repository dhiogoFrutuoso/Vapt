import { Banknote, Bike, ClipboardList, ShieldCheck, Users } from 'lucide-react';
import { brl } from '../../lib/format';
import type { EstadoOperacao } from '../../mobile/useOperation';

type TeamMember = {
  id: string;
  name: string;
  roleName: string;
  permissions: string[];
  isDeliveryman: boolean;
};

type Props = {
  estado: EstadoOperacao;
  equipe: TeamMember[];
};

const moneyKeys = ['dinheiro', 'cartao', 'pix'] as const;

export function AdministrationView({ estado, equipe }: Props) {
  const abertas = estado.deliveries.filter((order) => order.status !== 'entregue').length;
  const fiados = [...estado.cashEntries, ...estado.cashArchive].filter((entry) =>
    ['open', 'partial'].includes(entry.creditStatus ?? 'none')
  );
  const saldoFiado = fiados.reduce(
    (sum, entry) => sum + Number(entry.creditOriginalAmount ?? 0) - Number(entry.creditPaid ?? 0),
    0
  );
  const ultimoFechamento = estado.cashClosures[0];

  return (
    <div className="phone__body space-y-5">
      <div className="rounded-3xl bg-slate-950 p-5 text-white shadow-xl shadow-slate-950/10">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#F95D2A]">
            <ShieldCheck size={22} aria-hidden="true" />
          </span>
          <div>
            <p className="m-0 text-xs font-bold uppercase tracking-[0.16em] text-white/60">Gestão</p>
            <h2 className="m-0 text-xl font-extrabold !text-white">Visão operacional</h2>
          </div>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3" aria-label="Indicadores da operação">
        {[
          { label: 'Pedidos em curso', value: String(abertas), Icon: Bike },
          { label: 'Equipe ativa', value: String(equipe.length), Icon: Users },
          { label: 'Fiado em aberto', value: brl(saldoFiado), Icon: Banknote },
          { label: 'Eventos auditados', value: String(estado.auditLog.length), Icon: ClipboardList },
        ].map(({ label, value, Icon }) => (
          <article key={label} className="rounded-2xl border border-solid border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
            <Icon size={18} className="mb-3 text-[#F95D2A]" aria-hidden="true" />
            <strong className="block text-lg text-slate-950 dark:text-white">{value}</strong>
            <span className="text-xs font-semibold text-slate-500">{label}</span>
          </article>
        ))}
      </section>

      <section className="rounded-3xl border border-solid border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
        <h3 className="m-0 text-base font-extrabold text-slate-950 dark:text-white">Equipe e tags</h3>
        <p className="mb-4 mt-1 text-sm text-slate-500">Acesso efetivo de cada pessoa, sem expor códigos de entrada.</p>
        <div className="space-y-3">
          {equipe.map((member) => (
            <div key={member.id} className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-white/5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-orange-100 font-extrabold text-[#F95D2A]">
                {member.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-sm text-slate-900 dark:text-white">{member.name}</strong>
                <small className="text-slate-500">{member.roleName}</small>
              </span>
              {member.isDeliveryman && <Bike size={17} className="text-[#F95D2A]" aria-label="Entregador" />}
            </div>
          ))}
        </div>
      </section>

      {ultimoFechamento && (
        <section className="rounded-3xl border border-solid border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
          <h3 className="m-0 text-base font-extrabold text-slate-950 dark:text-white">Último fechamento cego</h3>
          <p className="mt-1 text-xs text-slate-500">
            {new Date(ultimoFechamento.createdAt).toLocaleString('pt-BR')} · {ultimoFechamento.operatorName || 'Operador'}
          </p>
          <div className="mt-4 space-y-2">
            {moneyKeys.map((key) => (
              <div key={key} className="flex items-center justify-between text-sm">
                <span className="capitalize text-slate-500">{key}</span>
                <strong className={Math.abs(ultimoFechamento.difference[key]) < 0.01 ? 'text-emerald-600' : 'text-red-600'}>
                  Diferença {brl(ultimoFechamento.difference[key])}
                </strong>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-3xl border border-solid border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
        <h3 className="m-0 text-base font-extrabold text-slate-950 dark:text-white">Auditoria recente</h3>
        <ol className="mt-4 space-y-3 p-0">
          {estado.auditLog.slice(0, 30).map((entry) => (
            <li key={entry.id} className="list-none border-0 border-b border-solid border-slate-100 pb-3 text-sm last:border-b-0 dark:border-white/10">
              <strong className="block text-slate-900 dark:text-white">{entry.summary}</strong>
              <span className="text-xs text-slate-500">
                {entry.operatorName || 'Operador'} · {new Date(entry.createdAt).toLocaleString('pt-BR')}
              </span>
            </li>
          ))}
          {estado.auditLog.length === 0 && <li className="list-none text-sm text-slate-500">Nenhuma ação crítica registrada ainda.</li>}
        </ol>
      </section>
    </div>
  );
}
