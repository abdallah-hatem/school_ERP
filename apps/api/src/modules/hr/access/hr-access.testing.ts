import { NotFoundException } from '@nestjs/common';
import type { PermissionKey } from '@school-erp/shared';
import {
  ALL_EMPLOYEES,
  employeeWhere,
  inScope,
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
): HrAccessService {
  const scopeOf = (key: PermissionKey): EmployeeScope => {
    const s = scopes[key];
    return s === undefined ? ALL_EMPLOYEES : (s ?? { kind: 'none' });
  };
  const fake = {
    scope: (key: PermissionKey) => Promise.resolve(scopeOf(key)),
    holds: (key: PermissionKey) => Promise.resolve(scopes[key] !== null),
    where: (key: PermissionKey) => Promise.resolve(employeeWhere(scopeOf(key))),
    salaryScope: () => Promise.resolve(scopeOf('hr.employees.view_salary')),
    assertInScope: (key: PermissionKey, employee: ScopedEmployee | null) => {
      if (!employee || !inScope(scopeOf(key), employee)) {
        return Promise.reject(new NotFoundException());
      }
      return Promise.resolve();
    },
  };
  return fake as unknown as HrAccessService;
}
