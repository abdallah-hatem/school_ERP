import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Prisma } from '@prisma/client';
import {
  ACCOUNTING_LINE_MONEY_FIELDS,
  AccountingMonthState,
  AuditEntityType,
  PayrollStatus,
  insuranceShare,
  payrollTax,
  type AccountingPayrollLine,
  type AccountingPayrollMonth,
  type AccountingPayrollMonthSummary,
  type AccountingPayrollTotals,
  type AccountingPayrollYear,
  type Language,
  type Month,
  type Paginated,
  type TaxRule,
  type Uuid,
} from '@school-erp/shared';
import type { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';
import { AuditService } from '../../../../core/audit';
import type { DbAdapter } from '../../../../database/transactions';
import { EmployeesService, PayrollService } from '../../../hr';
import { AccountingSettingsService } from '../../settings/accounting-settings.service';
import { buildPayrollTaxesSheet } from '../payroll-taxes-sheet';
import {
  AccountingPayrollRepository,
  type AccountingLineData,
  type AccountingLineRow,
  type AccountingRunRow,
} from '../repositories/accounting-payroll.repository';

/**
 * Payroll taxes (§10). HR payroll ends at the net. When HR approves a month, this works out for
 * every line what the school pays on top — the employee's insurance share, income tax and the
 * martyrs' fund — and the gross, with the tax rule in force at the approval and the insurance HR's
 * approved line holds, and keeps them frozen. Worked out later (a missed event), the answer is the
 * same. Reads HR only through its exported services; writes only its own tables.
 */
@Injectable()
export class AccountingPayrollService {
  private readonly logger = new Logger(AccountingPayrollService.name);

  constructor(
    private readonly repository: AccountingPayrollRepository,
    private readonly settings: AccountingSettingsService,
    private readonly hrPayroll: PayrollService,
    private readonly employees: EmployeesService,
    private readonly audit: AuditService,
    private readonly txHost: TransactionHost<DbAdapter>,
  ) {}

  /**
   * Works out and stores an APPROVED HR run's taxes, once — with the tax rule in force when HR
   * approved it and the insurance on HR's approved lines, never today's. A run already recorded, or one not
   * approved (yet), is left alone and returns null — so a repeated event never doubles a month.
   */
  async recordApprovedRun(hrRunId: Uuid): Promise<AccountingRunRow | null> {
    if (await this.repository.findByHrRun(hrRunId)) return null;
    const run = await this.hrPayroll.approvedLinesForAccounting(hrRunId);
    if (!run) return null;

    const rule = await this.settings.taxRuleAt(run.approvedAt);
    const lines: AccountingLineData[] = run.lines.map((line) => {
      const { insuranceStatus, insuredSalary } = line;
      const amounts = payrollTax(line.net, insuranceShare(insuranceStatus, insuredSalary, rule.insurancePercent), rule);
      return {
        employeeId: line.employeeId,
        employeeCode: line.employeeCode,
        nameEn: line.nameEn,
        nameAr: line.nameAr,
        net: line.net,
        insuranceStatus,
        insuredSalary,
        ...amounts,
      };
    });

    // Joins the open transaction — the outbox delivery's, so the taxes commit with its "delivered"
    // mark — or, on the late read path, opens one. Never RequiresNew: a second pooled connection
    // while the delivery's is held (docs/EVENTS.md).
    return this.txHost.withTransaction(async () => {
      const created = await this.repository.create(
        { hrRunId, month: run.month, taxRule: rule as unknown as Prisma.InputJsonValue },
        lines,
      );
      if (!created) return null;
      // Done by the system on HR's approval: no user acts here.
      await this.audit.record({
        action: 'accounting.payroll.record',
        entity: { type: AuditEntityType.ACCOUNTING_PAYROLL, id: created.id, label: run.month },
        changes: [{ field: 'totals', before: null, after: totalsOf(lines) }],
        actor: null,
      });
      return created;
    });
  }

  async list(query: PaginationQueryDto): Promise<Paginated<AccountingPayrollMonthSummary>> {
    const { rows, total, page, limit } = await this.repository.list(query.page, query.limit);
    const [totals, everySalary] = await Promise.all([
      this.repository.totalsFor(rows.map((r) => r.id)),
      this.employees.seesEverySalary(),
    ]);
    return {
      data: rows.map((r) => toSummary(r, totals.get(r.id)!, everySalary)),
      total,
      page,
      limit,
      hasNextPage: page * limit < total,
      hasPreviousPage: page > 1,
    };
  }

  /**
   * The year board (§10): each of the year's twelve months — APPROVED with its totals (money only
   * for someone who sees every salary, §2 P4), DRAFT when HR has a run not approved yet, or NONE.
   * Read only: HR's run statuses come through HR's exported `PayrollService`. An approved month
   * whose taxes were never worked out (a missed event) has no summary; opening it works them out.
   */
  async year(year: number): Promise<AccountingPayrollYear> {
    const [runs, hrRuns, everySalary] = await Promise.all([
      this.repository.findInYear(year),
      this.hrPayroll.runStatusesInYear(year),
      this.employees.seesEverySalary(),
    ]);
    const totals = await this.repository.totalsFor(runs.map((r) => r.id));
    const recorded = new Map(runs.map((r) => [r.month, r]));
    const hrStatus = new Map(hrRuns.map((r) => [r.month, r.status]));
    const months = Array.from({ length: 12 }, (_, i) => {
      const month: Month = `${year}-${String(i + 1).padStart(2, '0')}`;
      const run = recorded.get(month);
      if (run) {
        return { month, state: AccountingMonthState.APPROVED, summary: toSummary(run, totals.get(run.id)!, everySalary) };
      }
      const status = hrStatus.get(month);
      const state =
        status === PayrollStatus.APPROVED
          ? AccountingMonthState.APPROVED
          : status === PayrollStatus.DRAFT
            ? AccountingMonthState.DRAFT
            : AccountingMonthState.NONE;
      return { month, state };
    });
    return { year, months };
  }

  /**
   * A month's taxes as `.xlsx`, with the lines exactly as `getMonth` gives them to this viewer
   * (amounts only within their salary scope, totals only with every salary) and the tax rule used.
   */
  async exportMonth(month: Month, lang: Language): Promise<{ fileName: string; content: Buffer }> {
    const data = await this.getMonth(month);
    return { fileName: `payroll-taxes-${month}.xlsx`, content: await buildPayrollTaxesSheet(data, lang) };
  }

  /**
   * One approved month's taxes. If HR approved the month but its event was missed (the listener
   * failed or hasn't finished), they are worked out now (logged) — still with the rule in force at
   * the approval and the insurance HR took then, so the month comes out as it would have.
   */
  async getMonth(month: Month): Promise<AccountingPayrollMonth> {
    let run = await this.repository.findByMonth(month);
    if (!run) {
      const hrRunId = await this.hrPayroll.approvedRunIdForMonth(month);
      if (!hrRunId) throw new NotFoundException();
      this.logger.warn(`Payroll taxes for ${month} were missing; working them out now`);
      run = (await this.recordApprovedRun(hrRunId)) ?? (await this.repository.findByMonth(month));
      if (!run) throw new NotFoundException();
    }
    const [lines, totals, everySalary] = await Promise.all([
      this.repository.findLines(run.id),
      this.repository.totalsFor([run.id]),
      this.employees.seesEverySalary(),
    ]);
    // Tax, insurance and gross are salary data (§2, P4): only for the employees whose salary the
    // viewer may see; the whole month's money totals only for someone who sees every salary.
    const paid = everySalary
      ? new Set(lines.map((l) => l.employeeId))
      : await this.employees.filterInScope('hr.employees.view_salary', lines.map((l) => l.employeeId));
    return {
      ...toSummary(run, totals.get(run.id)!, everySalary),
      taxRule: run.taxRule as unknown as TaxRule,
      lines: lines.map((l) => toLine(l, paid.has(l.employeeId))),
    };
  }
}

function toSummary(
  run: AccountingRunRow,
  totals: AccountingPayrollTotals,
  salaryVisible: boolean,
): AccountingPayrollMonthSummary {
  return {
    month: run.month,
    hrRunId: run.hrRunId,
    recordedAt: run.recordedAt.toISOString(),
    salaryVisible,
    totals: salaryVisible ? totals : { employees: totals.employees },
  };
}

/** A stored line; its money and insured salary left out unless `salaryVisible` (§2, P4). */
function toLine(row: AccountingLineRow, salaryVisible: boolean): AccountingPayrollLine {
  if (salaryVisible) return { ...row, salaryVisible };
  const line: Record<string, unknown> = { ...row, salaryVisible };
  for (const field of ACCOUNTING_LINE_MONEY_FIELDS) delete line[field];
  return line as unknown as AccountingPayrollLine;
}

function totalsOf(lines: readonly AccountingLineData[]): AccountingPayrollTotals {
  const sum = (key: keyof Omit<AccountingPayrollTotals, 'employees'>) =>
    lines.reduce((n, l) => n + l[key], 0);
  return {
    employees: lines.length,
    net: sum('net'),
    insuranceAmount: sum('insuranceAmount'),
    incomeTax: sum('incomeTax'),
    martyrTax: sum('martyrTax'),
    gross: sum('gross'),
  };
}
