import { SCREENS, type ScreenAccess, type ScreenId } from '@school-erp/shared';
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

/**
 * Server: `requirePermission` with the screen's own options from `SCREENS` (`@school-erp/shared`),
 * the list the sidebar and the role-access smoke spec read too. Every page under `(dashboard)`
 * calls it (`screen-guards.test.ts` checks).
 *
 * @example await requireScreen('payroll');
 */
export async function requireScreen(id: ScreenId): Promise<void> {
  const { anyOf } = SCREENS[id] as ScreenAccess;
  if (anyOf && !canAny(await getSession(), anyOf)) notFound();
}
