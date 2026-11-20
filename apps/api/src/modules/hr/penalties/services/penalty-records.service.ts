import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import {
  AuditEntityType,
  ErrorCode,
  PenaltyStatus,
  type AuditAction,
  type Days,
  type IsoDate,
  type Month,
  type Paginated,
  type PayslipPenalty,
  type PenaltyPreview,
  type PenaltyRecord,
  type PenaltyRecountAcknowledgement,
  type PenaltyRecountChange,
  type PenaltyRecountConflict,
  type RepetitionWindow,
  type Uuid,
} from '@school-erp/shared';
import { CodedException } from '../../../../common/errors/coded.exception';
import { AuditService } from '../../../../core/audit';
import { AfterCommit } from '../../../../database/transactions';
import { monthOf, toIsoDate } from '../../../../common/utils/dates.util';
import {
  countPriorInWindow,
  deductedDays,
  earlierPendingPenalty,
  oncePerDayRefuses,
  recountAcknowledged,
  recountAfterApproval,
  recountLockedMonth,
  repetitionWindowStart,
  resolvePenalty,
  type CatalogueLevel,
  type PenaltyTarget,
  type RecountChange,
} from '../../domain';
import { HrAccessService } from '../../access/hr-access.service';
import { EmployeesService } from '../../employees/services/employees.service';
import { MonthLockService } from '../../month-lock/month-lock.service';
import { HrNotificationsService } from '../../notifications/hr-notifications.service';
import { HrSettingsService } from '../../settings/hr-settings.service';
import type {
  CancelPenaltyDto,
  CreatePenaltyDto,
  ListPenaltiesQueryDto,
  PenaltyPreviewQueryDto,
} from '../dto/penalty.dto';
import {
  PenaltyRecordsRepository,
  type ApprovedCandidate,
  type RecordRow,
  type RepeatKey,
} from '../repositories/penalty-records.repository';
import { PenaltyCatalogueService, toLevel } from './penalty-catalogue.service';

const keyOf = (k: RepeatKey) => `${k.employeeId}:${k.violationId}`;

/** A month's penalties as payroll counts them (see `payrollInputs`). */
export interface MonthPenaltyInputs {
  /** Employee → fixed days of each approved deducting penalty dated in the month. */
  deductingDays: Map<Uuid, Days[]>;
  /** Employee → number of pending penalties dated in the month. */
  pending: Map<Uuid, number>;
}

/** An approved penalty as the payslip itemises it (before its amount is worked out). */
export type ApprovedMonthPenalty = Omit<PayslipPenalty, 'amount'>;

/** What a row shows besides its stored fields: level / action / days, and what blocks approving it. */
interface Shown extends CatalogueLevel {
  earlierPending: PenaltyRecord['earlierPending'];
  recount: PenaltyRecountChange[];
  recountLockedMonth: Month | null;
}

/** A domain recount change → the contract's shape. */
const toChange = (c: RecountChange<ApprovedCandidate>): PenaltyRecountChange => ({
  id: c.record.id,
  date: c.record.date,
  before: c.before,
  after: c.after,
});

/** A record row → the contract shape, with `shown` (level / action / days, blocker) applied. */
function toRecord(row: RecordRow, shown: Shown): PenaltyRecord {
  return {
    id: row.id,
    employee: row.employee,
    violation: { id: row.violation.id, nameEn: row.violation.nameEn, nameAr: row.violation.nameAr },
    date: toIsoDate(row.date),
    level: shown.level,
    action: shown.action,
    days: shown.days,
    status: row.status,
    note: row.note,
    cancelReason: row.cancelReason,
    createdBy: row.createdBy,
    approvedBy: row.approvedBy,
    createdAt: row.createdAt.toISOString(),
    earlierPending: shown.earlierPending,
    recount: shown.recount,
    recountLockedMonth: shown.recountLockedMonth,
  };
}

/** A recorded penalty's place in the repeat order (§4): date, then when recorded, then id. */
const positionOf = (row: RecordRow): PenaltyTarget => ({
  employeeId: row.employeeId,
  violationId: row.violationId,
  id: row.id,
  date: toIsoDate(row.date),
  recordedAt: row.createdAt,
});

/** What a non-pending record shows: the level, action and days stored on it. */
const storedLevel = (row: RecordRow): CatalogueLevel => toLevel(row);

/** A non-pending record: its stored level, and nothing blocks it (it isn't waiting for approval). */
const storedShown = (row: RecordRow): Shown => ({
  ...storedLevel(row),
  earlierPending: null,
  recount: [],
  recountLockedMonth: null,
});

/**
 * A record as its audit entries store it (§9): the violation by its two names, not its id, and the
 * level, action and days stored on it (fixed at recording, then at approval). The employee is the
 * entry's label, so not a line of its own (it would repeat the sentence — the screen check of
 * #126). No money: a penalty is days, priced only by payroll.
 */
function penaltyAuditSnapshot(row: RecordRow) {
  const { level, action, days } = storedLevel(row);
  return {
    violationId: { nameEn: row.violation.nameEn, nameAr: row.violation.nameAr },
    date: toIsoDate(row.date),
    level,
    action,
    days,
    status: row.status,
    note: row.note,
    cancelReason: row.cancelReason,
  };
}

/**
 * Penalty records (§4). Level = 1 + APPROVED records of the same violation and employee inside
 * the repetition window that come earlier: an earlier violation date, or the same date and recorded
 * earlier (a not-yet-recorded penalty comes after every same-date one). A PENDING record is shown with today's
 * catalogue and count; approval computes the level again and fixes level, action and days.
 * Recording, approving and cancelling need the record's month to be open (409 PAYROLL_APPROVED).
 * Never deleted: cancelled with a reason instead, and a cancelled record is final.
 * A "once per day" violation takes at most one pending or approved record per employee per date
 * (409 VIOLATION_ONCE_PER_DAY at preview, recording and approval; a cancelled one frees the day).
 * Approving goes in date order (§4, owner 2026-11-20): while an earlier record of the same pair
 * (in the window) is still PENDING, approval is refused (409 PENALTY_EARLIER_PENDING, `params.date`),
 * checked under the pair's lock; a pending row carries that blocker as `earlierPending`.
 * Recording, approving and cancelling are each one audit entry (§9) on the penalty, labelled with
 * the employee's two names, written in the change's transaction; a refused write records nothing.
 *
 * A backdated penalty (§4, owner 2026-11-20 — the one exception to "approved levels are never
 * recomputed"): approving it moves each later APPROVED penalty of the pair in the window up one
 * level, with that level's action and days from today's catalogue (`recountAfterApproval`), in the
 * approval's transaction and under the pair's lock. The preview, the record (`recount`) and the
 * approve confirmation list those changes first; approving needs them confirmed
 * (`acknowledgedRecount`: 409 PENALTY_RECOUNT_UNCONFIRMED / PENALTY_RECOUNT_CHANGED with the fresh
 * list as `data`). One of them in an approved payroll month refuses the preview, the recording and
 * the approval (409 PENALTY_RECOUNT_MONTH_LOCKED, `params.month`). Each recounted penalty gets its
 * own `hr.penalty.recount` audit entry. No notification: no existing type fits.
 */
@Injectable()
export class PenaltyRecordsService {
  constructor(
    private readonly repository: PenaltyRecordsRepository,
    private readonly catalogue: PenaltyCatalogueService,
    private readonly employees: EmployeesService,
    private readonly settings: HrSettingsService,
    private readonly monthLock: MonthLockService,
    private readonly access: HrAccessService,
    private readonly audit: AuditService,
    private readonly tx: AfterCommit,
    private readonly notifications: HrNotificationsService,
  ) {}

  /** The records of the employees `hr.penalties.view` covers for the user (R5). */
  async list(query: ListPenaltiesQueryDto): Promise<Paginated<PenaltyRecord>> {
    const result = await this.repository.list(
      query.page,
      query.limit,
      {
        employeeId: query.employeeId,
        month: query.month,
        status: query.status,
        search: query.search,
      },
      await this.access.where('hr.penalties.view'),
    );
    const shown = await this.shownLevels(result.data);
    return { ...result, data: result.data.map((row) => toRecord(row, shown.get(row.id)!)) };
  }

  /** 404 when unknown or its employee is outside the user's `hr.penalties.view` scope (edge case 3). */
  async get(id: Uuid): Promise<PenaltyRecord> {
    const row = await this.repository.findOne(id, await this.access.where('hr.penalties.view'));
    if (!row) throw new NotFoundException();
    return this.present(row);
  }

  /** What recording this penalty now would give. Nothing is saved. */
  async preview(query: PenaltyPreviewQueryDto): Promise<PenaltyPreview> {
    const { levels, oncePerDay } = await this.assertRecordable(query.employeeId, query.violationId);
    // §4: say before submitting that the day is taken (the same check `create` makes).
    if (oncePerDay) {
      const sameDay = await this.repository.sameDayStatuses(query, query.date);
      if (oncePerDayRefuses(oncePerDay, sameDay, 'record')) this.throwOncePerDay();
    }
    const window = await this.window();
    const pair = await this.pairRecords(query, query.date, window);
    const priorCount = countPriorInWindow({ ...query, date: query.date }, window, pair);
    const { level, action, days } = resolvePenalty(priorCount, levels);
    // §4 backdated: say before saving what approving it would change, or that it can't be.
    const recount = await this.assertRecountOpen(
      recountAfterApproval({ ...query, date: query.date }, window, pair, levels),
    );
    return { level, action, days, priorCount, recount: recount.map(toChange) };
  }

  async create(dto: CreatePenaltyDto, createdById: Uuid | null): Promise<PenaltyRecord> {
    // The record and its audit entry commit together (audit D2).
    return this.tx.inTransaction(() => this.createInTransaction(dto, createdById));
  }

  private async createInTransaction(dto: CreatePenaltyDto, createdById: Uuid | null): Promise<PenaltyRecord> {
    const { levels, oncePerDay } = await this.assertRecordable(dto.employeeId, dto.violationId);
    await this.monthLock.assertMonthOpen(monthOf(dto.date));
    const window = await this.window();
    const pair = await this.pairRecords(dto, dto.date, window);
    const priorCount = countPriorInWindow({ ...dto, date: dto.date }, window, pair);
    // §4 backdated: refused when approving it could never happen (a recount in an approved month).
    await this.assertRecountOpen(recountAfterApproval({ ...dto, date: dto.date }, window, pair, levels));
    const row = await this.repository.createRecord(
      {
        employeeId: dto.employeeId,
        violationId: dto.violationId,
        date: dto.date,
        note: dto.note ?? null,
        createdById,
        ...resolvePenalty(priorCount, levels),
      },
      (sameDay) => oncePerDayRefuses(oncePerDay, sameDay, 'record'),
    );
    if (!row) this.throwOncePerDay();
    await this.record('hr.penalty.record', null, row);
    const recorded = await this.present(row);
    // In the same transaction (§11, N4): a refused or rolled-back recording tells no one.
    await this.notifications.penaltyRecorded({ ...recorded, month: monthOf(dto.date) }, createdById);
    return recorded;
  }

  /**
   * PENDING → APPROVED, fixing level, action and days from today's catalogue and count. A
   * backdated one also moves the later approved ones up — only as `acknowledgedRecount` confirms.
   */
  async approve(
    id: Uuid,
    approvedById: Uuid | null,
    acknowledgedRecount?: PenaltyRecountAcknowledgement[],
  ): Promise<PenaltyRecord> {
    return this.tx.inTransaction(() => this.approveInTransaction(id, approvedById, acknowledgedRecount));
  }

  private async approveInTransaction(
    id: Uuid,
    approvedById: Uuid | null,
    acknowledgedRecount: PenaltyRecountAcknowledgement[] | undefined,
  ): Promise<PenaltyRecord> {
    // Outside the user's `hr.penalties.approve` scope → 404, like an unknown record (R5).
    const current = await this.repository.findOne(id, await this.access.where('hr.penalties.approve'));
    if (!current) throw new NotFoundException();
    this.assertNotCancelled(current.status);
    if (current.status !== PenaltyStatus.PENDING) {
      throw new CodedException(HttpStatus.CONFLICT, ErrorCode.PENALTY_NOT_PENDING);
    }
    const date = toIsoDate(current.date);
    await this.monthLock.assertMonthOpen(monthOf(date));

    const levels = current.violation.levels.map(toLevel);
    const window = await this.window();
    const oncePerDay = current.violation.oncePerDay;
    let recounted: RecountChange<ApprovedCandidate>[] = [];
    const outcome = await this.repository.approve(
      id,
      current,
      { from: repetitionWindowStart(date, window), upTo: date },
      approvedById,
      (approved) => resolvePenalty(countPriorInWindow(positionOf(current), window, approved), levels),
      // §4: re-checked at approval, in the same transaction.
      (sameDay) => oncePerDayRefuses(oncePerDay, sameDay, 'approve'),
      // §4: approve in date order — an earlier pending one of the pair goes first.
      (pairRecords) => earlierPendingPenalty(positionOf(current), window, pairRecords),
      // §4 backdated: the later approved ones move up — not in an approved month, and only as
      // confirmed. Worked out under the lock, so the list is what is written.
      async (pairRecords) => {
        const changes = await this.assertRecountOpen(
          recountAfterApproval(positionOf(current), window, pairRecords, levels),
        );
        if (!recountAcknowledged(changes, acknowledgedRecount)) {
          const code =
            acknowledgedRecount === undefined
              ? ErrorCode.PENALTY_RECOUNT_UNCONFIRMED
              : ErrorCode.PENALTY_RECOUNT_CHANGED;
          const data: PenaltyRecountConflict = { recount: changes.map(toChange) };
          throw CodedException.withData(HttpStatus.CONFLICT, code, { count: changes.length }, data);
        }
        recounted = changes;
        return changes.map((c) => ({ id: c.record.id, fromLevel: c.before.level, ...c.after }));
      },
    );
    if (outcome === 'ONCE_PER_DAY') this.throwOncePerDay();
    if (typeof outcome === 'object') {
      throw CodedException.withParams(HttpStatus.CONFLICT, ErrorCode.PENALTY_EARLIER_PENDING, {
        date: outcome.earlierPending,
      });
    }
    if (outcome === 'NOT_PENDING') await this.throwStatusConflict(id);
    await this.record('hr.penalty.approve', current, await this.findWritten(id));
    for (const change of recounted) await this.recordRecount(current, date, change);
    await this.notifications.penaltyApproved(id, approvedById);
    return this.get(id);
  }

  /** PENDING or APPROVED → CANCELLED with a reason. Other approved levels are not recomputed. */
  async cancel(
    id: Uuid,
    dto: CancelPenaltyDto,
    cancelledById: Uuid | null,
  ): Promise<PenaltyRecord> {
    return this.tx.inTransaction(() => this.cancelInTransaction(id, dto, cancelledById));
  }

  private async cancelInTransaction(
    id: Uuid,
    dto: CancelPenaltyDto,
    cancelledById: Uuid | null,
  ): Promise<PenaltyRecord> {
    // Outside the user's `hr.penalties.cancel` scope → 404, like an unknown record (R5).
    const current = await this.repository.findOne(id, await this.access.where('hr.penalties.cancel'));
    if (!current) throw new NotFoundException();
    this.assertNotCancelled(current.status);
    await this.monthLock.assertMonthOpen(monthOf(toIsoDate(current.date)));
    // Under the pair's lock: never between a backdated approval's recount and its writes.
    if (!(await this.repository.cancel(id, dto.reason, cancelledById, current))) {
      await this.throwStatusConflict(id);
    }
    await this.record('hr.penalty.cancel', current, await this.findWritten(id));
    if (current.status === PenaltyStatus.PENDING)
      await this.notifications.penaltyCancelled(id, cancelledById);
    return this.get(id);
  }

  /**
   * What payroll needs from a month's penalties (§4, §6): per employee, the FIXED days of each
   * APPROVED deducting penalty (day deduction, or investigation with days) dated in the month, and
   * how many PENDING penalties are dated in it. Cancelled records never count.
   */
  async payrollInputs(month: Month): Promise<MonthPenaltyInputs> {
    const rows = await this.repository.findForPayroll(month);
    const deductingDays = new Map<Uuid, Days[]>();
    const pending = new Map<Uuid, number>();
    for (const row of rows) {
      if (row.status === PenaltyStatus.PENDING) {
        pending.set(row.employeeId, (pending.get(row.employeeId) ?? 0) + 1);
        continue;
      }
      const days = deductedDays(row.action, row.days === null ? null : Number(row.days));
      if (days > 0)
        deductingDays.set(row.employeeId, [...(deductingDays.get(row.employeeId) ?? []), days]);
    }
    return { deductingDays, pending };
  }

  /**
   * Whether a penalty dated in `month` was recounted (§4 backdated penalty) after `since`: a draft
   * run calculated before then is due a Recalculate (§6).
   */
  recountedInMonthSince(month: Month, since: Date): Promise<boolean> {
    return this.repository.recountedInMonthSince(month, since);
  }

  /** How many penalties dated in a month are still PENDING right now (blocks payroll approval). */
  pendingCountInMonth(month: Month): Promise<number> {
    return this.repository.countPendingInMonth(month);
  }

  /** One employee's APPROVED penalties dated in a month, by date, as fixed at approval. */
  async approvedInMonth(month: Month, employeeId: Uuid): Promise<ApprovedMonthPenalty[]> {
    const rows = await this.repository.findApprovedForPayslip(month, employeeId);
    return rows.map((r) => ({
      date: toIsoDate(r.date),
      violationNameEn: r.violation.nameEn,
      violationNameAr: r.violation.nameAr,
      level: r.level,
      action: r.action,
      days: r.days === null ? null : Number(r.days),
    }));
  }

  /**
   * Pending and approved records dated in a month (dashboard: by violation date), of the employees
   * `hr.penalties.view` covers for the user (R5).
   */
  async monthCounts(month: Month): Promise<{ pending: number; approved: number }> {
    const counts = await this.repository.countByStatusInMonth(
      month,
      await this.access.where('hr.penalties.view'),
    );
    return { pending: counts.PENDING, approved: counts.APPROVED };
  }

  /** The ids of the records whose employee `hr.penalties.view` covers (Activity log, R5). */
  async idsInViewScope(): Promise<Uuid[] | 'all'> {
    const scope = await this.access.scope('hr.penalties.view');
    if (scope.kind === 'all') return 'all';
    return this.repository.findIdsInScope(await this.access.where('hr.penalties.view'));
  }

  /**
   * An employee's records (their History lists these records' entries too, audit log). The History
   * route takes any record id: one that isn't a UUID is no employee of ours, so it has none (and
   * never reaches the uuid column, which would refuse it).
   */
  async idsOfEmployee(employeeId: string): Promise<Uuid[]> {
    if (!isUUID(employeeId)) return [];
    return this.repository.findIdsOfEmployees({ employeeId });
  }

  /** The records of the employees whose code contains `q` (Activity's search). */
  idsWithEmployeeCode(q: string): Promise<Uuid[]> {
    return this.repository.findIdsOfEmployees({ code: q });
  }

  /**
   * §3: only an active employee; §4, §7: only a usable violation; R5: only an employee the user's
   * `hr.penalties.record` scope covers (else 404, edge case 3).
   */
  private async assertRecordable(employeeId: Uuid, violationId: Uuid) {
    // Scope first (edge case 3): outside `hr.penalties.record` → 404, whatever else is wrong.
    await this.employees.assertScopeFirst('hr.penalties.record', [employeeId]);
    // Unknown → 400 FOREIGN_KEY_VIOLATION; inactive → 409 EMPLOYEE_INACTIVE.
    await this.employees.assertActive([employeeId]);
    return this.catalogue.getUsable(violationId);
  }

  /**
   * One audit entry about the penalty, labelled with its employee's two names: only the fields
   * that changed (recording: every field, from nothing).
   */
  private record(action: AuditAction, before: RecordRow | null, after: RecordRow): Promise<void> {
    return this.audit.record({
      action,
      entity: {
        type: AuditEntityType.PENALTY,
        id: after.id,
        label: { en: after.employee.nameEn, ar: after.employee.nameAr },
      },
      before: before ? penaltyAuditSnapshot(before) : null,
      after: penaltyAuditSnapshot(after),
    });
  }

  /** The record as this transaction just wrote it (it exists: the write matched it). */
  private async findWritten(id: Uuid): Promise<RecordRow> {
    const row = await this.repository.findOne(id);
    if (!row) throw new NotFoundException();
    return row;
  }

  /** §4: a once-per-day violation already has a pending or approved penalty that day. */
  private throwOncePerDay(): never {
    throw new CodedException(HttpStatus.CONFLICT, ErrorCode.VIOLATION_ONCE_PER_DAY);
  }

  private assertNotCancelled(status: PenaltyStatus): void {
    if (status === PenaltyStatus.CANCELLED) {
      throw new CodedException(HttpStatus.CONFLICT, ErrorCode.PENALTY_CANCELLED);
    }
  }

  /** A conditional status update matched nothing: someone changed the record meanwhile. */
  private async throwStatusConflict(id: Uuid): Promise<never> {
    const now = await this.repository.findStatus(id);
    if (now?.status === PenaltyStatus.CANCELLED) {
      throw new CodedException(HttpStatus.CONFLICT, ErrorCode.PENALTY_CANCELLED);
    }
    throw new CodedException(HttpStatus.CONFLICT, ErrorCode.PENALTY_NOT_PENDING);
  }

  private async window(): Promise<RepetitionWindow> {
    return (await this.settings.get()).penalties.repetitionWindow;
  }

  /**
   * The pair's APPROVED records from `date`'s window start on, later dates included: the earlier
   * ones count toward a penalty not recorded yet (preview, recording — it will be recorded after
   * every existing one, so all approved ones on its date count), the later ones are what approving
   * it would recount (§4).
   */
  private pairRecords(key: RepeatKey, date: IsoDate, window: RepetitionWindow) {
    return this.repository.approvedCandidates([key], undefined, repetitionWindowStart(date, window));
  }

  /**
   * The months of `changes` whose payroll is approved — the earliest refuses (409
   * PENALTY_RECOUNT_MONTH_LOCKED naming it, §4: corrections for an approved month go into the next
   * month as adjustments, §6). Returns `changes` when none is locked.
   */
  private async assertRecountOpen<C extends RecountChange>(changes: C[]): Promise<C[]> {
    const month = await this.recountLocked(changes);
    if (month) {
      throw CodedException.withParams(HttpStatus.CONFLICT, ErrorCode.PENALTY_RECOUNT_MONTH_LOCKED, { month });
    }
    return changes;
  }

  /** The earliest month among `changes` whose payroll is approved, or null. */
  private async recountLocked(changes: readonly RecountChange[]): Promise<Month | null> {
    if (changes.length === 0) return null;
    const months = [...new Set(changes.map((c) => monthOf(c.record.date)))];
    const locked = await Promise.all(months.map((m) => this.monthLock.isMonthLocked(m)));
    return recountLockedMonth(changes, new Set(months.filter((_, i) => locked[i])));
  }

  /**
   * One `hr.penalty.recount` entry on a recounted penalty (§9), labelled with the employee's names
   * (so it shows in their History): level, action and days before → after, and the date of the
   * penalty whose approval moved it (`recountedAfter`).
   */
  private recordRecount(
    approved: RecordRow,
    approvedDate: IsoDate,
    change: RecountChange<ApprovedCandidate>,
  ): Promise<void> {
    return this.audit.record({
      action: 'hr.penalty.recount',
      entity: {
        type: AuditEntityType.PENALTY,
        id: change.record.id,
        label: { en: approved.employee.nameEn, ar: approved.employee.nameAr },
      },
      changes: [
        { field: 'level', before: change.before.level, after: change.after.level },
        { field: 'action', before: change.before.action, after: change.after.action },
        { field: 'days', before: change.before.days, after: change.after.days },
        { field: 'recountedAfter', before: null, after: approvedDate },
      ],
    });
  }

  private async present(row: RecordRow): Promise<PenaltyRecord> {
    const shown = await this.shownLevels([row]);
    return toRecord(row, shown.get(row.id)!);
  }

  /**
   * The level / action / days each row shows: stored for APPROVED and CANCELLED, recomputed from
   * today's catalogue and approved records for PENDING (§4) — which also get the earlier pending
   * record that blocks approving them (`earlierPending`), and the approved ones approving them would
   * move up (`recount`, §4 backdated penalty) with the earliest locked month among those. One query
   * for the whole page (later dates included: what a backdated one recounts).
   */
  private async shownLevels(rows: readonly RecordRow[]): Promise<Map<Uuid, Shown>> {
    const shown = new Map<Uuid, Shown>();
    const pending = rows.filter((r) => r.status === PenaltyStatus.PENDING);
    for (const row of rows)
      if (row.status !== PenaltyStatus.PENDING) shown.set(row.id, storedShown(row));
    if (pending.length === 0) return shown;

    const window = await this.window();
    const uniqueKeys = [
      ...new Map(
        pending.map((r) => [keyOf(r), { employeeId: r.employeeId, violationId: r.violationId }]),
      ).values(),
    ];
    const approved = await this.repository.approvedCandidates(uniqueKeys, undefined, undefined, {
      withPending: true,
    });
    const byKey = new Map<string, ApprovedCandidate[]>();
    for (const a of approved) {
      const list = byKey.get(keyOf(a)) ?? [];
      list.push(a);
      byKey.set(keyOf(a), list);
    }
    for (const row of pending) {
      const pair = byKey.get(keyOf(row)) ?? [];
      const levels = row.violation.levels.map(toLevel);
      const prior = countPriorInWindow(positionOf(row), window, pair);
      const blocker = earlierPendingPenalty(positionOf(row), window, pair);
      const recount = recountAfterApproval(positionOf(row), window, pair, levels);
      shown.set(row.id, {
        ...resolvePenalty(prior, levels),
        earlierPending: blocker && { id: blocker.id, date: blocker.date },
        recount: recount.map(toChange),
        recountLockedMonth: await this.recountLocked(recount),
      });
    }
    return shown;
  }
}
