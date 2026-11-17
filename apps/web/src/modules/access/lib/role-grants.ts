import {
  PERMISSION_MODULES,
  PermissionScope,
  isRowScoped,
  permissionsByModule,
  type PermissionKey,
  type PermissionModule,
  type PermissionScope as Scope,
  type RoleGrant,
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
export function setModule(map: GrantMap, module: PermissionModule, on: boolean): GrantMap {
  let next = map;
  for (const key of permissionsByModule()[module]) next = toggle(next, key, on);
  return next;
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
