import { EmployeeStatus, type EmployeeOption, type UserAccount } from '@school-erp/shared';
import type { EmployeeOptionRow, UserAccountRow } from './repositories/users.repository';

/**
 * A user account as the API returns it. Never the password hash (it is not even selected).
 * `lockedUntil`: when their sign-in lock ends, if it is locked now (core/sign-in-limit).
 */
export function toUserAccount(row: UserAccountRow, lockedUntil: Date | null = null): UserAccount {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    isActive: row.isActive,
    mustChangePassword: row.mustChangePassword,
    roles: row.roles.map((r) => r.role),
    employee: row.linkedEmployee,
    createdAt: row.createdAt.toISOString(),
    lastSignInAt: row.lastSignInAt?.toISOString() ?? null,
    passwordChangedAt: row.passwordChangedAt?.toISOString() ?? null,
    lockedUntil: lockedUntil?.toISOString() ?? null,
  };
}

/** An employee in the linked-employee picker (P3), with the account already linked to it. */
export function toEmployeeOption(row: EmployeeOptionRow): EmployeeOption {
  return {
    id: row.id,
    code: row.code,
    nameEn: row.nameEn,
    nameAr: row.nameAr,
    jobTitle: row.jobTitle,
    isActive: row.status === EmployeeStatus.ACTIVE,
    linkedUser: row.linkedUser,
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
