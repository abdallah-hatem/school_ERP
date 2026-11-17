import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Propagation, TransactionHost } from '@nestjs-cls/transactional';
import type { Prisma } from '@prisma/client';
import {
  AuditEntityType,
  insuranceShare,
  PayrollStatus,
  payrollTax,
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
  type AccountingRunRow,
} from '../repositories/accounting-payroll.repository';

/**
 * Payroll taxes (§10). HR payroll ends at the net. When HR approves a month, this works out for
 * every line what the school pays on top — the employee's insurance share, income tax and the
 * martyrs' fund — and the gross, with the tax rule and each employee's insurance at that moment,
 * and keeps them frozen. Reads HR only through its exported services; writes only its own tables.
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
   * Works out and stores an APPROVED HR run's taxes, once. A run already recorded, or one not
   * approved (yet), is left alone and returns null — so a repeated event never doubles a month.
   */
  async recordApprovedRun(hrRunId: Uuid): Promise<AccountingRunRow | null> {
    if (await this.repository.findByHrRun(hrRunId)) return null;
    const run = await this.hrPayroll.get(hrRunId);
    if (run.status !== PayrollStatus.APPROVED) return null;

    const rule = await this.settings.taxRule();
    const insurance = new Map(
      (await this.employees.insuranceFor(run.lines.map((l) => l.employeeId))).map((e) => [e.id, e]),
    );
    const lines: AccountingLineData[] = run.lines.map((line) => {
      const ins = insurance.get(line.employeeId);
      const insuranceStatus = ins?.insuranceStatus ?? 'NOT_INSURED';
      const insuredSalary = ins?.insuredSalary ?? null;
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
    const totals = await this.repository.totalsFor(rows.map((r) => r.id));
    return {
      data: rows.map((r) => toSummary(r, totals.get(r.id)!)),
      total,
      page,
      limit,
      hasNextPage: page * limit < total,
      hasPreviousPage: page > 1,
    };
  }

  /**
   * One approved month's taxes. If HR approved the month but its event was missed (the listener
   * failed or hasn't finished), they are worked out now, with today's rule (logged).
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
    const [lines, totals] = await Promise.all([
      this.repository.findLines(run.id),
      this.repository.totalsFor([run.id]),
    ]);
    return {
      ...toSummary(run, totals.get(run.id)!),
      taxRule: run.taxRule as unknown as TaxRule,
      lines,
    };
  }
}

function toSummary(run: AccountingRunRow, totals: AccountingPayrollTotals): AccountingPayrollMonthSummary {
  return { month: run.month, hrRunId: run.hrRunId, recordedAt: run.recordedAt.toISOString(), totals };
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
