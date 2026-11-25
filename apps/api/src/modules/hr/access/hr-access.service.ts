import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ErrorCode, type AuthUser, type PermissionKey } from '@school-erp/shared';
import { CodedException } from '../../../common/errors/coded.exception';
import type { Request } from 'express';
import { CLS_REQ, ClsService } from 'nestjs-cls';
import { PermissionsService } from '../../../core/permissions';
import {
  ALL_EMPLOYEES,
  employeeWhere,
  inScope,
  penaltyWhere,
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

  /**
   * The employees `key` covers for `user`, given explicitly — never "everyone" for a missing user,
   * unlike `scope` (a file request names its reader: `HrFileAccess`).
   */
  async scopeOf(user: Pick<AuthUser, 'id'>, key: PermissionKey): Promise<EmployeeScope> {
    return toEmployeeScope(await this.permissions.scopeFor(user, key));
  }

  /** `user`'s linked employee, or null. */
  linkedEmployeeOf(user: Pick<AuthUser, 'id'>): Promise<string | null> {
    return this.permissions.linkedEmployeeOf(user);
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

  /**
   * `scope(key)` as a Prisma filter on `penalty_records` (owner 2026-11-21): a stage scope goes by
   * the penalty's stage, not the employee's.
   */
  async penaltyWhere(key: PermissionKey): Promise<Prisma.PenaltyRecordWhereInput> {
    return penaltyWhere(await this.scope(key));
  }

  /** The signed-in user's id and linked employee (none outside a request: the system acts). */
  async actor(): Promise<{ userId: string; employeeId: string | null } | null> {
    const user = this.user();
    if (!user) return null;
    return { userId: user.id, employeeId: await this.permissions.linkedEmployeeOf(user) };
  }

  /**
   * §6 separation of duties (owner 2026-11-23; third review M2-B): someone who isn't a System admin
   * acts on pay — adjusts or approves payroll, edits a salary — only once their account is linked to
   * their employee record; otherwise "not your own line / pay" can't be checked (403
   * `ACCOUNT_NOT_LINKED`). The system itself (no signed-in user) and a System admin may.
   */
  async assertLinkedForPay(): Promise<void> {
    const user = this.user();
    if (!user) return;
    if (await this.permissions.linkedEmployeeOf(user)) return;
    if ((await this.permissions.heldGrants(user)).isSystemAdmin) return;
    throw new CodedException(HttpStatus.FORBIDDEN, ErrorCode.ACCOUNT_NOT_LINKED);
  }

  /** Whose salary the current user may see. */
  salaryScope(): Promise<EmployeeScope> {
    return this.scope(VIEW_SALARY);
  }

  /** Throws 404 — not 403, so existence isn't leaked (edge case 3) — when `employee` is outside. */
  async assertInScope(key: PermissionKey, employee: ScopedEmployee | null): Promise<void> {
    if (!employee || !inScope(await this.scope(key), employee)) throw new NotFoundException();
  }

  /** The signed-in user's name as it is now (a printed copy keeps it), or null outside a request. */
  actorName(): string | null {
    return this.user()?.name ?? null;
  }

  private user(): Pick<AuthUser, 'id' | 'name'> | undefined {
    if (!this.cls.isActive()) return undefined;
    return this.cls.get<(Request & { user?: AuthUser }) | undefined>(CLS_REQ)?.user;
  }
}
