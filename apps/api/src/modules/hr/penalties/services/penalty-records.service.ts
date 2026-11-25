import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import {
  AuditEntityType,
  ErrorCode,
  isOpenPenaltyStatus,
  PenaltyStatus,
  type AuditAction,
  type NamedRef,
  type PenaltyEmployeeStages,
  type PenaltyStepConflict,
  type IsoDate,
  type Month,
  type Paginated,
  type PermissionKey,
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
  actsOnOwnPenalty,
  countPriorInWindow,
  decisionFrom,
  earlierPendingPenalty,
  firstStep,
  oncePerDayRefuses,
  optionalNote,
  penaltyStage,
  penaltyTransition,
  rejectionReason,
  rejectionStep,
  recountAcknowledged,
  recountAfterApproval,
  recountLockedMonth,
  repetitionWindowStart,
  resolvePenalty,
  type CatalogueLevel,
  type PenaltyDecision,
  type PenaltyDeduction,
  type PenaltyTarget,
  type RecountChange,
} from '../../domain';
import { PermissionsService } from '../../../../core/permissions';
import { UsersService } from '../../../../core/users';
import { headsStage, penaltyInScope, penaltyWhere, toEmployeeScope, type EmployeeScope } from '../../access/employee-scope.pure';
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
  fromSnapshot,
  PenaltyRecordsRepository,
  toSnapshotData,
  type ApprovedCandidate,
  type RecordRow,
  type RepeatKey,
} from '../repositories/penalty-records.repository';
import { PenaltyCatalogueService, toCatalogueLevel } from './penalty-catalogue.service';

const keyOf = (k: RepeatKey) => `${k.employeeId}:${k.violationId}`;

/** A month's penalties as payroll counts them (see `payrollInputs`). */
export interface MonthPenaltyInputs {
  /** Employee → each APPROVED penalty dated in the month, as fixed at approval (effect and number). */
  approved: Map<Uuid, PenaltyDeduction[]>;
  /** Employee → number of penalties dated in the month still waiting at either step. */
  pending: Map<Uuid, number>;
}

/** An approved penalty as the payslip itemises it (before its amount is worked out). */
export type ApprovedMonthPenalty = Omit<PayslipPenalty, 'amount'>;

/** What a row shows besides its stored fields: level / action / number, and what blocks approving it. */
interface Shown extends CatalogueLevel {
  earlierPending: PenaltyRecord['earlierPending'];
  recount: PenaltyRecountChange[];
  recountElsewhere: number;
  recountLockedMonth: Month | null;
  recountLockedElsewhere: boolean;
  hrMayDecide: boolean;
  ownPenalty?: boolean;
}

/** A stage-review holder: who they are and the stages their grant covers (`headsStage`). */
interface ReviewHolder {
  userId: string;
  employeeId: string | null;
  scope: EmployeeScope;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** An action in an audit entry: its two names as they were then (§9, spec 2026-11-25). */
const actionNames = (l: CatalogueLevel) => ({ nameEn: l.action.nameEn, nameAr: l.action.nameAr });

/** A domain recount change → the contract's shape. */
const toChange = (c: RecountChange<ApprovedCandidate>): PenaltyRecountChange => ({
  id: c.record.id,
  date: c.record.date,
  before: c.before,
  after: c.after,
});

/**
 * Whether the viewer's `hr.penalties.view` covers another penalty of the same pair (security review
 * L1): the level count is school-wide (§4), but nothing about a penalty in a stage they don't see —
 * its id, date or level — reaches them.
 */
type SeesPenalty = (other: { stageId: string; employeeId: string }) => boolean;

/** The recount as the viewer may see it: theirs in full, the others only counted. */
function shownRecount(
  changes: readonly RecountChange<ApprovedCandidate>[],
  sees: SeesPenalty,
): { recount: PenaltyRecountChange[]; recountElsewhere: number } {
  const visible = changes.filter((c) => sees(c.record));
  return { recount: visible.map(toChange), recountElsewhere: changes.length - visible.length };
}

/** The penalty that must be approved first, as the viewer may see it (L1). */
function shownBlocker(
  blocker: ApprovedCandidate | null,
  sees: SeesPenalty,
): PenaltyRecord['earlierPending'] {
  if (!blocker) return null;
  return sees(blocker) ? { id: blocker.id, date: blocker.date } : { id: null, date: null };
}

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
    percent: shown.percent,
    amount: shown.amount,
    status: row.status,
    stage: row.stage,
    note: row.note,
    cancelReason: row.cancelReason,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    reviewedBy: row.reviewedBy,
    reviewedAt: iso(row.reviewedAt),
    reviewNote: row.reviewNote,
    reviewSkip: row.reviewSkip,
    approvedBy: row.approvedBy,
    approvedAt: iso(row.approvedAt),
    approvalNote: row.approvalNote,
    rejectedBy: row.rejectedBy,
    rejectedAt: iso(row.rejectedAt),
    rejectedStep: row.rejectedStep,
    rejectionReason: row.rejectionReason,
    cancelledAt: iso(row.cancelledAt),
    hrMayDecide: shown.hrMayDecide,
    ownPenalty: shown.ownPenalty ?? false,
    earlierPending: shown.earlierPending,
    recount: shown.recount,
    recountElsewhere: shown.recountElsewhere,
    recountLockedMonth: shown.recountLockedMonth,
    recountLockedElsewhere: shown.recountLockedElsewhere,
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

/** What a non-pending record shows: the level, action snapshot and number stored on it. */
const storedLevel = (row: RecordRow): CatalogueLevel => fromSnapshot(row);

/** A decided record: its stored level, and nothing blocks it (it isn't waiting for approval). */
const storedShown = (row: RecordRow): Shown => ({
  ...storedLevel(row),
  earlierPending: null,
  recount: [],
  recountElsewhere: 0,
  recountLockedMonth: null,
  recountLockedElsewhere: false,
  hrMayDecide: false,
});

/**
 * A record as its audit entries store it (§9): the violation by its two names, not its id, and the
 * level, the action by its two names (as then) with its effect, and its number (fixed at recording,
 * then at approval). The employee is the entry's label, so not a line of its own (it would repeat the
 * sentence — the screen check of #126). No priced money: a penalty holds days, a percent or the
 * catalogue's fixed amount (`fixedAmount`, not a salary field — never hidden, spec 2026-11-25).
 */
function penaltyAuditSnapshot(row: RecordRow) {
  const { level, action, days, percent, amount } = storedLevel(row);
  return {
    violationId: { nameEn: row.violation.nameEn, nameAr: row.violation.nameAr },
    date: toIsoDate(row.date),
    stage: { nameEn: row.stage.nameEn, nameAr: row.stage.nameAr },
    level,
    action: { nameEn: action.nameEn, nameAr: action.nameAr },
    effect: action.effect,
    percentBase: action.percentBase,
    days,
    percent,
    fixedAmount: amount,
    status: row.status,
    note: row.note,
    reviewSkip: row.reviewSkip,
    reviewNote: row.reviewNote,
    approvalNote: row.approvalNote,
    rejectedStep: row.rejectedStep,
    rejectionReason: row.rejectionReason,
    cancelReason: row.cancelReason,
  };
}

/**
 * Penalty records (§4), in two steps (owner 2026-11-21): recorded in the stage where the violation
 * happened (one of the employee's stages) → PENDING_REVIEW, until that stage's head approves (→
 * WAITING_HR) or rejects it with a reason; then HR (`hr.penalties.approve`) approves (→ APPROVED,
 * fixing level, action and days) or rejects it with a reason. It skips the review — straight to
 * WAITING_HR — when the penalised employee heads that stage, when the recorder may review it
 * themselves, or when the stage has no stage head (`firstStep`). With no stage head left while it
 * waits for review, HR may decide it directly (`hrMayDecide`). Nobody reviews, approves or rejects
 * their own penalty — nor cancels it (403 `PENALTY_OWN`, owner 2026-11-23). A stage scope covers the
 * penalties recorded in the user's stages, not the employee's other stages'. Any action on a penalty
 * outside the user's scope — the stage review's included — is 404, as for an unknown one (security
 * review L2, 2026-11-23: it used to be 403, which told that it exists). A stage-scoped recorder
 * records only in their own stages (M2). What a viewer is shown never names a penalty outside their
 * `hr.penalties.view` (L1): the level counts every stage, but a recount or an earlier pending one in
 * another stage is only counted or said to exist. A step taken twice at once:
 * one wins, the other gets 409 `PENALTY_WRONG_STEP` with the fresh status.
 *
 * Level = 1 + APPROVED records of the same violation and employee inside
 * the repetition window that come earlier: an earlier violation date, or the same date and recorded
 * earlier (a not-yet-recorded penalty comes after every same-date one). A waiting record is shown with today’s
 * catalogue and count; approval computes the level again and fixes level, action and days.
 * Recording, approving and cancelling need the record's month to be open (409 PAYROLL_APPROVED).
 * Never deleted: cancelled with a reason instead, and a cancelled record is final.
 * A "once per day" violation takes at most one pending or approved record per employee per date
 * (409 VIOLATION_ONCE_PER_DAY at preview, recording and approval; a cancelled one frees the day).
 * Approving goes in date order (§4, owner 2026-11-20): while an earlier record of the same pair
 * (in the window) still waits at either step, the HR approval is refused (409 PENALTY_EARLIER_PENDING, `params.date`),
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
    private readonly permissions: PermissionsService,
    private readonly users: UsersService,
  ) {}

  /** The records `hr.penalties.view` covers for the user (R5; a stage scope by the penalty's stage). */
  async list(query: ListPenaltiesQueryDto): Promise<Paginated<PenaltyRecord>> {
    const result = await this.repository.list(
      query.page,
      query.limit,
      {
        employeeId: query.employeeId,
        month: query.month,
        status: query.status,
        stageId: query.stageId,
        search: query.search,
      },
      await this.access.penaltyWhere('hr.penalties.view'),
    );
    const shown = await this.shownLevels(result.data);
    return { ...result, data: result.data.map((row) => toRecord(row, shown.get(row.id)!)) };
  }

  /** 404 when unknown or outside the user's `hr.penalties.view` scope (edge case 3). */
  async get(id: Uuid): Promise<PenaltyRecord> {
    const row = await this.repository.findOne(id, await this.access.penaltyWhere('hr.penalties.view'));
    if (!row) throw new NotFoundException();
    return this.present(row);
  }

  /**
   * The stages a penalty for this employee can be recorded in: main first, then the other ones
   * (owner 2026-11-21). Outside the user's `hr.penalties.record` scope → 404. A recorder whose
   * scope is their stages gets only those of the employee's stages (security review M2): the head of
   * Primary records a shared teacher's penalty in Primary, never in Prep.
   */
  async employeeStages(employeeId: Uuid): Promise<PenaltyEmployeeStages> {
    await this.employees.assertScopeFirst('hr.penalties.record', [employeeId]);
    const found = await this.recordableStages(employeeId);
    if (!found) throw new NotFoundException();
    return { stages: found.stages };
  }

  /** What recording this penalty now would give. Nothing is saved. */
  async preview(query: PenaltyPreviewQueryDto): Promise<PenaltyPreview> {
    const { levels, oncePerDay } = await this.assertRecordable(query.employeeId, query.violationId);
    const placed = await this.placeNew(query.employeeId, query.stageId, { allowUnchosen: true });
    const sees = await this.seesPenalty((await this.employees.stagesOf(query.employeeId))?.managerId ?? null);
    // §4: say before submitting that the day is taken (the same check `create` makes).
    if (oncePerDay) {
      const sameDay = await this.repository.sameDayStatuses(query, query.date);
      if (oncePerDayRefuses(oncePerDay, sameDay, 'record')) this.throwOncePerDay();
    }
    const window = await this.window();
    const pair = await this.pairRecords(query, query.date, window);
    const priorCount = countPriorInWindow({ ...query, date: query.date }, window, pair);
    const { level, action, days, percent, amount } = resolvePenalty(priorCount, levels);
    // §4 backdated: say before saving what approving it would change, or that it can't be.
    const recount = await this.assertRecountOpen(
      recountAfterApproval({ ...query, date: query.date }, window, pair, levels),
      sees,
    );
    return {
      level,
      action,
      days,
      percent,
      amount,
      // School-wide (§4), a number only: it names no penalty.
      priorCount,
      ...shownRecount(recount, sees),
      startsAs: placed?.status ?? null,
      reviewSkip: placed?.skip ?? null,
    };
  }

  async create(dto: CreatePenaltyDto, createdById: Uuid | null): Promise<PenaltyRecord> {
    // The record and its audit entry commit together (audit D2).
    return this.tx.inTransaction(() => this.createInTransaction(dto, createdById));
  }

  private async createInTransaction(dto: CreatePenaltyDto, createdById: Uuid | null): Promise<PenaltyRecord> {
    const { levels, oncePerDay } = await this.assertRecordable(dto.employeeId, dto.violationId);
    const placed = (await this.placeNew(dto.employeeId, dto.stageId))!;
    await this.monthLock.assertMonthOpen(monthOf(dto.date));
    const window = await this.window();
    const pair = await this.pairRecords(dto, dto.date, window);
    const priorCount = countPriorInWindow({ ...dto, date: dto.date }, window, pair);
    // §4 backdated: refused when approving it could never happen (a recount in an approved month).
    const sees = await this.seesPenalty((await this.employees.stagesOf(dto.employeeId))?.managerId ?? null);
    await this.assertRecountOpen(recountAfterApproval({ ...dto, date: dto.date }, window, pair, levels), sees);
    const row = await this.repository.createRecord(
      {
        employeeId: dto.employeeId,
        violationId: dto.violationId,
        stageId: placed.stageId,
        date: dto.date,
        note: dto.note ?? null,
        createdById,
        status: placed.status,
        reviewSkip: placed.skip,
        ...toSnapshotData(resolvePenalty(priorCount, levels)),
      },
      (sameDay) => oncePerDayRefuses(oncePerDay, sameDay, 'record'),
    );
    if (!row) this.throwOncePerDay();
    await this.record('hr.penalty.record', null, row);
    const recorded = await this.present(row);
    // In the same transaction (§11, N4): a refused or rolled-back recording tells no one. Whoever
    // acts next is told — the stage's head, or HR — never the penalised employee themselves.
    await this.notifications.penaltyRecorded(
      { ...recorded, month: monthOf(dto.date) },
      createdById,
      await this.employeeUserIds(dto.employeeId),
    );
    return recorded;
  }

  /**
   * The stage review approves: PENDING_REVIEW → WAITING_HR, with an optional note (§4 two steps).
   * Only a reviewer whose stages hold the penalty's stage (else 403), never on their own penalty
   * (403 `PENALTY_OWN`), not in an approved payroll month. HR's approvers are told.
   */
  async reviewApprove(id: Uuid, byUserId: Uuid | null, note: string | null): Promise<PenaltyRecord> {
    return this.tx.inTransaction(async () => {
      const current = await this.findForAction(id, 'hr.penalties.review');
      this.assertTransition(current, 'REVIEW_APPROVE', false);
      await this.monthLock.assertMonthOpen(monthOf(toIsoDate(current.date)));
      if (!(await this.repository.review(id, byUserId, optionalNote(note)))) await this.throwStepConflict(id);
      const after = await this.findWritten(id);
      await this.record('hr.penalty.review', current, after);
      const reviewed = await this.present(after);
      await this.notifications.penaltyReviewed(
        { ...reviewed, month: monthOf(toIsoDate(current.date)) },
        byUserId,
        await this.employeeUserIds(current.employeeId),
      );
      return this.get(id);
    });
  }

  /**
   * A rejection with a required reason (§4 two steps): at the stage review (`REVIEW_REJECT`,
   * PENDING_REVIEW → REJECTED, `hr.penalties.review`) or at HR (`HR_REJECT`, WAITING_HR →
   * REJECTED — or PENDING_REVIEW when HR may decide it — `hr.penalties.approve`). Not on one's own
   * penalty, not in an approved payroll month. The recorder is told; the reason shows on the
   * penalty and in its history.
   */
  async reject(
    id: Uuid,
    decision: 'REVIEW_REJECT' | 'HR_REJECT',
    rawReason: string,
    byUserId: Uuid | null,
  ): Promise<PenaltyRecord> {
    return this.tx.inTransaction(async () => {
      const key: PermissionKey = decision === 'REVIEW_REJECT' ? 'hr.penalties.review' : 'hr.penalties.approve';
      const current = await this.findForAction(id, key);
      const hrMayDecide = decision === 'HR_REJECT' && (await this.hrMayDecide(current));
      this.assertTransition(current, decision, hrMayDecide);
      const reason = rejectionReason(rawReason);
      if (reason === null) throw new CodedException(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED);
      await this.monthLock.assertMonthOpen(monthOf(toIsoDate(current.date)));
      const from = decisionFrom(decision, { hrMayDecide });
      const done = await this.repository.reject(id, from, byUserId, reason, rejectionStep(decision), current);
      if (!done) await this.throwStepConflict(id);
      await this.record('hr.penalty.reject', current, await this.findWritten(id));
      await this.notifications.penaltyRejected(
        {
          id,
          employee: current.employee,
          violation: current.violation,
          createdById: current.createdById,
        },
        byUserId,
      );
      return this.get(id);
    });
  }

  /**
   * The HR step: WAITING_HR (or PENDING_REVIEW when HR may decide it) → APPROVED, fixing level, action and days from today's catalogue and count. A
   * backdated one also moves the later approved ones up — only as `acknowledgedRecount` confirms.
   */
  async approve(
    id: Uuid,
    approvedById: Uuid | null,
    acknowledgedRecount?: PenaltyRecountAcknowledgement[],
    note: string | null = null,
    acknowledgedRecountElsewhere?: number,
  ): Promise<PenaltyRecord> {
    return this.tx.inTransaction(() =>
      this.approveInTransaction(
        id,
        approvedById,
        acknowledgedRecount,
        optionalNote(note),
        acknowledgedRecountElsewhere,
      ),
    );
  }

  private async approveInTransaction(
    id: Uuid,
    approvedById: Uuid | null,
    acknowledgedRecount: PenaltyRecountAcknowledgement[] | undefined,
    note: string | null,
    acknowledgedRecountElsewhere: number | undefined,
  ): Promise<PenaltyRecord> {
    // Outside the user's `hr.penalties.approve` scope → 404, like an unknown record (R5).
    const current = await this.repository.findOne(id, await this.access.penaltyWhere('hr.penalties.approve'));
    if (!current) throw new NotFoundException();
    await this.assertNotOwn(current);
    const sees = await this.seesPenalty(current.employee.managerId);
    const hrMayDecide = await this.hrMayDecide(current);
    this.assertTransition(current, 'HR_APPROVE', hrMayDecide);
    const from = decisionFrom('HR_APPROVE', { hrMayDecide });
    const date = toIsoDate(current.date);
    await this.monthLock.assertMonthOpen(monthOf(date));

    const levels = current.violation.levels.map(toCatalogueLevel);
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
          sees,
        );
        // L1: the ones the approver sees are confirmed one by one, the others by their number.
        const visible = changes.filter((c) => sees(c.record));
        const elsewhere = changes.length - visible.length;
        const confirmed =
          recountAcknowledged(visible, acknowledgedRecount ?? (elsewhere > 0 ? [] : undefined)) &&
          (acknowledgedRecountElsewhere ?? 0) === elsewhere;
        if (!confirmed) {
          const code =
            acknowledgedRecount === undefined && acknowledgedRecountElsewhere === undefined
              ? ErrorCode.PENALTY_RECOUNT_UNCONFIRMED
              : ErrorCode.PENALTY_RECOUNT_CHANGED;
          const data: PenaltyRecountConflict = shownRecount(changes, sees);
          throw CodedException.withData(HttpStatus.CONFLICT, code, { count: changes.length }, data);
        }
        recounted = changes;
        return changes.map((c) => ({ id: c.record.id, fromLevel: c.before.level, ...toSnapshotData(c.after) }));
      },
      from,
      note,
    );
    if (outcome === 'ONCE_PER_DAY') this.throwOncePerDay();
    if (typeof outcome === 'object') {
      // L1: the earlier penalty's date only when the approver may see it; else "in another stage".
      if (!sees({ stageId: outcome.stageId, employeeId: current.employeeId })) {
        throw new CodedException(HttpStatus.CONFLICT, ErrorCode.PENALTY_EARLIER_PENDING_ELSEWHERE);
      }
      throw CodedException.withParams(HttpStatus.CONFLICT, ErrorCode.PENALTY_EARLIER_PENDING, {
        date: outcome.earlierPending,
      });
    }
    if (outcome === 'NOT_PENDING') await this.throwStepConflict(id);
    await this.record('hr.penalty.approve', current, await this.findWritten(id));
    for (const change of recounted) await this.recordRecount(current, date, change);
    await this.notifications.penaltyApproved(id, approvedById);
    return this.get(id);
  }

  /**
   * Waiting (either step) or APPROVED → CANCELLED with a reason. Other approved levels are not
   * recomputed. Cancelling stays as before: whoever holds `hr.penalties.cancel` over it.
   */
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
    const current = await this.repository.findOne(id, await this.access.penaltyWhere('hr.penalties.cancel'));
    if (!current) throw new NotFoundException();
    // Security review M1 (owner 2026-11-23): nobody cancels their own penalty either.
    await this.assertNotOwn(current);
    this.assertTransition(current, 'CANCEL', false);
    await this.monthLock.assertMonthOpen(monthOf(toIsoDate(current.date)));
    // Under the pair's lock: never between a backdated approval's recount and its writes.
    if (!(await this.repository.cancel(id, dto.reason, cancelledById, current))) {
      await this.throwStepConflict(id);
    }
    await this.record('hr.penalty.cancel', current, await this.findWritten(id));
    if (isOpenPenaltyStatus(current.status)) await this.notifications.penaltyCancelled(id, cancelledById);
    return this.get(id);
  }

  /**
   * What payroll needs from a month's penalties (§4, §6, spec 2026-11-25): per employee, each
   * APPROVED penalty dated in the month with its FIXED effect and number (payroll prices days, a %
   * and fixed amounts; record-only ones cost 0), and how many penalties dated in it still wait at
   * either step. Rejected and cancelled never count.
   */
  async payrollInputs(month: Month): Promise<MonthPenaltyInputs> {
    const rows = await this.repository.findForPayroll(month);
    const approved = new Map<Uuid, PenaltyDeduction[]>();
    const pending = new Map<Uuid, number>();
    for (const row of rows) {
      if (isOpenPenaltyStatus(row.status)) {
        pending.set(row.employeeId, (pending.get(row.employeeId) ?? 0) + 1);
        continue;
      }
      const deduction: PenaltyDeduction = {
        effect: row.effect,
        percentBase: row.percentBase,
        days: row.days === null ? null : Number(row.days),
        percent: row.percent === null ? null : Number(row.percent),
        amount: row.amount,
      };
      approved.set(row.employeeId, [...(approved.get(row.employeeId) ?? []), deduction]);
    }
    return { approved, pending };
  }

  /**
   * Whether a penalty dated in `month` was recounted (§4 backdated penalty) after `since`: a draft
   * run calculated before then is due a Recalculate (§6).
   */
  recountedInMonthSince(month: Month, since: Date, scope?: EmployeeScope): Promise<boolean> {
    // L-5: a scoped viewer isn't told a penalty outside their scope moved.
    return this.repository.recountedInMonthSince(month, since, scope ? penaltyWhere(scope) : {});
  }

  /**
   * How many penalties dated in a month still wait at either step right now (blocks payroll
   * approval). `scope`: only what a scoped payroll viewer covers — by the penalty's stage, like
   * `penaltyWhere` (security review L3 / L-5); absent: the whole school.
   */
  pendingCountInMonth(month: Month, scope?: EmployeeScope): Promise<number> {
    return this.repository.countPendingInMonth(month, scope ? penaltyWhere(scope) : {});
  }

  /** One employee's APPROVED penalties dated in a month, by date, as fixed at approval. */
  async approvedInMonth(month: Month, employeeId: Uuid): Promise<ApprovedMonthPenalty[]> {
    const rows = await this.repository.findApprovedForPayslip(month, employeeId);
    return rows.map((r) => {
      const fixed = fromSnapshot(r);
      return {
        date: toIsoDate(r.date),
        violationNameEn: r.violation.nameEn,
        violationNameAr: r.violation.nameAr,
        level: fixed.level,
        action: fixed.action,
        days: fixed.days,
        percent: fixed.percent,
        fixedAmount: fixed.amount,
      };
    });
  }

  /**
   * Records dated in a month (dashboard: by violation date) that `hr.penalties.view` covers for the
   * user (R5): `pending` waits at either step (stage review or HR), `approved` only the HR-approved
   * ones (owner 2026-11-21).
   */
  async monthCounts(month: Month): Promise<{ pending: number; approved: number }> {
    const counts = await this.repository.countByStatusInMonth(
      month,
      await this.access.penaltyWhere('hr.penalties.view'),
    );
    return { pending: counts.PENDING_REVIEW + counts.WAITING_HR, approved: counts.APPROVED };
  }

  /** The ids of the records `hr.penalties.view` covers (Activity log, R5). */
  async idsInViewScope(): Promise<Uuid[] | 'all'> {
    const scope = await this.access.scope('hr.penalties.view');
    if (scope.kind === 'all') return 'all';
    return this.repository.findIdsInScope(await this.access.penaltyWhere('hr.penalties.view'));
  }

  /**
   * Whether `scope` — a notification recipient's (§11) — covers each record, in order: a stage
   * scope by the penalty's stage (owner 2026-11-21: the other stage's head isn't told), a team or
   * self scope by its employee. Unknown ids are not covered.
   */
  async coveredBy(scope: EmployeeScope, ids: readonly Uuid[]): Promise<boolean[]> {
    const rows = new Map((await this.repository.findScopeFields([...new Set(ids)])).map((r) => [r.id, r]));
    return ids.map((id) => {
      const row = rows.get(id);
      return !!row && penaltyInScope(scope, row);
    });
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

  /**
   * The record for a decision under `key` (§4 two steps). Unknown, or outside the user's scope —
   * the stage review's included (another stage's penalty) — → 404, the answer a missing record gives,
   * so its existence isn't told (R5; security review L2, 2026-11-23). Own penalty → 403 `PENALTY_OWN`.
   */
  private async findForAction(id: Uuid, key: PermissionKey): Promise<RecordRow> {
    const current = await this.repository.findOne(id, await this.access.penaltyWhere(key));
    if (!current) throw new NotFoundException();
    await this.assertNotOwn(current);
    return current;
  }

  /**
   * Whether the viewer's `hr.penalties.view` covers another penalty of an employee whose manager is
   * `managerId` (L1): a stage scope by that penalty's stage, a team or self scope by the employee.
   */
  private async seesPenalty(managerId: string | null): Promise<SeesPenalty> {
    const scope = await this.access.scope('hr.penalties.view');
    return (other) =>
      penaltyInScope(scope, { stageId: other.stageId, employeeId: other.employeeId, employee: { managerId } });
  }

  /**
   * The employee's stages a penalty may be recorded in by this user (security review M2, owner
   * 2026-11-23): all of them for a school-wide recorder; for one whose `hr.penalties.record` scope is
   * their stages, only those — the head of Primary can't record a shared teacher's penalty in Prep.
   * Null for an unknown employee.
   */
  private async recordableStages(employeeId: Uuid) {
    const found = await this.employees.stagesOf(employeeId);
    if (!found) return null;
    const scope = await this.access.scope('hr.penalties.record');
    if (scope.kind !== 'stage') return found;
    return { ...found, stages: found.stages.filter((s) => scope.stageIds.includes(s.id)) };
  }

  /** Nobody reviews, approves, rejects or cancels their own penalty (owner 2026-11-21, 2026-11-23). */
  private async assertNotOwn(row: RecordRow): Promise<void> {
    // Fourth review H1: "not your own" needs to know who you are in HR — a linked account (a System
    // admin excepted; 403 `ACCOUNT_NOT_LINKED`).
    await this.access.assertLinkedForPay();
    const actor = await this.access.actor();
    if (actor && actsOnOwnPenalty(actor.employeeId, row.employeeId)) {
      throw new CodedException(HttpStatus.FORBIDDEN, ErrorCode.PENALTY_OWN);
    }
  }

  /** 409 when `decision` can't be taken from the record's status (final, or the wrong step). */
  private assertTransition(row: RecordRow, decision: PenaltyDecision, hrMayDecide: boolean): void {
    const t = penaltyTransition(row.status, decision, { hrMayDecide });
    if (t.ok) return;
    if (t.refusal === ErrorCode.PENALTY_WRONG_STEP) this.stepConflict(row.status);
    throw new CodedException(HttpStatus.CONFLICT, t.refusal);
  }

  private stepConflict(status: PenaltyStatus): never {
    const data: PenaltyStepConflict = { status };
    throw CodedException.withData(HttpStatus.CONFLICT, ErrorCode.PENALTY_WRONG_STEP, {}, data);
  }

  /**
   * A conditional status update matched nothing: someone changed the record meanwhile (two reviews
   * at once — one wins). 409 with where it stands now.
   */
  private async throwStepConflict(id: Uuid): Promise<never> {
    const now = await this.repository.findStatus(id);
    if (now?.status === PenaltyStatus.CANCELLED) {
      throw new CodedException(HttpStatus.CONFLICT, ErrorCode.PENALTY_CANCELLED);
    }
    if (now?.status === PenaltyStatus.REJECTED) {
      throw new CodedException(HttpStatus.CONFLICT, ErrorCode.PENALTY_REJECTED);
    }
    this.stepConflict(now?.status ?? PenaltyStatus.APPROVED);
  }

  /** Everyone holding the stage review, with their scope — once per request (cached by the core). */
  private async reviewHolders(): Promise<ReviewHolder[]> {
    const holders = await this.permissions.holdersWithScope('hr.penalties.review');
    return holders.map((h) => ({ userId: h.userId, employeeId: h.scope.employeeId, scope: toEmployeeScope(h.scope) }));
  }

  /** The stage heads who may review a penalty of `employeeId` in `stageId`: never the employee. */
  private reviewersOf(holders: readonly ReviewHolder[], stageId: string, employeeId: string): ReviewHolder[] {
    return holders.filter((h) => headsStage(h.scope, stageId) && h.employeeId !== employeeId);
  }

  /**
   * PENDING_REVIEW with nobody left to review it — no stage head of its stage other than the
   * penalised employee (owner 2026-11-21, edge case 3): HR may decide it directly.
   */
  private async hrMayDecide(row: RecordRow, holders?: readonly ReviewHolder[]): Promise<boolean> {
    if (row.status !== PenaltyStatus.PENDING_REVIEW) return false;
    return this.reviewersOf(holders ?? (await this.reviewHolders()), row.stageId, row.employeeId).length === 0;
  }

  /**
   * Where a new penalty of `employeeId` goes (owner 2026-11-21): its stage — the one given, or the
   * only one (400 `PENALTY_STAGE_REQUIRED` / `PENALTY_STAGE_INVALID`) — and its first status
   * (`firstStep`). `allowUnchosen` (the preview): several stages and none chosen yet → null.
   * Only the stages the recorder may record in (`recordableStages`, M2): another one → 400
   * `PENALTY_STAGE_INVALID`, and a stage-scoped recorder's only stage fills in by itself.
   */
  private async placeNew(
    employeeId: Uuid,
    requested: string | undefined,
    { allowUnchosen = false }: { allowUnchosen?: boolean } = {},
  ) {
    const found = await this.recordableStages(employeeId);
    if (!found) throw new CodedException(HttpStatus.BAD_REQUEST, ErrorCode.FOREIGN_KEY_VIOLATION);
    const choice = penaltyStage(found.stages.map((st: NamedRef) => st.id), requested);
    if (!choice.ok) {
      if (allowUnchosen && choice.refusal === ErrorCode.PENALTY_STAGE_REQUIRED) return null;
      throw new CodedException(HttpStatus.BAD_REQUEST, choice.refusal);
    }
    const holders = await this.reviewHolders();
    const employeeIsHead = holders.some((h) => h.employeeId === employeeId && headsStage(h.scope, choice.stageId));
    // The system recording (seed, scripts — no signed-in user) is nobody's review.
    const recorderMayReview =
      (await this.access.actor()) !== null &&
      penaltyInScope(await this.access.scope('hr.penalties.review'), {
        stageId: choice.stageId,
        employeeId,
        employee: { managerId: found.managerId },
      });
    const step = firstStep({
      employeeIsHead,
      recorderMayReview,
      stageHasHead: this.reviewersOf(holders, choice.stageId, employeeId).length > 0,
    });
    return { stageId: choice.stageId, ...step };
  }

  /** The penalised employee's own sign-in account, left out of "waiting for you" notifications. */
  private async employeeUserIds(employeeId: Uuid): Promise<Uuid[]> {
    const account = await this.users.accountOfEmployee(employeeId);
    return account ? [account.id] : [];
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
   * month as adjustments, §6). Returns `changes` when none is locked. Security review L-3: the month
   * is named only from penalties the user sees (`sees`); a locked one only among the others refuses
   * with `PENALTY_RECOUNT_MONTH_LOCKED_ELSEWHERE`, no month.
   */
  private async assertRecountOpen<C extends RecountChange<ApprovedCandidate>>(
    changes: C[],
    sees: SeesPenalty,
  ): Promise<C[]> {
    const { month, elsewhere } = await this.recountLockedFor(changes, sees);
    if (month) {
      throw CodedException.withParams(HttpStatus.CONFLICT, ErrorCode.PENALTY_RECOUNT_MONTH_LOCKED, { month });
    }
    if (elsewhere) throw new CodedException(HttpStatus.CONFLICT, ErrorCode.PENALTY_RECOUNT_MONTH_LOCKED_ELSEWHERE);
    return changes;
  }

  /** `recountLocked` split by what the user sees: the visible locked month, and whether a hidden one is. */
  private async recountLockedFor(
    changes: readonly RecountChange<ApprovedCandidate>[],
    sees: SeesPenalty,
  ): Promise<{ month: Month | null; elsewhere: boolean }> {
    const month = await this.recountLocked(changes.filter((c) => sees(c.record)));
    const elsewhere = month ? false : (await this.recountLocked(changes.filter((c) => !sees(c.record)))) !== null;
    return { month, elsewhere };
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
   * (so it shows in their History): the moved penalty's date (`penaltyDate` — the label alone
   * doesn't say which one), level, action and days before → after, and the date of the penalty
   * whose approval moved it (`recountedAfter`).
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
        // Which of the employee's penalties moved (the entry's label is only their name).
        { field: 'penaltyDate', before: null, after: change.record.date },
        { field: 'level', before: change.before.level, after: change.after.level },
        { field: 'action', before: actionNames(change.before), after: actionNames(change.after) },
        { field: 'effect', before: change.before.action.effect, after: change.after.action.effect },
        { field: 'days', before: change.before.days, after: change.after.days },
        { field: 'percent', before: change.before.percent, after: change.after.percent },
        { field: 'fixedAmount', before: change.before.amount, after: change.after.amount },
        { field: 'recountedAfter', before: null, after: approvedDate },
      ],
    });
  }

  private async present(row: RecordRow): Promise<PenaltyRecord> {
    const shown = await this.shownLevels([row]);
    return toRecord(row, shown.get(row.id)!);
  }

  /**
   * The level / action / days each row shows: stored for APPROVED, REJECTED and CANCELLED,
   * recomputed from today's catalogue and approved records for a waiting one (either step, §4) — which also get the earlier pending
   * record that blocks approving them (`earlierPending`), and the approved ones approving them would
   * move up (`recount`, §4 backdated penalty) with the earliest locked month among those. One query
   * for the whole page (later dates included: what a backdated one recounts).
   */
  private async shownLevels(rows: readonly RecordRow[]): Promise<Map<Uuid, Shown>> {
    const shown = new Map<Uuid, Shown>();
    const actor = await this.access.actor();
    const own = (row: RecordRow) => actsOnOwnPenalty(actor?.employeeId ?? null, row.employeeId);
    const pending = rows.filter((r) => isOpenPenaltyStatus(r.status));
    for (const row of rows) {
      if (!isOpenPenaltyStatus(row.status)) shown.set(row.id, { ...storedShown(row), ownPenalty: own(row) });
    }
    if (pending.length === 0) return shown;
    const holders = pending.some((r) => r.status === PenaltyStatus.PENDING_REVIEW)
      ? await this.reviewHolders()
      : [];

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
    const viewScope = await this.access.scope('hr.penalties.view');
    for (const row of pending) {
      const pair = byKey.get(keyOf(row)) ?? [];
      const levels = row.violation.levels.map(toCatalogueLevel);
      // L1: the level counts every stage (§4); what names a penalty shows only those the viewer sees.
      const sees: SeesPenalty = (other) =>
        penaltyInScope(viewScope, { ...other, employee: { managerId: row.employee.managerId } });
      const prior = countPriorInWindow(positionOf(row), window, pair);
      const blocker = earlierPendingPenalty(positionOf(row), window, pair);
      const recount = recountAfterApproval(positionOf(row), window, pair, levels);
      // L-3: the locked month only from what they see; otherwise just that one elsewhere is.
      const locked = await this.recountLockedFor(recount, sees);
      shown.set(row.id, {
        ...resolvePenalty(prior, levels),
        earlierPending: shownBlocker(blocker, sees),
        ...shownRecount(recount, sees),
        recountLockedMonth: locked.month,
        recountLockedElsewhere: locked.elsewhere,
        hrMayDecide: await this.hrMayDecide(row, holders),
        ownPenalty: own(row),
      });
    }
    return shown;
  }
}
