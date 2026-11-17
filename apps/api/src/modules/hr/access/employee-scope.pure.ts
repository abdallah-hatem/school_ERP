import type { Prisma } from '@prisma/client';
import { PermissionScope } from '@school-erp/shared';
import type { UserScope } from '../../../core/permissions';

/*
 * Which employees a scoped permission covers (R5, P4). Core answers "which scope, which linked
 * employee, which stage" (`scopeFor`); HR turns that into rows here. Pure: no database, no request.
 *
 * - `all`       → every employee;
 * - `own_stage` → the employees of the user's linked employee's stage;
 * - `own_team`  → the employees whose direct manager is the user's linked employee;
 * - `self`      → only the linked employee;
 * - not held, or a scope needing a linked employee the user doesn't have → nobody (never everybody).
 */
export type EmployeeScope =
  | { kind: 'all' }
  | { kind: 'none' }
  | { kind: 'stage'; stageId: string }
  | { kind: 'team'; managerId: string }
  | { kind: 'self'; employeeId: string };

export const ALL_EMPLOYEES: EmployeeScope = { kind: 'all' };
export const NO_EMPLOYEES: EmployeeScope = { kind: 'none' };

/** The rows `scopeFor(user, key)` covers. `null` (the key isn't held) covers nobody. */
export function toEmployeeScope(scope: UserScope | null): EmployeeScope {
  if (!scope) return NO_EMPLOYEES;
  switch (scope.scope) {
    case PermissionScope.ALL:
      return ALL_EMPLOYEES;
    case PermissionScope.OWN_STAGE:
      return scope.stageId ? { kind: 'stage', stageId: scope.stageId } : NO_EMPLOYEES;
    case PermissionScope.OWN_TEAM:
      return scope.employeeId ? { kind: 'team', managerId: scope.employeeId } : NO_EMPLOYEES;
    case PermissionScope.SELF:
      return scope.employeeId ? { kind: 'self', employeeId: scope.employeeId } : NO_EMPLOYEES;
    default:
      return NO_EMPLOYEES;
  }
}

/** The Prisma filter on `employees` for a scope (`{}` for all; an impossible id list for none). */
export function employeeWhere(scope: EmployeeScope): Prisma.EmployeeWhereInput {
  switch (scope.kind) {
    case 'all':
      return {};
    case 'stage':
      return { stageId: scope.stageId };
    case 'team':
      return { managerId: scope.managerId };
    case 'self':
      return { id: scope.employeeId };
    case 'none':
      return { id: { in: [] } };
  }
}

/** The fields `inScope` looks at. */
export interface ScopedEmployee {
  id: string;
  stageId: string;
  managerId: string | null;
}

/** Whether one employee is among the rows a scope covers (same rule as `employeeWhere`). */
export function inScope(scope: EmployeeScope, employee: ScopedEmployee): boolean {
  switch (scope.kind) {
    case 'all':
      return true;
    case 'stage':
      return employee.stageId === scope.stageId;
    case 'team':
      return employee.managerId === scope.managerId;
    case 'self':
      return employee.id === scope.employeeId;
    case 'none':
      return false;
  }
}

/**
 * Whether every employee `inner` covers is also covered by `outer` — so a total over `inner`'s
 * rows gives away nothing `outer` hides (payroll totals, R7).
 */
export function covers(outer: EmployeeScope, inner: EmployeeScope): boolean {
  if (outer.kind === 'all' || inner.kind === 'none') return true;
  if (inner.kind === 'all' || outer.kind === 'none') return false;
  if (outer.kind === 'stage' && inner.kind === 'stage') return outer.stageId === inner.stageId;
  if (outer.kind === 'team' && inner.kind === 'team') return outer.managerId === inner.managerId;
  if (outer.kind === 'self' && inner.kind === 'self') return outer.employeeId === inner.employeeId;
  return false;
}

/** Leaves `fields` out of `row` unless `visible` — absent, not null (R7). */
export function withoutFields<T extends object, K extends keyof T>(
  row: T,
  fields: readonly K[],
  visible: boolean,
): T | Omit<T, K> {
  if (visible) return row;
  const copy = { ...row };
  for (const field of fields) delete copy[field];
  return copy;
}
