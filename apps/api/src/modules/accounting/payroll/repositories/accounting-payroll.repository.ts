import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { Prisma } from '@prisma/client';
import { PAGINATION, PAYROLL_PAGINATION, type AccountingPayrollTotals, type InsuranceStatus } from '@school-erp/shared';
import type { DbAdapter } from '../../../../database/transactions';

export const ACCOUNTING_RUN_SELECT = {
  id: true,
  hrRunId: true,
  month: true,
  taxRule: true,
  recordedAt: true,
  finalizedAt: true,
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

/** What narrows a month's lines: the search (code or either name) and one insurance group. */
export interface AccountingLinesFilter {
  search?: string;
  insurance?: InsuranceStatus;
}

function linesWhere(runId: string, filter: AccountingLinesFilter): Prisma.AccountingPayrollLineWhereInput {
  const where: Prisma.AccountingPayrollLineWhereInput = { runId };
  if (filter.insurance) where.insuranceStatus = filter.insurance;
  const search = filter.search?.trim();
  if (search) {
    where.OR = (['employeeCode', 'nameEn', 'nameAr'] as const).map((field) => ({
      [field]: { contains: search, mode: 'insensitive' as const },
    }));
  }
  return where;
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

  /** Drops a PENDING month and its lines (returned to HR). False when it was finalized meanwhile. */
  async deletePending(id: string): Promise<boolean> {
    const { count } = await this.db.accountingPayrollRun.deleteMany({ where: { id, finalizedAt: null } });
    return count === 1;
  }

  /** Marks a PENDING month finalized. False when it already was. */
  async finalize(id: string, finalizedById: string | null, at: Date): Promise<boolean> {
    const { count } = await this.db.accountingPayrollRun.updateMany({
      where: { id, finalizedAt: null },
      data: { finalizedAt: at, finalizedById },
    });
    return count === 1;
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

  /**
   * One page of a month's lines (by employee code) matching `filter`, and how many match. The
   * search is the code, English or Arabic name (any case); `insurance` keeps one group.
   */
  async findLinesPage(
    runId: string,
    filter: AccountingLinesFilter,
    page: number,
    limit: number,
  ): Promise<{ rows: AccountingLineRow[]; total: number; page: number; limit: number }> {
    const take = Math.min(Math.max(1, limit), PAYROLL_PAGINATION.maxLimit);
    const current = Math.max(1, page);
    const where = linesWhere(runId, filter);
    const [rows, total] = await Promise.all([
      this.db.accountingPayrollLine.findMany({
        where,
        select: ACCOUNTING_LINE_SELECT,
        orderBy: { employeeCode: 'asc' },
        skip: (current - 1) * take,
        take,
      }),
      this.db.accountingPayrollLine.count({ where }),
    ]);
    return { rows, total, page: current, limit: take };
  }

  /** The sums of every line matching `filter` (all pages), in one aggregate query. */
  async sumLines(runId: string, filter: AccountingLinesFilter): Promise<AccountingPayrollTotals> {
    const s = await this.db.accountingPayrollLine.aggregate({
      where: linesWhere(runId, filter),
      _count: { _all: true },
      _sum: { net: true, insuranceAmount: true, incomeTax: true, martyrTax: true, gross: true },
    });
    return {
      employees: s._count._all,
      net: s._sum.net ?? 0,
      insuranceAmount: s._sum.insuranceAmount ?? 0,
      incomeTax: s._sum.incomeTax ?? 0,
      martyrTax: s._sum.martyrTax ?? 0,
      gross: s._sum.gross ?? 0,
    };
  }

  /** Every employee on a month's lines (the salary-scope count). */
  async findLineEmployeeIds(runId: string): Promise<string[]> {
    const rows = await this.db.accountingPayrollLine.findMany({ where: { runId }, select: { employeeId: true } });
    return rows.map((r) => r.employeeId);
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
    const take = Math.min(Math.max(1, limit), PAYROLL_PAGINATION.maxLimit);
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
