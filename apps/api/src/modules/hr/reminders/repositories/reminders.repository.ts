import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { ContractStatus, EmployeeStatus } from '@prisma/client';
import { contractYearRange, type IsoDate, type Month } from '@school-erp/shared';
import { fromIsoDate, toIsoDate } from '../../../../common/utils/dates.util';
import type { DbAdapter } from '../../../../database/transactions';
import { reminderEmployeeOf, type RenewalSeason, type ReminderEmployee, type ReminderMonth } from '../reminders.pure';

/**
 * The facts HR's daily reminders job reads (§11, N3): read-only, in the job's transaction for the
 * type (`txHost.tx`), so the facts and the sends see one snapshot and hold one connection.
 */
@Injectable()
export class RemindersRepository {
  constructor(private readonly txHost: TransactionHost<DbAdapter>) {}

  /**
   * Every ACTIVE employee's contract and probation end (inactive ones get no reminder, §3). The
   * contract is the one in force on `today` (`currentContractPeriod`: the latest started, cancelled
   * ones aside) — a renewal's next contract, which hasn't started, is not "the current one" (bug
   * 2026-11-24: a renewed 2026/27 is decided, so it isn't chased; 2027/28 is chased from its own end).
   */
  async activeEmployees(today: IsoDate): Promise<ReminderEmployee[]> {
    const rows = await this.txHost.tx.employee.findMany({
      where: { status: EmployeeStatus.ACTIVE },
      orderBy: { code: 'asc' },
      select: {
        id: true,
        nameEn: true,
        nameAr: true,
        contractEnd: true,
        probationEnd: true,
        contracts: {
          where: { status: { not: ContractStatus.CANCELLED } },
          select: { status: true, startsOn: true, endsOn: true, endedOn: true, remindersRearmedAt: true },
        },
      },
    });
    return rows.map((r) =>
      reminderEmployeeOf(
        {
          id: r.id,
          nameEn: r.nameEn,
          nameAr: r.nameAr,
          contractEnd: toIsoDate(r.contractEnd),
          probationEnd: r.probationEnd ? toIsoDate(r.probationEnd) : null,
          contracts: r.contracts.map((c) => ({
            status: c.status,
            startsOn: toIsoDate(c.startsOn),
            endsOn: toIsoDate(c.endsOn),
            endedOn: c.endedOn ? toIsoDate(c.endedOn) : null,
            remindersRearmedAt: c.remindersRearmedAt?.getTime() ?? null,
          })),
        },
        today,
      ),
    );
  }

  /**
   * A contract year's renewal season: its undecided contracts ending by its end — those that already
   * ended with no decision too (review 5) — of active employees with no early termination waiting,
   * and its school calendar.
   */
  async season(year: number, _today: IsoDate): Promise<RenewalSeason> {
    const end = contractYearRange(year).end;
    const [undecided, calendar] = await Promise.all([
      this.txHost.tx.employeeContract.count({
        where: {
          status: ContractStatus.ACTIVE,
          endsOn: { lte: fromIsoDate(end) },
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
