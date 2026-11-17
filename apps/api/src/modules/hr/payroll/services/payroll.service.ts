import { ForbiddenException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ErrorCode,
  HrEvent,
  PAYROLL_LINE_MONEY_FIELDS,
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
  type PayrollTotals,
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
import {
  covers,
  employeeWhere,
  withoutFields,
  type EmployeeScope,
} from '../../access/employee-scope.pure';
import { HrAccessService, VIEW_SALARY } from '../../access/hr-access.service';
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

/** A run's money totals (R7): left out together with the lines' money when not visible. */
const TOTALS_MONEY_FIELDS = [
  'monthSalary',
  'penaltyAmount',
  'latenessAmount',
  'adjustmentAdditions',
  'adjustmentDeductions',
  'net',
] as const satisfies readonly (keyof PayrollTotals)[];

/** A line; its money (`PAYROLL_LINE_MONEY_FIELDS`) left out unless `salaryVisible` (R7). */
function toLine(row: LineRow, salaryVisible: boolean): PayrollLine {
  const line = {
    ...row,
    penaltyDays: Number(row.penaltyDays),
    latenessDays: Number(row.latenessDays),
    flags: row.flags as PayrollFlag[],
  };
  return { ...withoutFields(line, PAYROLL_LINE_MONEY_FIELDS, salaryVisible), salaryVisible };
}

/**
 * `applied` is false when the adjustment's employee no longer has a line in the run. Its amount is
 * left out unless `salaryVisible` (R7).
 */
function toAdjustment(
  row: AdjustmentRow,
  inRun: ReadonlySet<string>,
  salaryVisible: boolean,
): PayrollAdjustment {
  const { employee, ...rest } = row;
  return {
    ...withoutFields(rest, ['amount'], salaryVisible),
    salaryVisible,
    employeeCode: employee.code,
    nameEn: employee.nameEn,
    nameAr: employee.nameAr,
    createdAt: row.createdAt.toISOString(),
    applied: inRun.has(row.employeeId),
  };
}

/** What the viewer may see of payroll (R5, R7): whose lines, and whose pay. */
interface PayrollView {
  /** The employees `hr.payroll.view` covers: their lines, adjustments and payslips. */
  lines: EmployeeScope;
  /** The employees `hr.employees.view_salary` covers: whose money is shown. */
  salary: EmployeeScope;
}

/**
 * Whether a run's totals show money (R7, P4): always for the whole school (`hr.payroll.view` at
 * scope `all` — a school total gives no one's pay away; the principal's "payroll totals"); for a
 * narrower view only when the viewer's salary scope covers all of it (a team's total would).
 */
export function totalsMoneyVisible(view: PayrollView): boolean {
  return view.lines.kind === 'all' || covers(view.salary, view.lines);
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
    private readonly access: HrAccessService,
  ) {}

  /** Every run (runs are school-wide); totals over the lines the viewer may see (R5, R7). */
  async list(query: PaginationQueryDto): Promise<Paginated<PayrollRunSummary>> {
    const view = await this.view();
    const result = await this.repository.list(query.page, query.limit);
    const totals = await this.repository.totalsFor(
      result.data.map((r) => r.id),
      employeeWhere(view.lines),
    );
    return {
      ...result,
      data: result.data.map((run) => this.toSummary(run, totals.get(run.id)!, view)),
    };
  }

  /**
   * A run with its totals (all lines), the lines matching the filters and — on a draft — the live
   * count of PENDING penalties dated in its month (0 on an approved run, whose month is locked).
   */
  /**
   * Only the lines and adjustments of the employees the viewer's `hr.payroll.view` covers (R5),
   * each with money only where their salary scope covers the employee (R7).
   */
  async get(id: Uuid, query: PayrollRunQueryDto = {}): Promise<PayrollRun> {
    const run = await this.findRun(id);
    const view = await this.view();
    const scope = employeeWhere(view.lines);
    const [totals, lines, adjustments, inRun, pendingPenalties] = await Promise.all([
      this.repository.totalsFor([id], scope),
      this.repository.findLines(id, query, scope),
      this.repository.findAdjustments(id, undefined, scope),
      this.repository.lineEmployeeIds(id),
      run.status === PayrollStatus.DRAFT ? this.penalties.pendingCountInMonth(run.month) : 0,
    ]);
    const paid = await this.salaryVisibleFor(
      view,
      [...lines.map((l) => l.employeeId), ...adjustments.map((a) => a.employeeId)],
    );
    return {
      ...this.toSummary(run, totals.get(id)!, view),
      pendingPenalties,
      lines: lines.map((l) => toLine(l, paid.has(l.employeeId))),
      adjustments: adjustments.map((a) => toAdjustment(a, inRun, paid.has(a.employeeId))),
    };
  }

  /**
   * An employee's line in each run, newest month first (profile Payroll tab). 404 if unknown or
   * outside the viewer's `hr.payroll.view` scope (edge case 3); `net` only with their salary (R7).
   */
  async employeeLines(
    employeeId: Uuid,
    query: PaginationQueryDto,
  ): Promise<Paginated<EmployeePayrollLine>> {
    await this.employees.assertInScope('hr.payroll.view', employeeId);
    const [result, paid] = await Promise.all([
      this.repository.listEmployeeLines(employeeId, query.page, query.limit),
      this.employees.filterInScope(VIEW_SALARY, [employeeId]),
    ]);
    const salaryVisible = paid.has(employeeId);
    return {
      ...result,
      data: result.data.map((row) => ({
        runId: row.run.id,
        lineId: row.id,
        month: row.run.month,
        status: row.run.status,
        salaryVisible,
        ...(salaryVisible ? { net: row.net } : {}),
      })),
    };
  }

  /** The run of a month with its net, or null (dashboard) — totals as `list` shows them. */
  async monthSummary(month: Month): Promise<PayrollRunSummary | null> {
    const run = await this.repository.findByMonth(month);
    if (!run) return null;
    const view = await this.view();
    const totals = await this.repository.totalsFor([run.id], employeeWhere(view.lines));
    return this.toSummary(run, totals.get(run.id)!, view);
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
    const [approved, wholeRun] = await Promise.all([this.get(id), this.repository.totalsFor([id])]);
    const event: PayrollApprovedEvent = {
      runId: id,
      month: approved.month,
      // The whole run's totals, whatever the approver may see (listeners need the real figures).
      totals: wholeRun.get(id)!,
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
  /**
   * Payslip data for one line of an APPROVED run (409 `PAYROLL_NOT_APPROVED` on a draft). 404 when
   * the line's employee is outside the viewer's `hr.payroll.view` scope (edge case 3); every amount
   * is left out unless their salary scope covers the employee (R7).
   */
  async payslip(id: Uuid, lineId: Uuid): Promise<Payslip> {
    const run = await this.findApproved(id);
    const view = await this.view();
    const row = await this.repository.findLine(id, lineId, employeeWhere(view.lines));
    if (!row) throw new NotFoundException();
    const salaryVisible = (await this.salaryVisibleFor(view, [row.employeeId])).has(row.employeeId);
    const [penalties, adjustments, school] = await Promise.all([
      this.penalties.approvedInMonth(run.month, row.employeeId),
      this.repository.findAdjustments(id, row.employeeId),
      this.schoolSettings.getSchoolSettings(),
    ]);
    const penaltyDays = Number(row.penaltyDays);
    return {
      ...toLine(row, salaryVisible),
      month: run.month,
      penalties: penalties.map((p) => ({
        ...p,
        ...(salaryVisible
          ? { amount: penaltyShare(deductedDays(p.action, p.days), penaltyDays, row.penaltyAmount) }
          : {}),
      })),
      adjustments: adjustments.map((a) => ({
        type: a.type,
        reason: a.reason,
        ...(salaryVisible ? { amount: a.amount } : {}),
      })),
      school: { nameEn: school.nameEn, nameAr: school.nameAr, logoUrl: school.logoUrl },
    };
  }

  /**
   * The `.xlsx` bank sheet of an APPROVED run, with its file name. It lists every employee's net,
   * so it also needs every salary (`hr.employees.view_salary` at scope `all`, R7) — 403 otherwise.
   */
  async bankSheet(id: Uuid, lang: Language): Promise<{ fileName: string; content: Buffer }> {
    if ((await this.access.salaryScope()).kind !== 'all') throw new ForbiddenException();
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

  private toSummary(
    run: RunRow,
    totals: PayrollTotals,
    view: PayrollView,
  ): PayrollRunSummary {
    const salaryVisible = totalsMoneyVisible(view);
    return {
      id: run.id,
      month: run.month,
      status: run.status,
      salaryVisible,
      totals: withoutFields(totals, TOTALS_MONEY_FIELDS, salaryVisible),
      approvedAt: run.approvedAt?.toISOString() ?? null,
    };
  }

  private async view(): Promise<PayrollView> {
    const [lines, salary] = await Promise.all([
      this.access.scope('hr.payroll.view'),
      this.access.salaryScope(),
    ]);
    return { lines, salary };
  }

  /** Which of `employeeIds` the viewer's salary scope covers (one query; none when it's `all`). */
  private async salaryVisibleFor(view: PayrollView, employeeIds: readonly Uuid[]): Promise<Set<Uuid>> {
    if (view.salary.kind === 'all') return new Set(employeeIds);
    if (view.salary.kind === 'none') return new Set();
    return this.employees.filterInScope(VIEW_SALARY, employeeIds);
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
