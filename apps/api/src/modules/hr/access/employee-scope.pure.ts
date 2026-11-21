import type { Prisma } from '@prisma/client';
import { PermissionScope } from '@school-erp/shared';
import type { UserScope } from '../../../core/permissions';

/*
 * Which employees a scoped permission covers (R5, P4). Core answers "which scope, which linked
 * employee, which stage" (`scopeFor`); HR turns that into rows here. Pure: no database, no request.
 *
 * - `all`       → every employee;
 * - `own_stage` → the employees in any of the user's linked employee's stages — main or "also
 *                 teaches in" (owner 2026-11-21) — whose main or other stages include one of them;
 * - `own_team`  → the employees whose direct manager is the user's linked employee;
 * - `self`      → only the linked employee;
 * - not held, or a scope needing a linked employee the user doesn't have → nobody (never everybody).
 */
export type EmployeeScope =
  | { kind: 'all' }
  | { kind: 'none' }
  | { kind: 'stage'; stageIds: readonly string[] }
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
      return scope.stageIds.length > 0 ? { kind: 'stage', stageIds: scope.stageIds } : NO_EMPLOYEES;
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
      return {
        OR: [
          { stageId: { in: [...scope.stageIds] } },
          { otherStages: { some: { stageId: { in: [...scope.stageIds] } } } },
        ],
      };
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
  /** "Also teaches in" (owner 2026-11-21). Absent: none. */
  otherStageIds?: readonly string[];
}

/** Whether one employee is among the rows a scope covers (same rule as `employeeWhere`). */
export function inScope(scope: EmployeeScope, employee: ScopedEmployee): boolean {
  switch (scope.kind) {
    case 'all':
      return true;
    case 'stage':
      return (
        scope.stageIds.includes(employee.stageId) ||
        (employee.otherStageIds ?? []).some((id) => scope.stageIds.includes(id))
      );
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
  if (outer.kind === 'stage' && inner.kind === 'stage')
    return inner.stageIds.every((id) => outer.stageIds.includes(id));
  if (outer.kind === 'team' && inner.kind === 'team') return outer.managerId === inner.managerId;
  if (outer.kind === 'self' && inner.kind === 'self') return outer.employeeId === inner.employeeId;
  return false;
}

/** The fields `penaltyInScope` looks at. */
export interface ScopedPenalty {
  /** Where the violation happened. */
  stageId: string;
  employeeId: string;
  employee: { managerId: string | null };
}

/**
 * The Prisma filter on `penalty_records` for a scope (owner 2026-11-21): a stage scope covers the
 * penalties **recorded in** the user's stages — by the penalty's stage, not the employee's, so the
 * head of an employee's other stage never sees (or acts on) a penalty from a stage that isn't
 * theirs. A team or self scope still goes by the employee.
 */
export function penaltyWhere(scope: EmployeeScope): Prisma.PenaltyRecordWhereInput {
  switch (scope.kind) {
    case 'all':
      return {};
    case 'stage':
      return { stageId: { in: [...scope.stageIds] } };
    case 'team':
      return { employee: { managerId: scope.managerId } };
    case 'self':
      return { employeeId: scope.employeeId };
    case 'none':
      return { id: { in: [] } };
  }
}

/** Whether one penalty is among the rows a scope covers (same rule as `penaltyWhere`). */
export function penaltyInScope(scope: EmployeeScope, penalty: ScopedPenalty): boolean {
  switch (scope.kind) {
    case 'all':
      return true;
    case 'stage':
      return scope.stageIds.includes(penalty.stageId);
    case 'team':
      return penalty.employee.managerId === scope.managerId;
    case 'self':
      return penalty.employeeId === scope.employeeId;
    case 'none':
      return false;
  }
}

/**
 * Whether a holder of the stage review with `scope` is a **stage head** of `stageId` (owner
 * 2026-11-21): an `own_stage` grant whose stages include it. A school-wide (`all`) holder — the
 * System admin — may review any penalty but heads no stage, so a stage with only them has "no
 * stage head".
 */
export function headsStage(scope: EmployeeScope, stageId: string): boolean {
  return scope.kind === 'stage' && scope.stageIds.includes(stageId);
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
