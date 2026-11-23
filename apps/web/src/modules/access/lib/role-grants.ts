import {
  PERMISSION_MODULES,
  PermissionScope,
  SYSTEM_ADMIN_ROLE,
  isRowScoped,
  permissionsByModule,
  type PermissionKey,
  type PermissionModule,
  type PermissionScope as Scope,
  type Role,
  type RoleGrant,
  type SessionUser,
} from '@school-erp/shared';

/*
 * The role page's state: which permissions are on, each with its scope. Pure, so the counts the
 * page shows ("1 unsaved change", "5 of 24") are tested without rendering.
 */

/** Permission → scope for every permission that is on. Off = absent. */
export type GrantMap = Partial<Record<PermissionKey, Scope>>;

export function toGrantMap(grants: readonly RoleGrant[]): GrantMap {
  return Object.fromEntries(grants.map((g) => [g.key, g.scope])) as GrantMap;
}

/** The map as the API's list, in registry order (the order the page shows). */
export function toGrants(map: GrantMap): RoleGrant[] {
  return Object.values(permissionsByModule())
    .flat()
    .flatMap((key) => {
      const scope = map[key];
      return scope ? [{ key, scope }] : [];
    });
}

/** Turns a permission on (with `all`, the default) or off. */
export function toggle(map: GrantMap, key: PermissionKey, on: boolean): GrantMap {
  const next = { ...map };
  if (on) next[key] = next[key] ?? PermissionScope.ALL;
  else delete next[key];
  return next;
}

/** Sets the scope of a permission that is on; whole-school permissions stay `all`. */
export function setScope(map: GrantMap, key: PermissionKey, scope: Scope): GrantMap {
  if (!map[key]) return map;
  return { ...map, [key]: isRowScoped(key) ? scope : PermissionScope.ALL };
}

/** Every permission of a module on (keeping scopes already chosen) or off. */
export function setModule(
  map: GrantMap,
  module: PermissionModule,
  on: boolean,
  canGive: (key: PermissionKey) => boolean = () => true,
): GrantMap {
  let next = map;
  // Turning a module on gives only what the user may give (H2); turning it off takes everything off.
  for (const key of permissionsByModule()[module]) if (!on || canGive(key)) next = toggle(next, key, on);
  return next;
}

/**
 * What the signed-in user may give (security review H1/H2), as far as the screen knows: a System
 * admin anything; anyone else only permissions they hold, never the System admin role. Scopes the
 * screen doesn't know — the API still refuses one wider than theirs (`GRANT_EXCEEDS_OWN`).
 */
export interface GiveCeiling {
  isSystemAdmin: boolean;
  canGive: (key: PermissionKey) => boolean;
  canGiveRole: (role: Pick<Role, 'key' | 'permissions'>) => boolean;
}

export function giveCeiling(user: Pick<SessionUser, 'roles' | 'permissions'> | null): GiveCeiling {
  const isSystemAdmin = Boolean(user?.roles.some((r) => r.key === SYSTEM_ADMIN_ROLE));
  const held = new Set<PermissionKey>(user?.permissions ?? []);
  const canGive = (key: PermissionKey) => isSystemAdmin || held.has(key);
  return {
    isSystemAdmin,
    canGive,
    canGiveRole: (role) =>
      isSystemAdmin || (role.key !== SYSTEM_ADMIN_ROLE && role.permissions.every((g) => canGive(g.key))),
  };
}

/** How many permissions differ from `saved` — switched, or the same switch with another scope. */
export function changedCount(saved: GrantMap, current: GrantMap): number {
  const keys = new Set([...Object.keys(saved), ...Object.keys(current)] as PermissionKey[]);
  let n = 0;
  for (const key of keys) if (saved[key] !== current[key]) n += 1;
  return n;
}

/** Whether `key` differs from `saved` (its row is highlighted). */
export function isChanged(saved: GrantMap, current: GrantMap, key: PermissionKey): boolean {
  return saved[key] !== current[key];
}

/** Each module with its permissions, and how many of them are on. */
export function moduleGroups(map: GrantMap): { module: PermissionModule; keys: PermissionKey[]; on: number }[] {
  const byModule = permissionsByModule();
  return PERMISSION_MODULES.map((module) => {
    const keys = byModule[module];
    return { module, keys, on: keys.filter((k) => map[k]).length };
  });
}
