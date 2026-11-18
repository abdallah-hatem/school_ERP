import { notFound } from 'next/navigation';
import { canAny, type PermissionRequirement } from './permissions';
import { getSession } from './session';

/**
 * Server: a page the viewer's roles can't open renders the app's not-found screen (R6) instead of
 * a screen whose every request the API refuses. Several options: any one of them opens it.
 * View only — the API is the protection.
 *
 * @example await requirePermission('hr.payroll.view');
 */
export async function requirePermission(
  ...anyOf: readonly [PermissionRequirement, ...PermissionRequirement[]]
): Promise<void> {
  if (!canAny(await getSession(), anyOf)) notFound();
}
