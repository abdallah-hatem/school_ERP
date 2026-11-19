import type { PermissionKey, SessionUser } from '@school-erp/shared';
import { can } from '@/core/auth';

/**
 * The view permission each tile needs (R6): no salary totals or penalty counts without the
 * permission of the screen they come from. Shared by the server screen (welcome or figures), the
 * tiles and their skeleton, so the three never disagree.
 */
export const TILE_PERMISSIONS = {
  headcount: 'hr.employees.view',
  payroll: 'hr.payroll.view',
  penalties: 'hr.penalties.view',
} as const satisfies Record<string, PermissionKey>;

/** Which tiles the viewer gets. The API sends null for a widget the viewer can't see. */
export type DashboardTilesShown = Record<keyof typeof TILE_PERMISSIONS, boolean>;

type Viewer = Pick<SessionUser, 'permissions'> | null | undefined;

export function tilesShown(user: Viewer): DashboardTilesShown {
  return {
    headcount: can(user, TILE_PERMISSIONS.headcount),
    payroll: can(user, TILE_PERMISSIONS.payroll),
    penalties: can(user, TILE_PERMISSIONS.penalties),
  };
}

export const anyTile = (shown: DashboardTilesShown) => shown.headcount || shown.payroll || shown.penalties;

/**
 * Whether Home shows the figures: `hr.dashboard.view` **and** at least one tile. With the first but
 * none of the tiles' permissions the page would be a bare greeting, so Home is the welcome instead.
 */
export function seesDashboardFigures(user: Viewer): boolean {
  return can(user, 'hr.dashboard.view') && anyTile(tilesShown(user));
}
