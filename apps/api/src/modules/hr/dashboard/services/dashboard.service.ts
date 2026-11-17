import { Injectable } from '@nestjs/common';
import type { HrDashboard } from '@school-erp/shared';
import { monthOf } from '../../../../common/utils/dates.util';
import { EmployeesService } from '../../employees/services/employees.service';
import { PayrollService } from '../../payroll/services/payroll.service';
import { PenaltyRecordsService } from '../../penalties/services/penalty-records.service';

/**
 * The HR dashboard (spec flow 1): active headcount (total and per stage), the current month's
 * payroll run (or null), and this month's penalties by violation date.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly employees: EmployeesService,
    private readonly payroll: PayrollService,
    private readonly penalties: PenaltyRecordsService,
  ) {}

  async get(now: Date = new Date()): Promise<HrDashboard> {
    const month = monthOf(now);
    const [headcount, run, penaltiesThisMonth] = await Promise.all([
      this.employees.activeHeadcount(),
      this.payroll.monthSummary(month),
      this.penalties.monthCounts(month),
    ]);
    return {
      headcount,
      currentRun: run && { month: run.month, status: run.status, net: run.totals.net },
      penaltiesThisMonth,
    };
  }
}
