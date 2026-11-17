import { Injectable } from '@nestjs/common';
import type { LatenessRow, Month, PutLatenessRequest } from '@school-erp/shared';
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

  /** Every ACTIVE employee with their stored minutes (0 when none) and the days they cost. */
  async list(month: Month): Promise<LatenessRow[]> {
    const [employees, stored, settings] = await Promise.all([
      this.employees.listActiveRefs(),
      this.repository.findByMonth(month),
      this.settings.get(),
    ]);
    const minutesOf = new Map(stored.map((e) => [e.employeeId, e.minutes]));
    return employees.map((employee) => {
      const minutes = minutesOf.get(employee.id) ?? 0;
      return { employee, minutes, days: latenessDays(minutes, settings.lateness) };
    });
  }

  /**
   * Upserts only the given entries; others keep their stored value. Refused once the month's
   * payroll is approved (409 `PAYROLL_APPROVED`), and for unknown (400) or inactive (409)
   * employees — nothing is written unless every entry is valid.
   */
  async put(month: Month, body: PutLatenessRequest, userId: string | null): Promise<LatenessRow[]> {
    await this.monthLock.assertMonthOpen(month);
    await this.employees.assertActive(body.entries.map((e) => e.employeeId));
    await this.repository.upsertMany(
      month,
      body.entries.map(({ employeeId, minutes }) => ({ employeeId, minutes })),
      userId,
    );
    return this.list(month);
  }
}
