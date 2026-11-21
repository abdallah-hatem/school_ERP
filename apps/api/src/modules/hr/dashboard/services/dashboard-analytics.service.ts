import { Injectable } from '@nestjs/common';
import {
  monthOf,
  schoolDayOf,
  shiftMonth,
  type AnalyticsRange,
  type HrDashboardAnalytics,
} from '@school-erp/shared';
import { monthDateRange } from '../../../../common/utils/dates.util';
import { HrAccessService } from '../../access/hr-access.service';
import { employeeWhere, penaltyWhere } from '../../access/employee-scope.pure';
import { EmployeesService } from '../../employees/services/employees.service';
import { totalsMoneyVisible } from '../../payroll/services/payroll.service';
import { analyticsMonths, buildAnalytics, type WorkedOutMonth } from '../analytics.pure';
import { DashboardAnalyticsRepository } from '../repositories/dashboard-analytics.repository';

/**
 * The dashboard charts (§2, owner 2026-11-21): payroll cost, headcount and its flow, penalties and
 * lateness, deductions vs net, over the last 6 or 12 months. The guard requires
 * `hr.dashboard.view_analytics`; on top of it each part follows the rules of the screen its
 * figures come from — the rows the viewer's scope covers (R5), and money only for who may see it
 * (R7, §10). A read: nothing to audit.
 */
@Injectable()
export class DashboardAnalyticsService {
  constructor(
    private readonly repository: DashboardAnalyticsRepository,
    private readonly employees: EmployeesService,
    private readonly access: HrAccessService,
  ) {}

  async get(range: AnalyticsRange, now: Date = new Date()): Promise<HrDashboardAnalytics> {
    const current = monthOf(schoolDayOf(now));
    const months = analyticsMonths(current, range);
    // One month more, for the first month's change from the one before it.
    const payrollMonths = [shiftMonth(months[0], -1), ...months];

    const [employeesScope, penaltiesScope, latenessScope, payrollScope, salaryScope] = await Promise.all([
      this.access.scope('hr.employees.view'),
      this.access.scope('hr.penalties.view'),
      this.access.scope('hr.lateness.view'),
      this.access.scope('hr.payroll.view'),
      this.access.salaryScope(),
    ]);
    const sees = (s: { kind: string }) => s.kind !== 'none';
    const view = { lines: payrollScope, salary: salaryScope };
    // Run totals' money: whole-school viewers, or a narrower one whose salary scope covers it (R7).
    const seesPayroll = sees(payrollScope) && totalsMoneyVisible(view);
    // Tax, insurance and gross are salary data: the month's totals only with every salary (§10).
    const seesDeductions = payrollScope.kind === 'all' && salaryScope.kind === 'all';

    const [approvedMonths, runs] = await Promise.all([
      this.repository.countApprovedRuns(),
      this.repository.approvedRunsIn(payrollMonths),
    ]);
    const runIds = runs.map((r) => r.id);
    const first = monthDateRange(months[0]).gte;
    const last = monthDateRange(current).lt;

    const [lineTotals, wholeTotals, taxes, stages, employeeDates, penalties, lateness] = await Promise.all([
      seesPayroll ? this.repository.lineTotals(runIds, employeeWhere(payrollScope)) : null,
      seesDeductions ? this.repository.lineTotals(runIds, {}) : null,
      seesDeductions ? this.repository.workedOutTaxes(runIds) : null,
      sees(employeesScope) ? this.employees.activeHeadcount() : null,
      sees(employeesScope) ? this.repository.employeeDates(employeeWhere(employeesScope)) : null,
      sees(penaltiesScope)
        ? // By the penalty's stage, like every penalty read (owner 2026-11-21).
          this.repository.approvedPenaltyCounts({ gte: first, lt: last }, penaltyWhere(penaltiesScope))
        : null,
      sees(latenessScope) ? this.repository.latenessMinutes(months, employeeWhere(latenessScope)) : null,
    ]);

    const noStage = stages ? await this.repository.noStageIds(stages.byStage.map((s) => s.stage.id)) : new Set<string>();
    const workedOut: WorkedOutMonth[] | null =
      wholeTotals && taxes
        ? runs.flatMap((run) => {
            const tax = taxes.get(run.id);
            const lines = wholeTotals.get(run.id);
            return tax && lines ? [{ month: run.month, ...lines, ...tax }] : [];
          })
        : null;

    return buildAnalytics({
      current,
      range,
      approvedMonths,
      approvedInRange: runs.map((r) => r.month),
      payroll: lineTotals
        ? runs.map((run) => {
            const t = lineTotals.get(run.id);
            return { month: run.month, net: t?.net ?? 0, employees: t?.employees ?? 0 };
          })
        : null,
      stages: stages ? stages.byStage.map((s) => ({ ...s, noStage: noStage.has(s.stage.id) })) : null,
      employees: employeeDates,
      penalties,
      lateness,
      workedOut,
    });
  }
}
