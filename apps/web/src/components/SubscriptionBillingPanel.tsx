import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Check, Download, Receipt, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, type AuthUser, type SubscriptionEntry } from '../lib/api';
import { billingToday, billingDateOf, displayBillingDate as display, nextBillingDate, validDate } from '../lib/subscriptionDates';

const field = 'mt-2 w-full min-w-0 rounded-xl border border-solid border-black/15 bg-white p-3 text-base outline-none focus:ring-2 focus:ring-brand';
const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-50';
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível concluir. Tente novamente.';

export function SubscriptionBillingPanel({ user, onUpdate }: { user: AuthUser; onUpdate: (user: AuthUser) => void }) {
  const [month, setMonth] = useState('');
  const [entries, setEntries] = useState<SubscriptionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [reload, setReload] = useState(0);
  const [kind, setKind] = useState<'payment' | 'waiver' | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true); setHistoryError('');
    api.subscriptionHistory(user.id, month).then(data => { if (active) setEntries(data.entries); })
      .catch(error => { if (active) setHistoryError(errorMessage(error)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user.id, user.plan, user.planEndDate, month, reload]);
  return <section className="mt-6 rounded-3xl border border-solid border-black/10 bg-white p-5 sm:p-6" aria-labelledby="billing-title">
    <h3 id="billing-title" className="flex items-center gap-2 text-lg font-bold"><Receipt size={20} className="text-brand" /> Faturas e liberações</h3>
    <p className="mt-2 text-sm text-ink-500">Cada mês tem seu próprio registro. Comprovantes ficam restritos à administração.</p>
    <div className="my-5 flex flex-wrap gap-2">
      <button disabled={!user.plan} onClick={() => setKind('payment')} className={`${button} bg-brand text-white`}><Check size={17} /> Pagou fatura do mês</button>
      <button disabled={!user.plan} onClick={() => setKind('waiver')} className={`${button} border border-solid border-black/15 text-ink-900`}>Liberar sem pagamento</button>
    </div>
    {!user.plan && <p className="mb-4 text-sm text-ink-500">Salve um plano acima antes de registrar uma fatura ou liberação.</p>}
    <div className="flex flex-wrap items-end gap-3 border-0 border-t border-solid border-black/10 pt-5">
      <label className="min-w-0 flex-1 text-sm font-semibold">Histórico por mês<input aria-label="Histórico por mês" type="month" className={field} value={month} onChange={e => setMonth(e.target.value)} /></label>
      <button onClick={() => setMonth('')} className={`${button} bg-cream-100`}>Todos os meses</button>
    </div>
    {loading ? <p role="status" className="py-6 text-sm text-ink-500">Carregando histórico...</p> : historyError ? <div role="alert" className="py-4 text-sm text-red-700">{historyError} <button className="underline" onClick={() => setReload(n => n + 1)}>Tentar novamente</button></div> : !entries.length ? <p className="py-6 text-sm text-ink-500">Nenhum registro neste período.</p> :
      <ol className="mb-0 mt-4 list-none space-y-3 p-0">{entries.map(entry => <li key={entry._id} className="rounded-2xl border border-solid border-black/10 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><strong>{entry.month.split('-').reverse().join('/')}</strong><span className={`rounded-full px-3 py-1 text-xs font-bold ${entry.kind === 'payment' ? 'bg-emerald-50 text-emerald-800' : 'bg-cream-100 text-ink-700'}`}>{entry.kind === 'payment' ? 'Pagamento registrado' : entry.kind === 'waiver' ? 'Liberado sem pagamento' : 'Ajuste manual'}</span></div>
        <p className="mt-3 text-sm">{entry.plan} · {entry.kind === 'payment' ? 'Pago em' : 'Data'} {display(entry.paymentDate)}</p>
        <p className="mt-1 text-sm text-ink-500">Vencimento: {display(entry.previousEnd)} → <strong className="text-ink-900">{display(entry.newEnd)}</strong></p>
        {entry.note && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink-500">{entry.note}</p>}
        <p className="mt-2 text-xs text-ink-500">Registrado em {new Date(entry.createdAt).toLocaleString('pt-BR')}</p>
        {entry.receiptName && <button className={`${button} mt-3 bg-cream-100`} onClick={() => void api.downloadReceipt(user.id, entry).catch(error => toast.error(errorMessage(error)))}><Download size={16} /> Baixar comprovante</button>}
      </li>)}</ol>}
    {kind && <InvoiceDialog user={user} kind={kind} onClose={() => setKind(null)} onSuccess={updated => { onUpdate(updated); setReload(n => n + 1); setKind(null); toast.success(kind === 'payment' ? 'Pagamento registrado e vencimento atualizado.' : 'Assinatura liberada sem pagamento.'); }} />}
  </section>;
}

function InvoiceDialog({ user, kind, onClose, onSuccess }: { user: AuthUser; kind: 'payment' | 'waiver'; onClose: () => void; onSuccess: (user: AuthUser) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const [requestId] = useState(() => crypto.randomUUID());
  const [month, setMonth] = useState(billingToday().slice(0, 7));
  const [date, setDate] = useState(billingToday());
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const previousEnd = user.planEndDate ? billingDateOf(user.planEndDate) : '';
  const paymentDate = date || billingToday();
  const next = validDate(paymentDate) ? nextBillingDate(paymentDate, previousEnd, user.planBillingDay).endDate : '';
  useEffect(() => { const node = dialog.current!; node.showModal(); return () => node.close(); }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    if (file && file.size > 3 * 1024 * 1024) { setError('O comprovante deve ter até 3 MB.'); return; }
    submitting.current = true; setBusy(true); setError('');
    const body = new FormData();
    Object.entries({ kind, month, paymentDate, note, requestId, expectedEnd: previousEnd, confirmed: 'true' }).forEach(([key, value]) => body.append(key, value));
    if (file) body.append('receipt', file);
    try { const result = await api.recordInvoice(user.id, body); onSuccess(result.user); }
    catch (err) { setError(errorMessage(err)); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <dialog ref={dialog} aria-labelledby="invoice-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onKeyDown={event => event.stopPropagation()} className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-3xl border-0 bg-white p-5 text-ink-900 shadow-2xl backdrop:bg-black/60 sm:p-7">
    <form onSubmit={submit}>
      <div className="flex items-start justify-between gap-4"><h2 id="invoice-title" className="text-xl font-extrabold">{kind === 'payment' ? 'Confirmar pagamento da fatura' : 'Liberar assinatura sem pagamento'}</h2><button type="button" aria-label="Fechar confirmação" disabled={busy} onClick={onClose} className="rounded-full p-2 hover:bg-cream-100"><X size={20} /></button></div>
      <p className="mt-2 break-words text-sm text-ink-500">{user.displayName || user.email} · {user.plan}</p>
      <fieldset disabled={busy} className="m-0 mt-5 min-w-0 space-y-4 border-0 p-0">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold">Mês da fatura<input type="month" required value={month} onChange={e => setMonth(e.target.value)} className={field} /></label>
          <label className="text-sm font-semibold">{kind === 'payment' ? 'Data de pagamento' : 'Data da liberação'}<input type="date" min="2000-01-01" max={billingToday()} value={date} onChange={e => setDate(e.target.value)} className={field} /><span className="mt-1 block text-xs font-normal text-ink-500">Em branco: data de hoje.</span></label>
        </div>
        <div className="rounded-2xl bg-cream-100 p-4" aria-live="polite"><p className="flex items-center gap-2 text-sm font-semibold"><CalendarDays size={18} /> Novo vencimento</p><p className="mt-2 text-xl font-extrabold text-ink-900">{display(next)}</p><p className="mt-1 text-xs text-ink-500">Anterior: {display(previousEnd)}. {previousEnd && paymentDate <= previousEnd ? 'Antecipação: acrescenta um mês ao vencimento atual.' : 'Assinatura vencida ou nova: um mês a partir da data informada.'}</p></div>
        <label className="block text-sm font-semibold">{kind === 'waiver' ? 'Motivo da liberação (obrigatório)' : 'Observação (opcional)'}<textarea required={kind === 'waiver'} maxLength={1000} value={note} onChange={e => setNote(e.target.value)} className={field} rows={2} /></label>
        {kind === 'payment' && <label className="block text-sm font-semibold">Comprovante (opcional)<input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={e => setFile(e.target.files?.[0] || null)} className={`${field} text-sm`} /><span className="mt-1 block text-xs font-normal text-ink-500">PDF, JPG, PNG ou WEBP · até 3 MB · acesso privado.</span></label>}
      </fieldset>
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <p className="mt-4 text-xs text-ink-500">A confirmação será salva no histórico. Só é permitido um pagamento ou liberação por mês.</p>
      <div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" disabled={busy} onClick={onClose} className={`${button} bg-cream-100`}>Cancelar</button><button type="submit" disabled={busy || !next} className={`${button} bg-brand text-white`}>{busy ? 'Salvando...' : kind === 'payment' ? 'Confirmar pagamento' : 'Confirmar liberação'}</button></div>
    </form>
  </dialog>;
}
