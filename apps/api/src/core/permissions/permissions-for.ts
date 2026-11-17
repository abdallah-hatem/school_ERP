import { PERMISSION_KEYS, UserRole, type AuthUser, type PermissionKey } from '@school-erp/shared';

/**
 * The permission keys a user holds. P1: the HR admin holds every key and any other role none, so
 * nothing changes for users. P2 replaces this with roles as data (the union of the user's roles'
 * permissions) — the guard and `/auth/me` call only this.
 */
export function permissionsFor(user: Pick<AuthUser, 'role'>): readonly PermissionKey[] {
  return user.role === UserRole.HR_ADMIN ? PERMISSION_KEYS : [];
}
