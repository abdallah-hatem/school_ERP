import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Propagation, TransactionHost } from '@nestjs-cls/transactional';
import type { Prisma } from '@prisma/client';
import {
  ACCOUNTING_LINE_MONEY_FIELDS,
  AuditEntityType,
  insuranceShare,
  payrollTax,
  type AccountingPayrollLine,
  type AccountingPayrollMonth,
  type AccountingPayrollMonthSummary,
  type AccountingPayrollTotals,
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

    return this.txHost.withTransaction(Propagation.RequiresNew, async () => {
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
