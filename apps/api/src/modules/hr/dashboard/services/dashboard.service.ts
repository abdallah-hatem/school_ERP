import { Injectable } from '@nestjs/common';
import type { HrDashboard } from '@school-erp/shared';
import { monthOf } from '../../../../common/utils/dates.util';
import { HrAccessService } from '../../access/hr-access.service';
import { EmployeesService } from '../../employees/services/employees.service';
import { PayrollService } from '../../payroll/services/payroll.service';
import { PenaltyRecordsService } from '../../penalties/services/penalty-records.service';

/**
 * The HR dashboard (spec flow 1): active headcount (total and per stage), the current month's
 * payroll run (or null), and this month's penalties by violation date. Each widget counts only the
 * rows the viewer may see (R5) and is null when they can't see that kind of record at all (P4).
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly employees: EmployeesService,
    private readonly payroll: PayrollService,
    private readonly penalties: PenaltyRecordsService,
    private readonly access: HrAccessService,
  ) {}

  async get(now: Date = new Date()): Promise<HrDashboard> {
    const month = monthOf(now);
    const [seesEmployees, seesPayroll, seesPenalties] = await Promise.all([
      this.access.holds('hr.employees.view'),
      this.access.holds('hr.payroll.view'),
      this.access.holds('hr.penalties.view'),
    ]);
    const [headcount, run, penaltiesThisMonth] = await Promise.all([
      seesEmployees ? this.employees.activeHeadcount() : null,
      seesPayroll ? this.payroll.monthSummary(month) : null,
      seesPenalties ? this.penalties.monthCounts(month) : null,
    ]);
    return {
      headcount,
      currentRun: run && {
        id: run.id,
        month: run.month,
        status: run.status,
        salaryVisible: run.salaryVisible,
        ...(run.totals.net !== undefined ? { net: run.totals.net } : {}),
      },
      penaltiesThisMonth,
    };
  }
}
