export { billingToday, billingDateOf, nextBillingDate, validDate } from '../../../api/src/utils/subscriptionDates';
import { billingToday, billingDateOf } from '../../../api/src/utils/subscriptionDates';

export const displayBillingDate = (day?: string | null) => day ? day.split('-').reverse().join('/') : 'Não definido';
export function subscriptionDue(user: { plan?: string | null; planEndDate?: string | null }, today = billingToday()) {
  if (!user.plan || !user.planEndDate) return { days: null, label: user.plan ? 'Vencimento não definido' : 'Sem assinatura' };
  const days = Math.round((Date.parse(billingDateOf(user.planEndDate)) - Date.parse(today)) / 86400000);
  return { days, label: days < 0 ? `Venceu há ${-days} dia(s)` : days === 0 ? 'Vence hoje' : `Vence em ${days} dia(s)` };
}
