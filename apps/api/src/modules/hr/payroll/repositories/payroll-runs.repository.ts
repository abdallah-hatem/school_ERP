import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { Prisma } from '@prisma/client';
import {
  PAGINATION,
  PayrollStatus,
  type AdjustmentType,
  type InsuranceStatus,
  type Paginated,
  type PayrollFlag,
  type PayrollTotals,
  type WorkSystem,
} from '@school-erp/shared';
import { BaseRepository } from '../../../../common/repositories/base.repository';
import { DatabaseService } from '../../../../database/database.service';
import type { DbAdapter, DbClient } from '../../../../database/transactions';

export const RUN_SELECT = {
  id: true,
  month: true,
  status: true,
  approvedAt: true,
  calculatedAt: true,
} satisfies Prisma.PayrollRunSelect;

export type RunRow = Prisma.PayrollRunGetPayload<{ select: typeof RUN_SELECT }>;

export const LINE_SELECT = {
  id: true,
  employeeId: true,
  employeeCode: true,
  nameEn: true,
  nameAr: true,
  nationalId: true,
  departmentId: true,
  departmentNameEn: true,
  departmentNameAr: true,
  basicSalary: true,
  workSystem: true,
  monthSalary: true,
  dayValue: true,
  penaltyDays: true,
  penaltyAmount: true,
  latenessMinutes: true,
  latenessGraceMinutes: true,
  latenessDays: true,
  latenessAmount: true,
  adjustmentAdditions: true,
  adjustmentDeductions: true,
  net: true,
  flags: true,
} satisfies Prisma.PayrollLineSelect;

export type LineRow = Prisma.PayrollLineGetPayload<{ select: typeof LINE_SELECT }>;

export const ADJUSTMENT_SELECT = {
  id: true,
  employeeId: true,
  type: true,
  amount: true,
  reason: true,
  createdAt: true,
  employee: { select: { code: true, nameEn: true, nameAr: true } },
} satisfies Prisma.PayrollAdjustmentSelect;

export type AdjustmentRow = Prisma.PayrollAdjustmentGetPayload<{
  select: typeof ADJUSTMENT_SELECT;
}>;

export const EMPLOYEE_LINE_SELECT = {
  id: true,
  net: true,
  run: { select: { id: true, month: true, status: true } },
} satisfies Prisma.PayrollLineSelect;

export type EmployeeLineRow = Prisma.PayrollLineGetPayload<{
  select: typeof EMPLOYEE_LINE_SELECT;
}>;

/** Everything a line stores: the employee snapshot plus the calculated amounts. */
export interface LineData {
  employeeId: string;
  employeeCode: string;
  nameEn: string;
  nameAr: string;
  nationalId: string | null;
  departmentId: string;
  departmentNameEn: string;
  departmentNameAr: string;
  basicSalary: number;
  workSystem: WorkSystem;
  monthSalary: number;
  dayValue: number;
  penaltyDays: number;
  penaltyAmount: number;
  latenessMinutes: number;
  /** The lateness grace in force at this calculation (§5). */
  latenessGraceMinutes: number;
  latenessDays: number;
  latenessAmount: number;
  adjustmentAdditions: number;
  adjustmentDeductions: number;
  net: number;
  flags: PayrollFlag[];
  /** The employee's social insurance (§3), retaken at approval; accounting's taxes use it (§10). */
  insuranceStatus: InsuranceStatus;
  insuredSalary: number | null;
}

/**
 * What accounting reads of an approved line (§10). Kept apart from `LINE_SELECT`: HR's own
 * line responses don't carry the insurance.
 */
export const ACCOUNTING_LINE_SELECT = {
  employeeId: true,
  employeeCode: true,
  nameEn: true,
  nameAr: true,
  net: true,
  insuranceStatus: true,
  insuredSalary: true,
} satisfies Prisma.PayrollLineSelect;

export type AccountingLineSource = Prisma.PayrollLineGetPayload<{ select: typeof ACCOUNTING_LINE_SELECT }>;

export interface LineFilter {
  search?: string;
  departmentId?: string;
  flagged?: boolean;
}

/** A line's new adjustment sums, net and flags after its adjustments changed. */
export type LineAdjustmentUpdate = Pick<
  LineData,
  'adjustmentAdditions' | 'adjustmentDeductions' | 'net' | 'flags'
>;

type Tx = DbClient;

const EMPTY_TOTALS: PayrollTotals = {
  employees: 0,
  monthSalary: 0,
  penaltyAmount: 0,
  latenessAmount: 0,
  adjustmentAdditions: 0,
  adjustmentDeductions: 0,
  net: 0,
  flagged: 0,
};

/**
 * Payroll runs, their lines and adjustments (§6). Every write to a run happens in a transaction
 * that first claims the run row with a conditional update (`where status = DRAFT`): concurrent
 * writes on one run are serialised, and nothing is written once it is APPROVED.
 */
@Injectable()
export class PayrollRunsRepository extends BaseRepository<
  RunRow,
  Prisma.PayrollRunUncheckedCreateInput,
  Prisma.PayrollRunUncheckedUpdateInput
> {
  constructor(
    databaseService: DatabaseService,
    private readonly txHost: TransactionHost<DbAdapter>,
  ) {
    super(databaseService, 'payrollRun');
  }

  /** The open transaction when there is one (an audited request, audit D2), else the plain client. */
  private get db(): DbClient {
    return this.txHost.tx;
  }

  list(page: number | undefined, limit: number | undefined) {
    return this.findAllWithPagination(page, limit, undefined, undefined, undefined, {
      select: RUN_SELECT,
      orderBy: { month: 'desc' },
    });
  }

  findRun(id: string): Promise<RunRow | null> {
    return this.db.payrollRun.findUnique({ where: { id }, select: RUN_SELECT });
  }

  findByMonth(month: string): Promise<RunRow | null> {
    return this.db.payrollRun.findUnique({ where: { month }, select: RUN_SELECT });
  }

  /**
   * Totals of each run from its lines — all of them, or those of the employees in `scope` (R5) —
   * one aggregate query each kind.
   */
  async totalsFor(
    runIds: readonly string[],
    scope: Prisma.EmployeeWhereInput = {},
  ): Promise<Map<string, PayrollTotals>> {
    const totals = new Map<string, PayrollTotals>(runIds.map((id) => [id, { ...EMPTY_TOTALS }]));
    if (!runIds.length) return totals;
    const ids = [...runIds];
    const [sums, flagged] = await Promise.all([
      this.db.payrollLine.groupBy({
        by: ['runId'],
        where: { runId: { in: ids }, employee: scope },
        _count: { _all: true },
        _sum: {
          monthSalary: true,
          penaltyAmount: true,
          latenessAmount: true,
          adjustmentAdditions: true,
          adjustmentDeductions: true,
          net: true,
        },
      }),
      this.db.payrollLine.groupBy({
        by: ['runId'],
        where: { runId: { in: ids }, flags: { isEmpty: false }, employee: scope },
        _count: { _all: true },
      }),
    ]);
    for (const s of sums) {
      totals.set(s.runId, {
        employees: s._count._all,
        monthSalary: s._sum.monthSalary ?? 0,
        penaltyAmount: s._sum.penaltyAmount ?? 0,
        latenessAmount: s._sum.latenessAmount ?? 0,
        adjustmentAdditions: s._sum.adjustmentAdditions ?? 0,
        adjustmentDeductions: s._sum.adjustmentDeductions ?? 0,
        net: s._sum.net ?? 0,
        flagged: 0,
      });
    }
    for (const f of flagged) totals.get(f.runId)!.flagged = f._count._all;
    return totals;
  }

  /** The run's lines matching `filter`, of the employees in `scope` (R5; `{}`: all). */
  findLines(
    runId: string,
    filter: LineFilter = {},
    scope: Prisma.EmployeeWhereInput = {},
  ): Promise<LineRow[]> {
    const where: Prisma.PayrollLineWhereInput = { runId, employee: scope };
    if (filter.departmentId) where.departmentId = filter.departmentId;
    if (filter.flagged !== undefined) where.flags = { isEmpty: !filter.flagged };
    if (filter.search) {
      const contains = { contains: filter.search, mode: 'insensitive' as const };
      where.OR = [
        { employeeCode: contains },
        { nameEn: contains },
        { nameAr: contains },
        { nationalId: contains },
      ];
    }
    return this.db.payrollLine.findMany({
      where,
      select: LINE_SELECT,
      orderBy: { employeeCode: 'asc' },
    });
  }

  /** Every line of a run as accounting reads it (§10), with the insurance taken at approval. */
  findAccountingLines(runId: string): Promise<AccountingLineSource[]> {
    return this.db.payrollLine.findMany({
      where: { runId },
      select: ACCOUNTING_LINE_SELECT,
      orderBy: { employeeCode: 'asc' },
    });
  }

  /** One line, or null when unknown or its employee is outside `scope` (R5 — the caller 404s). */
  findLine(
    runId: string,
    lineId: string,
    scope: Prisma.EmployeeWhereInput = {},
  ): Promise<LineRow | null> {
    return this.db.payrollLine.findFirst({
      where: { id: lineId, runId, employee: scope },
      select: LINE_SELECT,
    });
  }

  findLineByEmployee(runId: string, employeeId: string): Promise<LineRow | null> {
    return this.db.payrollLine.findUnique({
      where: { runId_employeeId: { runId, employeeId } },
      select: LINE_SELECT,
    });
  }

  /** The employees that have a line in the run (all lines, whatever the screen's filters). */
  async lineEmployeeIds(runId: string): Promise<Set<string>> {
    const rows = await this.db.payrollLine.findMany({
      where: { runId },
      select: { employeeId: true },
    });
    return new Set(rows.map((r) => r.employeeId));
  }

  /** One employee's lines across runs, newest month first (one query + one count). */
  async listEmployeeLines(
    employeeId: string,
    page: number = PAGINATION.defaultPage,
    limit: number = PAGINATION.defaultLimit,
  ): Promise<Paginated<EmployeeLineRow>> {
    const take = Math.min(Math.max(1, limit), PAGINATION.maxLimit);
    const current = Math.max(1, page);
    const where: Prisma.PayrollLineWhereInput = { employeeId };
    const [data, total] = await Promise.all([
      this.db.payrollLine.findMany({
        where,
        select: EMPLOYEE_LINE_SELECT,
        orderBy: { run: { month: 'desc' } },
        skip: (current - 1) * take,
        take,
      }),
      this.db.payrollLine.count({ where }),
    ]);
    return {
      data,
      total,
      page: current,
      limit: take,
      hasNextPage: current * take < total,
      hasPreviousPage: current > 1,
    };
  }

  /** The run's adjustments (one employee's, with `employeeId`), of the employees in `scope`. */
  findAdjustments(
    runId: string,
    employeeId?: string,
    scope: Prisma.EmployeeWhereInput = {},
  ): Promise<AdjustmentRow[]> {
    return this.db.payrollAdjustment.findMany({
      where: { runId, employee: scope, ...(employeeId ? { employeeId } : {}) },
      select: ADJUSTMENT_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  findAdjustment(runId: string, adjustmentId: string): Promise<AdjustmentRow | null> {
    return this.db.payrollAdjustment.findFirst({
      where: { id: adjustmentId, runId },
      select: ADJUSTMENT_SELECT,
    });
  }

  /**
   * A DRAFT run with its lines, in one transaction. Returns null when the month already has a run
   * (the unique month decides between two concurrent creates).
   */
  async createRun(
    month: string,
    createdById: string | null,
    lines: LineData[],
  ): Promise<string | null> {
    try {
      return await this.txHost.withTransaction(async () => {
      const tx = this.txHost.tx;
        const run = await tx.payrollRun.create({
          data: { month, createdById, status: PayrollStatus.DRAFT },
          select: { id: true },
        });
        if (lines.length) {
          await tx.payrollLine.createMany({ data: lines.map((l) => ({ ...l, runId: run.id })) });
        }
        return run.id;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Rebuilds a DRAFT run's lines: employees no longer in `lines` are removed, the rest updated
   * (same line id) or added. With `approvedById` set, the run is APPROVED in the same transaction. Returns false
   * when the run was no longer DRAFT (nothing written).
   */
  async replaceLines(
    runId: string,
    lines: LineData[],
    approve?: { approvedById: string | null },
  ): Promise<boolean> {
    return this.txHost.withTransaction(async () => {
      const tx = this.txHost.tx;
      if (!(await this.claimDraft(tx, runId))) return false;
      // Upsert by employee so a line keeps its id across recalculations.
      await tx.payrollLine.deleteMany({
        where: { runId, employeeId: { notIn: lines.map((l) => l.employeeId) } },
      });
      for (const line of lines) {
        await tx.payrollLine.upsert({
          where: { runId_employeeId: { runId, employeeId: line.employeeId } },
          create: { ...line, runId },
          update: line,
          select: { id: true },
        });
      }
      await tx.payrollRun.update({
        where: { id: runId },
        data: {
          calculatedAt: new Date(),
          ...(approve
            ? {
                status: PayrollStatus.APPROVED,
                approvedById: approve.approvedById,
                approvedAt: new Date(),
              }
            : {}),
        },
        select: { id: true },
      });
      return true;
    });
  }

  /**
   * Adds an adjustment and updates its employee's line from all of that employee's adjustments
   * (`recompute`). Returns false when the run was no longer DRAFT.
   */
  async addAdjustment(
    runId: string,
    data: { employeeId: string; type: AdjustmentType; amount: number; reason: string },
    createdById: string | null,
    recompute: (line: LineRow, adjustments: AdjustmentRow[]) => LineAdjustmentUpdate,
  ): Promise<boolean> {
    return this.txHost.withTransaction(async () => {
      const tx = this.txHost.tx;
      if (!(await this.claimDraft(tx, runId))) return false;
      await tx.payrollAdjustment.create({
        data: { ...data, runId, createdById },
        select: { id: true },
      });
      await this.updateLineAdjustments(tx, runId, data.employeeId, recompute);
      return true;
    });
  }

  /** Deletes an adjustment and updates its employee's line. False when the run wasn't DRAFT. */
  async deleteAdjustment(
    runId: string,
    adjustment: { id: string; employeeId: string },
    recompute: (line: LineRow, adjustments: AdjustmentRow[]) => LineAdjustmentUpdate,
  ): Promise<boolean> {
    return this.txHost.withTransaction(async () => {
      const tx = this.txHost.tx;
      if (!(await this.claimDraft(tx, runId))) return false;
      await tx.payrollAdjustment.deleteMany({ where: { id: adjustment.id, runId } });
      await this.updateLineAdjustments(tx, runId, adjustment.employeeId, recompute);
      return true;
    });
  }

  /** Locks the run row for this transaction if it is still DRAFT. */
  private async claimDraft(tx: Tx, runId: string): Promise<boolean> {
    const { count } = await tx.payrollRun.updateMany({
      where: { id: runId, status: PayrollStatus.DRAFT },
      data: { updatedAt: new Date() },
    });
    return count === 1;
  }

  private async updateLineAdjustments(
    tx: Tx,
    runId: string,
    employeeId: string,
    recompute: (line: LineRow, adjustments: AdjustmentRow[]) => LineAdjustmentUpdate,
  ): Promise<void> {
    const line = await tx.payrollLine.findUnique({
      where: { runId_employeeId: { runId, employeeId } },
      select: LINE_SELECT,
    });
    // An adjustment whose employee left the run keeps no line to update (recalculate removed it).
    if (!line) return;
    const adjustments = await tx.payrollAdjustment.findMany({
      where: { runId, employeeId },
      select: ADJUSTMENT_SELECT,
    });
    await tx.payrollLine.update({
      where: { id: line.id },
      data: recompute(line, adjustments),
      select: { id: true },
    });
  }
}
