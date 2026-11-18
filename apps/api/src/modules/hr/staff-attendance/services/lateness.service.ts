import { Injectable } from '@nestjs/common';
import {
  AuditEntityType,
  type AuditChange,
  type LatenessMonth,
  type LatenessRule,
  type LatenessRow,
  type Month,
  type PermissionKey,
  type PutLatenessRequest,
} from '@school-erp/shared';
import { AuditService } from '../../../../core/audit';
import { AfterCommit } from '../../../../database/transactions';
import { latenessDays } from '../../domain';
import { EmployeesService } from '../../employees/services/employees.service';
import { MonthLockService } from '../../month-lock/month-lock.service';
import { HrRemindersService } from '../../reminders/hr-reminders.service';
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
    private readonly audit: AuditService,
    private readonly tx: AfterCommit,
    private readonly reminders: HrRemindersService,
  ) {}

  /**
   * The month's list — the employees `hr.lateness.view` covers for the user (R5) — plus whether its
   * payroll is approved (the screen opens read-only) and the lateness rule its days were computed
   * with: the screen previews days from it, so a viewer needs no `hr.settings.view`. Only the
   * lateness rule leaves here — no payroll or penalty setting.
   */
  async month(month: Month): Promise<LatenessMonth> {
    const [locked, settings] = await Promise.all([
      this.monthLock.isMonthLocked(month),
      this.settings.get(),
    ]);
    const rule = settings.lateness;
    const rows = await this.list(month, 'hr.lateness.view', rule);
    return {
      locked,
      rule: { graceMinutes: rule.graceMinutes, steps: rule.steps, extraHourDays: rule.extraHourDays },
      rows,
    };
  }

  /**
   * Every ACTIVE employee with their department, stored minutes (0 when none) and the days they
   * cost. With `scopeKey`, only the employees it covers for the user; without, all of them
   * (payroll's calculation is school-wide). `rule` is today's lateness rule, read when not given.
   */
  async list(month: Month, scopeKey?: PermissionKey, rule?: LatenessRule): Promise<LatenessRow[]> {
    const [employees, stored, lateness] = await Promise.all([
      this.employees.listActiveWithDepartments(scopeKey),
      this.repository.findByMonth(month),
      rule ?? this.settings.get().then((s) => s.lateness),
    ]);
    const minutesOf = new Map(stored.map((e) => [e.employeeId, e.minutes]));
    return employees.map(({ employee, department }) => {
      const minutes = minutesOf.get(employee.id) ?? 0;
      return { employee, department, minutes, days: latenessDays(minutes, lateness) };
    });
  }

  /**
   * Upserts only the given entries; others keep their stored value. Refused once the month's
   * payroll is approved (409 `PAYROLL_APPROVED`), and for unknown (400) or inactive (409)
   * employees — nothing is written unless every entry is valid.
   */
  async put(month: Month, body: PutLatenessRequest, userId: string | null): Promise<LatenessMonth> {
    // The month's minutes and its audit entry commit together (audit D2).
    return this.tx.inTransaction(async () => {
      await this.monthLock.assertMonthOpen(month);
      const ids = body.entries.map((e) => e.employeeId);
      // Scope first (edge case 3): an employee outside `hr.lateness.edit` → 404, nothing written.
      await this.employees.assertScopeFirst('hr.lateness.edit', ids);
      await this.employees.assertActive(ids);
      const before = new Map(
        (await this.repository.findByMonth(month)).map((e) => [e.employeeId, e.minutes]),
      );
      await this.repository.upsertMany(
        month,
        body.entries.map(({ employeeId, minutes }) => ({ employeeId, minutes })),
        userId,
      );
      // §11 (N3): the month's lateness is entered (even all zeros) — its reminder is done. An
      // empty save stores nothing, so it doesn't count.
      if (body.entries.length > 0) await this.reminders.latenessSaved(month, userId);
      // One entry for the month (spec edge case 7): a line per employee whose minutes changed.
      const names = new Map((await this.employees.listActiveRefs()).map((e) => [e.id, e]));
      const changes: AuditChange[] = body.entries
        .filter(({ employeeId, minutes }) => (before.get(employeeId) ?? 0) !== minutes)
        .map(({ employeeId, minutes }) => {
          const employee = names.get(employeeId);
          return {
            field: 'minutes',
            before: before.get(employeeId) ?? 0,
            after: minutes,
            subject: { en: employee?.nameEn ?? employeeId, ar: employee?.nameAr ?? employeeId },
          };
        });
      await this.audit.record({
        action: 'hr.lateness.save',
        entity: { type: AuditEntityType.LATENESS_MONTH, id: month, label: month },
        changes,
      });
      return this.month(month);
    });
  }
}
