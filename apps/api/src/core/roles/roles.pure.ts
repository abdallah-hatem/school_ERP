import {
  PERMISSION_KEYS,
  PermissionScope,
  SYSTEM_ADMIN_ROLE,
  isPermissionKey,
  isPermissionScope,
  type PermissionKey,
  type Role,
  type RoleGrant,
} from '@school-erp/shared';

/*
 * Role rules with no database (core/roles). Pure: values in, values out.
 */

/** What the API shows of a role's stored grants. */
export interface StoredRole {
  id: string;
  key: string;
  nameEn: string;
  nameAr: string;
  builtIn: boolean;
  permissions: { permissionKey: string; scope: string }[];
  userCount: number;
}

/**
 * A role as the API returns it: permissions in registry order, unknown stored keys left out
 * (edge case 8). The System admin shows every key with scope `all` — what it really holds.
 */
export function toRole(row: StoredRole): Role {
  const stored = new Map(row.permissions.map((p) => [p.permissionKey, p.scope]));
  const permissions: RoleGrant[] = [];
  for (const key of PERMISSION_KEYS) {
    if (row.key === SYSTEM_ADMIN_ROLE) {
      permissions.push({ key, scope: PermissionScope.ALL });
      continue;
    }
    const scope = stored.get(key);
    if (scope && isPermissionScope(scope)) permissions.push({ key, scope });
  }
  return {
    id: row.id,
    key: row.key,
    nameEn: row.nameEn,
    nameAr: row.nameAr,
    builtIn: row.builtIn,
    permissions,
    userCount: row.userCount,
  };
}

/** The snapshot an audit entry compares: names and `{ key: scope }` (D7: only what changed). */
export function roleSnapshot(role: Pick<Role, 'key' | 'nameEn' | 'nameAr' | 'permissions'>) {
  return {
    key: role.key,
    nameEn: role.nameEn,
    nameAr: role.nameAr,
    permissions: Object.fromEntries(role.permissions.map((p) => [p.key, p.scope])),
  };
}

/** A duplicated key in a grant list (the first one), or null. Keys are validated by the DTO. */
export function duplicateKey(grants: readonly RoleGrant[]): PermissionKey | null {
  const seen = new Set<string>();
  for (const g of grants) {
    if (seen.has(g.key)) return g.key;
    seen.add(g.key);
  }
  return null;
}

/** Grants valid for storage (registry keys, known scopes) — the DTO already refused the rest. */
export function storedGrants(grants: readonly RoleGrant[]) {
  return grants
    .filter((g) => isPermissionKey(g.key) && isPermissionScope(g.scope))
    .map((g) => ({ permissionKey: g.key, scope: g.scope }));
}
