/** Calendar dates in the restaurant's billing timezone; never add 30 days. */
export function billingToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function dateOnly(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}
export function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number(value.slice(0, 4)) >= 2000 &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function nextBillingDate(paymentDate: string, currentEnd?: string | Date | null, anchor?: number | null) {
  if (!validDate(paymentDate)) throw new Error('Data de pagamento inválida.');
  const end = currentEnd ? billingDateOf(currentEnd) : '';
  const early = validDate(end) && paymentDate <= end;
  const base = early ? end : paymentDate;
  const day = early ? anchor || Number(end.slice(8)) : Number(paymentDate.slice(8));
  const [year, month] = base.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const next = new Date(Date.UTC(year, month, Math.min(day, lastDay))).toISOString().slice(0, 10);
  return { endDate: next, billingDay: day, renewedFrom: base };
}
/** Inclusive through the entire due date in São Paulo (UTC-3). */
export function billingEndOfDay(day: string): Date {
  if (!validDate(day)) throw new Error('Data de vencimento inválida.');
  return new Date(`${day}T23:59:59.999-03:00`);
}
export function billingDateOf(value: string | Date): string {
  // Old records used midnight UTC. Keep their stored calendar date.
  const iso = new Date(value).toISOString();
  return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : billingToday(new Date(value));
}
