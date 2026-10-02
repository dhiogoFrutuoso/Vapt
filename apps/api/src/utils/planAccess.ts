/** Pure policy shared by the API and web UI. Unknown plans fail closed. */
export const AREAS = ['cliente', 'recepcao', 'salao', 'cozinha', 'caixa', 'entregador', 'administracao'] as const;
export function planAccess(plan: unknown) {
  const value = String(plan ?? 'TESTE_COMPLETO'); // legacy records predate plan types
  const valid = /^(TESTE|OFICIAL)_(DELIVERY|SALAO|COMPLETO)$/.test(value);
  const delivery = valid && !value.endsWith('_SALAO');
  const dining = valid && !value.endsWith('_DELIVERY');
  const tabs = valid ? AREAS.filter(tab =>
    tab === 'cliente' || tab === 'entregador' ? delivery : tab === 'salao' || tab === 'caixa' ? dining : true) : [];
  return { delivery, dining, cash: dining, kitchen: valid, official: valid && value.startsWith('OFICIAL_'), tabs };
}
export function effectivePermissions(plan: unknown, permissions: readonly string[] = []) {
  const { tabs } = planAccess(plan);
  return tabs.filter(tab => permissions.includes('administracao') || permissions.includes(tab));
}
/** Preserve the admin role for installed clients: removing it also removes
 * dispatch/edit controls. Modern clients intersect it with allowedTabs; the
 * API enforces the plan on every command, including for legacy clients. */
export function legacyPermissions(plan: unknown, permissions: readonly string[] = []) {
  return effectivePermissions(plan, permissions);
}
export function roleAllowed(plan: unknown, permissions: readonly string[]) {
  return permissions.length > 0 && permissions.every(p => planAccess(plan).tabs.some(tab => tab === p));
}
export function rolePermissions(plan: unknown, permissions: readonly string[] = []) {
  return permissions.filter(permission => planAccess(plan).tabs.some(tab => tab === permission));
}
export function commandAllowed(plan: unknown, command: { tipo: string; alvo?: string; isDelivery?: boolean; comandaId?: string }) {
  const access = planAccess(plan);
  if (command.tipo.startsWith('mesa.') || command.alvo === 'mesa') return access.dining;
  if (command.tipo.startsWith('caixa.') || command.tipo.startsWith('fiado.')) return access.cash;
  if (command.tipo.startsWith('pedido.')) return access.delivery;
  if (command.tipo.startsWith('cozinha.')) return access.kitchen &&
    (!command.comandaId?.startsWith('k-mesa-') || access.dining) &&
    (!command.comandaId?.startsWith('k-delivery-') || access.delivery);
  if (command.tipo.startsWith('retirada.') || command.tipo.startsWith('comanda.')) return access.kitchen;
  return false;
}
