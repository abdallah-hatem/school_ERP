import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  LatenessMonth,
  LatenessRow,
  Month,
  PermissionKey,
  PutLatenessRequest,
} from '@school-erp/shared';
import { latenessDays } from '../../domain';
import { EmployeesService } from '../../employees/services/employees.service';
import { MonthLockService } from '../../month-lock/month-lock.service';
import { HrSettingsService } from '../../settings/hr-settings.service';
import { LatenessRepository } from '../repositories/lateness.repository';

/**
 * §5 monthly lateness: HR enters each employee's accumulated minutes for a month; the days
 * deducted are never stored — they are computed from the CURRENT lateness rule on every read.
 */
@Injectable()
export class LatenessService {
  constructor(
    private readonly repository: LatenessRepository,
    private readonly employees: EmployeesService,
    private readonly settings: HrSettingsService,
    private readonly monthLock: MonthLockService,
  ) {}

  /**
   * The month's list — the employees `hr.lateness.view` covers for the user (R5) — plus whether its
   * payroll is approved (the screen opens read-only).
   */
  async month(month: Month): Promise<LatenessMonth> {
    const [locked, rows] = await Promise.all([
      this.monthLock.isMonthLocked(month),
      this.list(month, 'hr.lateness.view'),
    ]);
    return { locked, rows };
  }

  /**
   * Every ACTIVE employee with their department, stored minutes (0 when none) and the days they
   * cost. With `scopeKey`, only the employees it covers for the user; without, all of them
   * (payroll's calculation is school-wide).
   */
  async list(month: Month, scopeKey?: PermissionKey): Promise<LatenessRow[]> {
    const [employees, stored, settings] = await Promise.all([
      this.employees.listActiveWithDepartments(scopeKey),
      this.repository.findByMonth(month),
      this.settings.get(),
    ]);
    const minutesOf = new Map(stored.map((e) => [e.employeeId, e.minutes]));
    return employees.map(({ employee, department }) => {
      const minutes = minutesOf.get(employee.id) ?? 0;
      return { employee, department, minutes, days: latenessDays(minutes, settings.lateness) };
    });
  }

  /**
   * Upserts only the given entries; others keep their stored value. Refused once the month's
   * payroll is approved (409 `PAYROLL_APPROVED`), and for unknown (400) or inactive (409)
   * employees — nothing is written unless every entry is valid.
   */
  async put(month: Month, body: PutLatenessRequest, userId: string | null): Promise<LatenessMonth> {
    await this.monthLock.assertMonthOpen(month);
    const ids = body.entries.map((e) => e.employeeId);
    await this.employees.assertActive(ids);
    // An employee outside the user's `hr.lateness.edit` scope → 404, nothing written (R5).
    const editable = await this.employees.filterInScope('hr.lateness.edit', ids);
    if (ids.some((id) => !editable.has(id))) throw new NotFoundException();
    await this.repository.upsertMany(
      month,
      body.entries.map(({ employeeId, minutes }) => ({ employeeId, minutes })),
      userId,
    );
    return this.month(month);
  }
}
