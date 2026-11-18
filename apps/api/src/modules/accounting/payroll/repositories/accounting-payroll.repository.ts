import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { Prisma } from '@prisma/client';
import { PAGINATION, type AccountingPayrollTotals, type InsuranceStatus } from '@school-erp/shared';
import type { DbAdapter } from '../../../../database/transactions';

export const ACCOUNTING_RUN_SELECT = {
  id: true,
  hrRunId: true,
  month: true,
  taxRule: true,
  recordedAt: true,
} satisfies Prisma.AccountingPayrollRunSelect;
export type AccountingRunRow = Prisma.AccountingPayrollRunGetPayload<{
  select: typeof ACCOUNTING_RUN_SELECT;
}>;

export const ACCOUNTING_LINE_SELECT = {
  employeeId: true,
  employeeCode: true,
  nameEn: true,
  nameAr: true,
  net: true,
  insuranceStatus: true,
  insuredSalary: true,
  insuranceAmount: true,
  incomeTax: true,
  martyrTax: true,
  gross: true,
} satisfies Prisma.AccountingPayrollLineSelect;
export type AccountingLineRow = Prisma.AccountingPayrollLineGetPayload<{
  select: typeof ACCOUNTING_LINE_SELECT;
}>;

export interface AccountingLineData {
  employeeId: string;
  employeeCode: string;
  nameEn: string;
  nameAr: string;
  net: number;
  insuranceStatus: InsuranceStatus;
  insuredSalary: number | null;
  insuranceAmount: number;
  incomeTax: number;
  martyrTax: number;
  gross: number;
}

const EMPTY_TOTALS: AccountingPayrollTotals = {
  employees: 0,
  net: 0,
  insuranceAmount: 0,
  incomeTax: 0,
  martyrTax: 0,
  gross: 0,
};

/**
 * Accounting's payroll months and their lines (§10) — accounting's own tables only. Runs in the
 * caller's transaction when one is open, so a month and its audit entry commit together.
 */
@Injectable()
export class AccountingPayrollRepository {
  constructor(private readonly txHost: TransactionHost<DbAdapter>) {}

  private get db() {
    return this.txHost.tx;
  }

  findByHrRun(hrRunId: string): Promise<AccountingRunRow | null> {
    return this.db.accountingPayrollRun.findUnique({ where: { hrRunId }, select: ACCOUNTING_RUN_SELECT });
  }

  findByMonth(month: string): Promise<AccountingRunRow | null> {
    return this.db.accountingPayrollRun.findUnique({ where: { month }, select: ACCOUNTING_RUN_SELECT });
  }

  /** The recorded months of a calendar year (`YYYY-…`), January first. */
  findInYear(year: number): Promise<AccountingRunRow[]> {
    return this.db.accountingPayrollRun.findMany({
      where: { month: { startsWith: `${year}-` } },
      select: ACCOUNTING_RUN_SELECT,
      orderBy: { month: 'asc' },
    });
  }

  findLines(runId: string): Promise<AccountingLineRow[]> {
    return this.db.accountingPayrollLine.findMany({
      where: { runId },
      select: ACCOUNTING_LINE_SELECT,
      orderBy: { employeeCode: 'asc' },
    });
  }

  /**
   * A month and its lines, once. Returns null when the HR run (or the month) was already recorded
   * — the unique keys make a second delivery of the approval a no-op.
   */
  async create(
    data: { hrRunId: string; month: string; taxRule: Prisma.InputJsonValue },
    lines: AccountingLineData[],
  ): Promise<AccountingRunRow | null> {
    try {
      return await this.txHost.withTransaction(async () => {
        const run = await this.db.accountingPayrollRun.create({ data, select: ACCOUNTING_RUN_SELECT });
        if (lines.length) {
          await this.db.accountingPayrollLine.createMany({
            data: lines.map((l) => ({ ...l, runId: run.id })),
          });
        }
        return run;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return null;
      throw e;
    }
  }

  async list(
    page: number = PAGINATION.defaultPage,
    limit: number = PAGINATION.defaultLimit,
  ): Promise<{ rows: AccountingRunRow[]; total: number; page: number; limit: number }> {
    const take = Math.min(limit, PAGINATION.maxLimit);
    const [rows, total] = await Promise.all([
      this.db.accountingPayrollRun.findMany({
        select: ACCOUNTING_RUN_SELECT,
        orderBy: { month: 'desc' },
        skip: (page - 1) * take,
        take,
      }),
      this.db.accountingPayrollRun.count(),
    ]);
    return { rows, total, page, limit: take };
  }

  /** Totals of each month from its lines (one aggregate query). */
  async totalsFor(runIds: readonly string[]): Promise<Map<string, AccountingPayrollTotals>> {
    const totals = new Map<string, AccountingPayrollTotals>(runIds.map((id) => [id, { ...EMPTY_TOTALS }]));
    if (!runIds.length) return totals;
    const sums = await this.db.accountingPayrollLine.groupBy({
      by: ['runId'],
      where: { runId: { in: [...runIds] } },
      _count: { _all: true },
      _sum: { net: true, insuranceAmount: true, incomeTax: true, martyrTax: true, gross: true },
    });
    for (const s of sums) {
      totals.set(s.runId, {
        employees: s._count._all,
        net: s._sum.net ?? 0,
        insuranceAmount: s._sum.insuranceAmount ?? 0,
        incomeTax: s._sum.incomeTax ?? 0,
        martyrTax: s._sum.martyrTax ?? 0,
        gross: s._sum.gross ?? 0,
      });
    }
    return totals;
  }
}
