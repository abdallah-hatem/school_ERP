import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuthUser, PermissionKey } from '@school-erp/shared';
import type { Request } from 'express';
import { CLS_REQ, ClsService } from 'nestjs-cls';
import { PermissionsService } from '../../../core/permissions';
import {
  ALL_EMPLOYEES,
  employeeWhere,
  inScope,
  toEmployeeScope,
  type EmployeeScope,
  type ScopedEmployee,
} from './employee-scope.pure';

/** The permission that shows salaries (R7). */
export const VIEW_SALARY: PermissionKey = 'hr.employees.view_salary';

/**
 * Which employees the signed-in user may see or act on, per permission (R5, P4), and whose salary
 * they may see (R7). HR's read paths ask it and pass the answer to their repository queries — the
 * guard only checks that the key is held; this decides the rows.
 *
 * The user comes from the request context (the same request the guard checked). Outside a request
 * (seed, scripts, event listeners) there is no user and every employee is covered — the system
 * itself is acting.
 */
@Injectable()
export class HrAccessService {
  constructor(
    private readonly permissions: PermissionsService,
    private readonly cls: ClsService,
  ) {}

  /** The employees `key` covers for the current user. */
  async scope(key: PermissionKey): Promise<EmployeeScope> {
    const user = this.user();
    if (!user) return ALL_EMPLOYEES;
    return toEmployeeScope(await this.permissions.scopeFor(user, key));
  }

  /** Whether the current user holds `key` at all (any scope). */
  async holds(key: PermissionKey): Promise<boolean> {
    const user = this.user();
    if (!user) return true;
    return (await this.permissions.scopeFor(user, key)) !== null;
  }

  /** `scope(key)` as a Prisma filter on `employees`. */
  async where(key: PermissionKey): Promise<Prisma.EmployeeWhereInput> {
    return employeeWhere(await this.scope(key));
  }

  /** Whose salary the current user may see. */
  salaryScope(): Promise<EmployeeScope> {
    return this.scope(VIEW_SALARY);
  }

  /** Throws 404 — not 403, so existence isn't leaked (edge case 3) — when `employee` is outside. */
  async assertInScope(key: PermissionKey, employee: ScopedEmployee | null): Promise<void> {
    if (!employee || !inScope(await this.scope(key), employee)) throw new NotFoundException();
  }

  private user(): Pick<AuthUser, 'id'> | undefined {
    if (!this.cls.isActive()) return undefined;
    return this.cls.get<(Request & { user?: AuthUser }) | undefined>(CLS_REQ)?.user;
  }
}
