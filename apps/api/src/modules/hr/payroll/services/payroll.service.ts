import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ErrorCode,
  HrEvent,
  PayrollFlag,
  PayrollStatus,
  type Language,
  type Month,
  type Paginated,
  type PayrollAdjustment,
  type PayrollApprovedEvent,
  type PayrollLine,
  type PayrollRun,
  type PayrollRunSummary,
  type EmployeePayrollLine,
  type Payslip,
  type Uuid,
} from '@school-erp/shared';
import { SettingsService } from '../../../../core/settings';
import { CodedException } from '../../../../common/errors/coded.exception';
import type { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';
import {
  calculateLine,
  deductedDays,
  lineNetWithFlags,
  penaltyShare,
  sumAdjustments,
} from '../../domain';
import { EmployeesService } from '../../employees/services/employees.service';
import { PenaltyRecordsService } from '../../penalties/services/penalty-records.service';
import { HrSettingsService } from '../../settings/hr-settings.service';
import { LatenessService } from '../../staff-attendance/services/lateness.service';
import { buildBankSheet } from '../bank-sheet';
import type { CreateAdjustmentDto, PayrollRunQueryDto } from '../dto/payroll.dto';
import {
  PayrollRunsRepository,
  type AdjustmentRow,
  type LineData,
  type LineRow,
  type RunRow,
} from '../repositories/payroll-runs.repository';

const conflict = (code: ErrorCode) => new CodedException(HttpStatus.CONFLICT, code);

function toLine(row: LineRow): PayrollLine {
  return {
    ...row,
    penaltyDays: Number(row.penaltyDays),
    latenessDays: Number(row.latenessDays),
    flags: row.flags as PayrollFlag[],
  };
}

/** `applied` is false when the adjustment's employee no longer has a line in the run. */
function toAdjustment(row: AdjustmentRow, inRun: ReadonlySet<string>): PayrollAdjustment {
  const { employee, ...rest } = row;
  return {
    ...rest,
    employeeCode: employee.code,
    nameEn: employee.nameEn,
    nameAr: employee.nameAr,
    createdAt: row.createdAt.toISOString(),
    applied: inRun.has(row.employeeId),
  };
}

/** A line's adjustment sums, net and flags after its adjustments changed (rest unchanged). */
function withAdjustments(line: LineRow, adjustments: readonly AdjustmentRow[]) {
  const { additions, deductions } = sumAdjustments(adjustments);
  const { net, flags } = lineNetWithFlags(
    {
      monthSalary: line.monthSalary,
      penaltyAmount: line.penaltyAmount,
      latenessAmount: line.latenessAmount,
      adjustmentAdditions: additions,
      adjustmentDeductions: deductions,
    },
    line.flags.includes(PayrollFlag.PENDING_PENALTIES),
  );
  return { adjustmentAdditions: additions, adjustmentDeductions: deductions, net, flags };
}

/**
 * Monthly payroll runs (§6). One run per month, DRAFT until approved. Lines snapshot the
 * employee and are calculated from the current penalties, lateness, adjustments and settings
 * whenever the run is created, recalculated or approved; an APPROVED run (and its month's
 * penalties, lateness and adjustments) never changes again.
 */
@Injectable()
export class PayrollService {
  constructor(
    private readonly repository: PayrollRunsRepository,
    private readonly employees: EmployeesService,
    private readonly penalties: PenaltyRecordsService,
    private readonly lateness: LatenessService,
    private readonly hrSettings: HrSettingsService,
    private readonly schoolSettings: SettingsService,
    private readonly events: EventEmitter2,
  ) {}

  async list(query: PaginationQueryDto): Promise<Paginated<PayrollRunSummary>> {
    const result = await this.repository.list(query.page, query.limit);
    const totals = await this.repository.totalsFor(result.data.map((r) => r.id));
    return { ...result, data: result.data.map((run) => this.toSummary(run, totals.get(run.id)!)) };
  }

  /**
   * A run with its totals (all lines), the lines matching the filters and — on a draft — the live
   * count of PENDING penalties dated in its month (0 on an approved run, whose month is locked).
   */
  async get(id: Uuid, query: PayrollRunQueryDto = {}): Promise<PayrollRun> {
    const run = await this.findRun(id);
    const [totals, lines, adjustments, inRun, pendingPenalties] = await Promise.all([
      this.repository.totalsFor([id]),
      this.repository.findLines(id, query),
      this.repository.findAdjustments(id),
      this.repository.lineEmployeeIds(id),
      run.status === PayrollStatus.DRAFT ? this.penalties.pendingCountInMonth(run.month) : 0,
    ]);
    return {
      ...this.toSummary(run, totals.get(id)!),
      pendingPenalties,
      lines: lines.map(toLine),
      adjustments: adjustments.map((a) => toAdjustment(a, inRun)),
    };
  }

  /** An employee's line in each run, newest month first (profile Payroll tab). 404 if unknown. */
  async employeeLines(
    employeeId: Uuid,
    query: PaginationQueryDto,
  ): Promise<Paginated<EmployeePayrollLine>> {
    await this.employees.get(employeeId);
    const result = await this.repository.listEmployeeLines(employeeId, query.page, query.limit);
    return {
      ...result,
      data: result.data.map((row) => ({
        runId: row.run.id,
        lineId: row.id,
        month: row.run.month,
        status: row.run.status,
        net: row.net,
      })),
    };
  }

  /** The run of a month with its net, or null (dashboard). */
  async monthSummary(month: Month): Promise<PayrollRunSummary | null> {
    const run = await this.repository.findByMonth(month);
    if (!run) return null;
    const totals = await this.repository.totalsFor([run.id]);
    return this.toSummary(run, totals.get(run.id)!);
  }

  /** A DRAFT run for the month with one line per ACTIVE employee. 409 if the month has one. */
  async create(month: Month, createdById: Uuid | null): Promise<PayrollRun> {
    if (await this.repository.findByMonth(month)) throw conflict(ErrorCode.PAYROLL_RUN_EXISTS);
    const lines = await this.buildLines(month, []);
    const id = await this.repository.createRun(month, createdById, lines);
    // Two creates for one month at once: the unique month decides, the loser gets the 409.
    if (!id) throw conflict(ErrorCode.PAYROLL_RUN_EXISTS);
    return this.get(id);
  }

  /** Rebuilds every line of a DRAFT run from current data; adjustments survive. */
  async recalculate(id: Uuid): Promise<PayrollRun> {
    const run = await this.findDraft(id);
    const lines = await this.buildLines(run.month, await this.repository.findAdjustments(id));
    if (!(await this.repository.replaceLines(id, lines)))
      throw conflict(ErrorCode.PAYROLL_APPROVED);
    return this.get(id);
  }

  /**
   * DRAFT → APPROVED: recalculates the lines from current data and locks the run (and with it the
   * month's penalties, lateness and adjustments) in one transaction. Refused with 409
   * `PENDING_PENALTIES` while a penalty dated in the month is pending. Emits `payroll.approved`
   * after the commit.
   */
  async approve(id: Uuid, approvedById: Uuid | null): Promise<PayrollRun> {
    const run = await this.findDraft(id);
    const inputs = await this.penalties.payrollInputs(run.month);
    if (inputs.pending.size > 0) throw conflict(ErrorCode.PENDING_PENALTIES);

    const lines = await this.buildLines(run.month, await this.repository.findAdjustments(id));
    if (!(await this.repository.replaceLines(id, lines, { approvedById }))) {
      throw conflict(ErrorCode.PAYROLL_APPROVED);
    }
    const approved = await this.get(id);
    const event: PayrollApprovedEvent = {
      runId: id,
      month: approved.month,
      totals: approved.totals,
      approvedById,
      at: approved.approvedAt ?? new Date().toISOString(),
    };
    this.events.emit(HrEvent.PAYROLL_APPROVED, event);
    return approved;
  }

  /** A one-off addition or deduction on a DRAFT run, for an employee in the run (§6). */
  async addAdjustment(
    id: Uuid,
    dto: CreateAdjustmentDto,
    createdById: Uuid | null,
  ): Promise<PayrollRun> {
    await this.findDraft(id);
    if (!(await this.repository.findLineByEmployee(id, dto.employeeId))) {
      throw new CodedException(HttpStatus.BAD_REQUEST, ErrorCode.EMPLOYEE_NOT_IN_RUN);
    }
    const added = await this.repository.addAdjustment(
      id,
      { employeeId: dto.employeeId, type: dto.type, amount: dto.amount, reason: dto.reason },
      createdById,
      withAdjustments,
    );
    if (!added) throw conflict(ErrorCode.PAYROLL_APPROVED);
    return this.get(id);
  }

  async removeAdjustment(id: Uuid, adjustmentId: Uuid): Promise<PayrollRun> {
    await this.findDraft(id);
    const adjustment = await this.repository.findAdjustment(id, adjustmentId);
    if (!adjustment) throw new NotFoundException();
    if (!(await this.repository.deleteAdjustment(id, adjustment, withAdjustments))) {
      throw conflict(ErrorCode.PAYROLL_APPROVED);
    }
    return this.get(id);
  }

  /** Payslip data for one line of an APPROVED run (409 `PAYROLL_NOT_APPROVED` on a draft). */
  async payslip(id: Uuid, lineId: Uuid): Promise<Payslip> {
    const run = await this.findApproved(id);
    const row = await this.repository.findLine(id, lineId);
    if (!row) throw new NotFoundException();
    const line = toLine(row);
    const [penalties, adjustments, school] = await Promise.all([
      this.penalties.approvedInMonth(run.month, line.employeeId),
      this.repository.findAdjustments(id, line.employeeId),
      this.schoolSettings.getSchoolSettings(),
    ]);
    return {
      ...line,
      month: run.month,
      penalties: penalties.map((p) => ({
        ...p,
        amount: penaltyShare(deductedDays(p.action, p.days), line.penaltyDays, line.penaltyAmount),
      })),
      adjustments: adjustments.map((a) => ({ type: a.type, amount: a.amount, reason: a.reason })),
      school: { nameEn: school.nameEn, nameAr: school.nameAr, logoUrl: school.logoUrl },
    };
  }

  /** The id of a month's APPROVED run, or null (no run, or still a draft). For accounting (§10). */
  async approvedRunIdForMonth(month: Month): Promise<Uuid | null> {
    const run = await this.repository.findByMonth(month);
    return run?.status === PayrollStatus.APPROVED ? run.id : null;
  }

  /** The `.xlsx` bank sheet of an APPROVED run, with its file name. */
  async bankSheet(id: Uuid, lang: Language): Promise<{ fileName: string; content: Buffer }> {
    const run = await this.findApproved(id);
    const lines = await this.repository.findLines(id);
    return {
      fileName: `bank-sheet-${run.month}.xlsx`,
      content: await buildBankSheet(lines, lang),
    };
  }

  /**
   * One line per ACTIVE employee (§6), from the employee snapshot, the month's approved deducting
   * penalties and pending count, lateness minutes under today's rule, the run's adjustments and
   * today's payroll settings.
   */
  private async buildLines(
    month: Month,
    adjustments: readonly AdjustmentRow[],
  ): Promise<LineData[]> {
    const [employees, penalties, lateness, settings] = await Promise.all([
      this.employees.listActiveForPayroll(),
      this.penalties.payrollInputs(month),
      this.lateness.list(month),
      this.hrSettings.get(),
    ]);
    const latenessOf = new Map(lateness.map((l) => [l.employee.id, l]));
    return employees.map((e) => {
      const late = latenessOf.get(e.id);
      const amounts = calculateLine(
        {
          basicSalary: e.basicSalary,
          workSystem: e.workSystem,
          penaltyDays: penalties.deductingDays.get(e.id) ?? [],
          latenessDays: late?.days ?? 0,
          adjustments: adjustments.filter((a) => a.employeeId === e.id),
          pendingPenalties: penalties.pending.get(e.id) ?? 0,
        },
        settings.payroll,
      );
      return {
        employeeId: e.id,
        employeeCode: e.code,
        nameEn: e.nameEn,
        nameAr: e.nameAr,
        nationalId: e.nationalId,
        departmentId: e.departmentId,
        departmentNameEn: e.department.nameEn,
        departmentNameAr: e.department.nameAr,
        basicSalary: e.basicSalary,
        workSystem: e.workSystem,
        latenessMinutes: late?.minutes ?? 0,
        ...amounts,
      };
    });
  }

  private toSummary(run: RunRow, totals: PayrollRunSummary['totals']): PayrollRunSummary {
    return {
      id: run.id,
      month: run.month,
      status: run.status,
      totals,
      approvedAt: run.approvedAt?.toISOString() ?? null,
    };
  }

  private async findRun(id: Uuid): Promise<RunRow> {
    const run = await this.repository.findRun(id);
    if (!run) throw new NotFoundException();
    return run;
  }

  private async findDraft(id: Uuid): Promise<RunRow> {
    const run = await this.findRun(id);
    if (run.status !== PayrollStatus.DRAFT) throw conflict(ErrorCode.PAYROLL_APPROVED);
    return run;
  }

  private async findApproved(id: Uuid): Promise<RunRow> {
    const run = await this.findRun(id);
    if (run.status !== PayrollStatus.APPROVED) throw conflict(ErrorCode.PAYROLL_NOT_APPROVED);
    return run;
  }
}
