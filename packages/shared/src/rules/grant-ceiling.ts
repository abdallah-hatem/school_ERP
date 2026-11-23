import { PermissionScope } from '../permissions';
import type { RoleGrant } from '../types/core';

/*
 * The access ceiling (security review H1/H2, owner 2026-11-23): someone who manages users or roles
 * without being a System admin may give only what they hold themselves — the same permission, with
 * a scope that reaches no further than theirs. One implementation for the API (which refuses) and
 * the screens (which grey out what can't be given).
 */

/**
 * Which scopes each scope covers. A scope is relative to whoever holds it (their own stage, their
 * own team, themselves), so the order is partial, not a line:
 *
 *   all        covers all, own_stage, own_team, self
 *   own_stage  covers own_stage, self
 *   own_team   covers own_team, self
 *   self       covers self
 *
 * `own_stage` and `own_team` don't cover each other: a stage head's stage is not a manager's team,
 * and someone's team can sit across stages. (`widerScope` ranks `own_stage` above `own_team` only to
 * pick one scope when a user holds a key through two roles; that ranking is not a ceiling.)
 */
const COVERED: Readonly<Record<PermissionScope, readonly PermissionScope[]>> = {
  [PermissionScope.ALL]: [
    PermissionScope.ALL,
    PermissionScope.OWN_STAGE,
    PermissionScope.OWN_TEAM,
    PermissionScope.SELF,
  ],
  [PermissionScope.OWN_STAGE]: [PermissionScope.OWN_STAGE, PermissionScope.SELF],
  [PermissionScope.OWN_TEAM]: [PermissionScope.OWN_TEAM, PermissionScope.SELF],
  [PermissionScope.SELF]: [PermissionScope.SELF],
};

/** Whether holding a permission with scope `held` lets someone give it with scope `given`. */
export function scopeCovers(held: PermissionScope, given: PermissionScope): boolean {
  return COVERED[held]?.includes(given) ?? false;
}

/** What an actor holds, for the ceiling: every grant of every role they hold (not only the widest). */
export interface HeldGrants {
  /** A System admin has no ceiling: they hold every permission with scope `all`. */
  isSystemAdmin: boolean;
  grants: readonly RoleGrant[];
}

/** Whether `held` may give `grant`: a System admin always; anyone else holding its key with a covering scope. */
export function grantWithinCeiling(held: HeldGrants, grant: RoleGrant): boolean {
  if (held.isSystemAdmin) return true;
  return held.grants.some((h) => h.key === grant.key && scopeCovers(h.scope, grant.scope));
}

/** The first of `given` that `held` may not give, or null when every one is within the ceiling. */
export function firstGrantOverCeiling(
  held: HeldGrants,
  given: readonly RoleGrant[],
): RoleGrant | null {
  return given.find((g) => !grantWithinCeiling(held, g)) ?? null;
}
