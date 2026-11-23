import { NotFoundException } from '@nestjs/common';
import type { PermissionKey } from '@school-erp/shared';
import {
  ALL_EMPLOYEES,
  employeeWhere,
  inScope,
  penaltyWhere,
  type EmployeeScope,
  type ScopedEmployee,
} from './employee-scope.pure';
import type { HrAccessService } from './hr-access.service';

/**
 * A stand-in `HrAccessService` for unit tests: each key covers `scopes[key]`, every other key
 * covers everyone (the HR admin of the tests written before P4). `null` means "not held".
 */
export function fakeAccess(
  scopes: Partial<Record<PermissionKey, EmployeeScope | null>> = {},
  actor?: { userId: string; employeeId: string | null },
): HrAccessService {
  const scopeOf = (key: PermissionKey): EmployeeScope => {
    const s = scopes[key];
    return s === undefined ? ALL_EMPLOYEES : (s ?? { kind: 'none' });
  };
  const fake = {
    scope: (key: PermissionKey) => Promise.resolve(scopeOf(key)),
    holds: (key: PermissionKey) => Promise.resolve(scopes[key] !== null),
    where: (key: PermissionKey) => Promise.resolve(employeeWhere(scopeOf(key))),
    penaltyWhere: (key: PermissionKey) => Promise.resolve(penaltyWhere(scopeOf(key))),
    // No signed-in user unless a test sets one (`actor`): the system acts.
    actor: () => Promise.resolve(actor ?? null),
    salaryScope: () => Promise.resolve(scopeOf('hr.employees.view_salary')),
    // The system, or an actor with a linked employee, may act on pay (M2-B); an unlinked one may not.
    assertLinkedForPay: () =>
      actor && !actor.employeeId
        ? Promise.reject(Object.assign(new Error('not linked'), { code: 'ACCOUNT_NOT_LINKED', status: 403 }))
        : Promise.resolve(),
    assertInScope: (key: PermissionKey, employee: ScopedEmployee | null) => {
      if (!employee || !inScope(scopeOf(key), employee)) {
        return Promise.reject(new NotFoundException());
      }
      return Promise.resolve();
    },
  };
  return fake as unknown as HrAccessService;
}
