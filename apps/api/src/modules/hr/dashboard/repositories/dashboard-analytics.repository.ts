import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { EmployeeStatus, PayrollStatus, PenaltyStatus, type Prisma } from '@prisma/client';
import type { IsoDate, Month, PenaltyAction } from '@school-erp/shared';
import { toIsoDate } from '../../../../common/utils/dates.util';
import type { DbAdapter, DbClient } from '../../../../database/transactions';
import type { EmployeeDates } from '../analytics.pure';

type EmployeeScopeWhere = Prisma.EmployeeWhereInput;

/**
 * Read-only aggregates behind the dashboard charts (§2). HR's own tables, filtered to the rows the
 * viewer's scope covers (R5), plus accounting's worked-out months (§10) — a read of another
 * module's tables for display, which the module rules allow (never a write). Every figure is a
 * database aggregate or a small per-employee read; nothing here pages a list for the browser.
 */
@Injectable()
export class DashboardAnalyticsRepository {
  constructor(private readonly txHost: TransactionHost<DbAdapter>) {}

  private get db(): DbClient {
    return this.txHost.tx;
  }

  /** Approved payroll months, whole school, ever. */
  countApprovedRuns(): Promise<number> {
    return this.db.payrollRun.count({ where: { status: PayrollStatus.APPROVED } });
  }

  /** The approved runs of these months (whole school). */
  approvedRunsIn(months: readonly Month[]): Promise<{ id: string; month: Month }[]> {
    return this.db.payrollRun.findMany({
      where: { month: { in: [...months] }, status: PayrollStatus.APPROVED },
      select: { id: true, month: true },
      orderBy: { month: 'asc' },
    });
  }

  /** Each run's net, deductions and employee count over the lines of the employees in `scope`. */
  async lineTotals(
    runIds: readonly string[],
    scope: EmployeeScopeWhere,
  ): Promise<Map<string, { net: number; penaltyAmount: number; latenessAmount: number; employees: number }>> {
    const out = new Map<string, { net: number; penaltyAmount: number; latenessAmount: number; employees: number }>();
    if (!runIds.length) return out;
    const groups = await this.db.payrollLine.groupBy({
      by: ['runId'],
      where: { runId: { in: [...runIds] }, employee: scope },
      _count: { _all: true },
      _sum: { net: true, penaltyAmount: true, latenessAmount: true },
    });
    for (const g of groups) {
      out.set(g.runId, {
        net: g._sum.net ?? 0,
        penaltyAmount: g._sum.penaltyAmount ?? 0,
        latenessAmount: g._sum.latenessAmount ?? 0,
        employees: g._count._all,
      });
    }
    return out;
  }

  /** Which of these stages is the "no stage" entry (§3; drawn grey). */
  async noStageIds(stageIds: readonly string[]): Promise<Set<string>> {
    if (!stageIds.length) return new Set();
    const rows = await this.db.stage.findMany({
      where: { id: { in: [...stageIds] }, isNoStage: true },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }

  /** Hire and leaving days of every employee in `scope` (a school's few hundred rows). */
  async employeeDates(scope: EmployeeScopeWhere): Promise<EmployeeDates[]> {
    const rows = await this.db.employee.findMany({
      where: scope,
      select: { hireDate: true, deactivatedOn: true, status: true },
    });
    return rows.map((r) => ({
      hireDate: toIsoDate(r.hireDate),
      deactivatedOn: r.deactivatedOn ? toIsoDate(r.deactivatedOn) : null,
      active: r.status === EmployeeStatus.ACTIVE,
    }));
  }

  /** Approved penalties with a violation day in [from, to), counted per day and action. */
  async approvedPenaltyCounts(
    range: { gte: Date; lt: Date },
    /** The penalties in scope — a stage scope by the penalty's stage (`penaltyWhere`). */
    scope: Prisma.PenaltyRecordWhereInput,
  ): Promise<{ date: IsoDate; action: PenaltyAction; count: number }[]> {
    const groups = await this.db.penaltyRecord.groupBy({
      by: ['date', 'action'],
      where: { AND: [{ status: PenaltyStatus.APPROVED, date: range }, scope] },
      _count: { _all: true },
    });
    return groups.map((g) => ({ date: toIsoDate(g.date), action: g.action, count: g._count._all }));
  }

  /** Minutes late entered per month, for the employees in `scope`. */
  async latenessMinutes(months: readonly Month[], scope: EmployeeScopeWhere): Promise<{ month: Month; minutes: number }[]> {
    const groups = await this.db.latenessEntry.groupBy({
      by: ['month'],
      where: { month: { in: [...months] }, employee: scope },
      _sum: { minutes: true },
    });
    return groups.map((g) => ({ month: g.month, minutes: g._sum.minutes ?? 0 }));
  }

  /**
   * The months accounting has worked out (§10), by HR run: the school's insurance share, income
   * tax and martyrs' fund over every line. Whole school only — the caller asks only for a viewer
   * who sees every salary.
   */
  async workedOutTaxes(
    hrRunIds: readonly string[],
  ): Promise<Map<string, { insurance: number; incomeTax: number; martyrTax: number }>> {
    const out = new Map<string, { insurance: number; incomeTax: number; martyrTax: number }>();
    if (!hrRunIds.length) return out;
    const runs = await this.db.accountingPayrollRun.findMany({
      where: { hrRunId: { in: [...hrRunIds] } },
      select: { id: true, hrRunId: true },
    });
    if (!runs.length) return out;
    const groups = await this.db.accountingPayrollLine.groupBy({
      by: ['runId'],
      where: { runId: { in: runs.map((r) => r.id) } },
      _sum: { insuranceAmount: true, incomeTax: true, martyrTax: true },
    });
    const hrRunOf = new Map(runs.map((r) => [r.id, r.hrRunId]));
    for (const g of groups) {
      out.set(hrRunOf.get(g.runId)!, {
        insurance: g._sum.insuranceAmount ?? 0,
        incomeTax: g._sum.incomeTax ?? 0,
        martyrTax: g._sum.martyrTax ?? 0,
      });
    }
    return out;
  }
}
