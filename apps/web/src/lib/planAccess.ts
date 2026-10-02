// The module is pure: no server dependencies, tokens or environment values.
export { planAccess, effectivePermissions, roleAllowed, rolePermissions } from '../../../api/src/utils/planAccess';
import { effectivePermissions } from '../../../api/src/utils/planAccess';

/** Administrator expands only inside the restaurant plan, never across plans.
 * Wait for the menu before displaying any area, including with a cached session. */
export function visibleAppTabs(plan: unknown, permissions: readonly string[], allowedTabs?: readonly string[]) {
  if (!plan) return [];
  return effectivePermissions(plan, permissions).filter(tab => !allowedTabs || allowedTabs.includes(tab));
}
