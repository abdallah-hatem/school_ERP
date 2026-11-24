import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { ContractStatus, EmployeeStatus } from '@prisma/client';
import { contractYearRange, type IsoDate, type Month } from '@school-erp/shared';
import { fromIsoDate, toIsoDate } from '../../../../common/utils/dates.util';
import type { DbAdapter } from '../../../../database/transactions';
import type { RenewalSeason, ReminderEmployee, ReminderMonth } from '../reminders.pure';

/**
 * The facts HR's daily reminders job reads (§11, N3): read-only, in the job's transaction for the
 * type (`txHost.tx`), so the facts and the sends see one snapshot and hold one connection.
 */
@Injectable()
export class RemindersRepository {
  constructor(private readonly txHost: TransactionHost<DbAdapter>) {}

  /** Every ACTIVE employee's contract and probation end (inactive ones get no reminder, §3). */
  async activeEmployees(): Promise<ReminderEmployee[]> {
    const rows = await this.txHost.tx.employee.findMany({
      where: { status: EmployeeStatus.ACTIVE },
      orderBy: { code: 'asc' },
      select: {
        id: true,
        nameEn: true,
        nameAr: true,
        contractEnd: true,
        probationEnd: true,
        // The current contract's state (spec 2026-11-24): the active one, else the latest.
        contracts: { select: { status: true }, orderBy: { startsOn: 'desc' }, take: 1 },
      },
    });
    return rows.map((r) => {
      const status = r.contracts[0]?.status ?? ContractStatus.ACTIVE;
      return {
        id: r.id,
        nameEn: r.nameEn,
        nameAr: r.nameAr,
        contractEnd: toIsoDate(r.contractEnd),
        probationEnd: r.probationEnd ? toIsoDate(r.probationEnd) : null,
        contractDecided: status !== ContractStatus.ACTIVE,
        contractEndedEarly: status === ContractStatus.ENDED_EARLY,
      };
    });
  }

  /**
   * A contract year's renewal season: its undecided contracts ending from today to its end
   * (active employees, no early termination waiting), and its school calendar.
   */
  async season(year: number, today: IsoDate): Promise<RenewalSeason> {
    const end = contractYearRange(year).end;
    const [undecided, calendar] = await Promise.all([
      this.txHost.tx.employeeContract.count({
        where: {
          status: ContractStatus.ACTIVE,
          endsOn: { gte: fromIsoDate(today), lte: fromIsoDate(end) },
          employee: { status: EmployeeStatus.ACTIVE },
          OR: [{ earlyTerminationStatus: null }, { earlyTerminationStatus: { not: 'REQUESTED' } }],
        },
      }),
      this.txHost.tx.schoolCalendar.findUnique({ where: { year } }),
    ]);
    return {
      year,
      undecided,
      calendar: calendar
        ? {
            term1Start: toIsoDate(calendar.term1Start),
            term1End: toIsoDate(calendar.term1End),
            term2Start: toIsoDate(calendar.term2Start),
            nonRenewalDeadline: toIsoDate(calendar.nonRenewalDeadline),
          }
        : null,
    };
  }

  /** Each month's lateness state (saved at least once) and its payroll run, if any. */
  async months(months: readonly Month[]): Promise<Map<Month, ReminderMonth>> {
    const list = [...months];
    const [saved, runs] = [
      await this.txHost.tx.latenessEntry.groupBy({ by: ['month'], where: { month: { in: list } } }),
      await this.txHost.tx.payrollRun.findMany({
        where: { month: { in: list } },
        select: { id: true, month: true, status: true },
      }),
    ];
    const savedMonths = new Set(saved.map((s) => s.month));
    const runOf = new Map(runs.map((r) => [r.month, { id: r.id, status: r.status }]));
    return new Map(
      list.map((m) => [m, { latenessSaved: savedMonths.has(m), run: runOf.get(m) ?? null }]),
    );
  }
}
