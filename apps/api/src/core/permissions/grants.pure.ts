import {
  PERMISSION_KEYS,
  PermissionScope,
  SYSTEM_ADMIN_ROLE,
  isPermissionKey,
  isPermissionScope,
  widerScope,
  type HeldGrants,
  type PermissionKey,
  type RoleGrant,
} from '@school-erp/shared';

/*
 * What a user holds, from their roles' rows (R2, R5). Pure: rows in, grants out — no database,
 * no request. `PermissionsService` reads the rows and caches the result per request.
 */

/** One `role_permissions` row of one of the user's roles (or a role with no rows). */
export interface StoredGrant {
  roleKey: string;
  permissionKey: string | null;
  scope: string | null;
}

export interface ResolvedGrants {
  /** Each held key with its widest scope, in registry order. */
  scopes: ReadonlyMap<PermissionKey, PermissionScope>;
  /** Stored keys (or scopes) the code no longer knows — ignored, for the log (edge case 8). */
  unknown: string[];
}

/**
 * The union of the roles' permissions (edge case 2): a key held through several roles gets the
 * widest scope. The System admin holds every registry key with scope `all`, whatever its rows say,
 * so a key added later reaches it without a migration (R8: no lock-out). Unknown keys and scopes
 * are left out and listed in `unknown` (edge case 8).
 */
export function resolveGrants(rows: readonly StoredGrant[]): ResolvedGrants {
  const held = new Map<PermissionKey, PermissionScope>();
  const unknown: string[] = [];
  const isAdmin = rows.some((r) => r.roleKey === SYSTEM_ADMIN_ROLE);

  for (const row of rows) {
    if (row.permissionKey === null) continue;
    if (!isPermissionKey(row.permissionKey) || !isPermissionScope(row.scope)) {
      unknown.push(`${row.roleKey}:${row.permissionKey}:${row.scope ?? ''}`);
      continue;
    }
    const current = held.get(row.permissionKey);
    held.set(row.permissionKey, current ? widerScope(current, row.scope) : row.scope);
  }
  if (isAdmin) for (const key of PERMISSION_KEYS) held.set(key, PermissionScope.ALL);

  const scopes = new Map<PermissionKey, PermissionScope>();
  for (const key of PERMISSION_KEYS) {
    const scope = held.get(key);
    if (scope) scopes.set(key, scope);
  }
  return { scopes, unknown };
}

/**
 * What the user holds for the access ceiling (security review H1/H2, owner 2026-11-23): every
 * known (key, scope) of every role — not only the widest per key, so `own_stage` from one role and
 * `own_team` from another can both be given — and whether they are a System admin (no ceiling).
 */
export function heldGrantsFrom(rows: readonly StoredGrant[]): HeldGrants {
  const seen = new Set<string>();
  const grants: RoleGrant[] = [];
  for (const row of rows) {
    if (!isPermissionKey(row.permissionKey) || !isPermissionScope(row.scope)) continue;
    const id = `${row.permissionKey}:${row.scope}`;
    if (seen.has(id)) continue;
    seen.add(id);
    grants.push({ key: row.permissionKey, scope: row.scope });
  }
  return { isSystemAdmin: rows.some((r) => r.roleKey === SYSTEM_ADMIN_ROLE), grants };
}
