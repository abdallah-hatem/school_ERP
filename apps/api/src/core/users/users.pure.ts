import type { UserAccount } from '@school-erp/shared';
import type { UserAccountRow } from './repositories/users.repository';

/** A user account as the API returns it. Never the password hash (it is not even selected). */
export function toUserAccount(row: UserAccountRow): UserAccount {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    isActive: row.isActive,
    mustChangePassword: row.mustChangePassword,
    roles: row.roles.map((r) => r.role),
    employee: row.linkedEmployee,
    createdAt: row.createdAt.toISOString(),
  };
}

/** What an audit entry compares for a user (D7): only these fields, never a password. */
export function accountSnapshot(user: UserAccount) {
  return {
    name: user.name,
    email: user.email,
    status: user.isActive ? 'active' : 'inactive',
    roles: user.roles.map((r) => r.key).sort(),
    employeeId: user.employee?.id ?? null,
  };
}
