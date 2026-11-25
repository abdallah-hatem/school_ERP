import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { Prisma } from '@prisma/client';
import {
  OPEN_PENALTY_STATUSES,
  PenaltyStatus,
  type IsoDate,
  type PenaltyEffect,
  type PenaltyReviewSkip,
  type PenaltySalaryBase,
  type PenaltyStatusFilter,
  type PenaltyStep,
} from '@school-erp/shared';
import { BaseRepository } from '../../../../common/repositories/base.repository';
import { fromIsoDate, monthDateRange, toIsoDate } from '../../../../common/utils/dates.util';
import { DatabaseService } from '../../../../database/database.service';
import type { DbAdapter, DbClient } from '../../../../database/transactions';
import type { CatalogueLevel } from '../../domain';
import { LEVEL_SELECT } from './penalty-catalogue.repository';
import { codeContains, searchWhere } from '../../../../common/repositories/search';

const USER_REF = { select: { id: true, name: true } } as const;

/** A penalty's action snapshot and number (spec 2026-11-25), as stored on it. */
const SNAPSHOT_SELECT = {
  actionId: true,
  actionNameEn: true,
  actionNameAr: true,
  effect: true,
  percentBase: true,
  days: true,
  percent: true,
  amount: true,
} as const;

/** The snapshot columns, as read. */
export interface SnapshotColumns {
  level: number;
  actionId: string;
  actionNameEn: string;
  actionNameAr: string;
  effect: PenaltyEffect;
  percentBase: PenaltySalaryBase | null;
  days: Prisma.Decimal | number | null;
  percent: Prisma.Decimal | number | null;
  amount: number | null;
}

/** The columns a level's copy is written to (recording, approval, recount). */
export interface SnapshotData {
  level: number;
  actionId: string;
  actionNameEn: string;
  actionNameAr: string;
  effect: PenaltyEffect;
  percentBase: PenaltySalaryBase | null;
  days: number | null;
  percent: number | null;
  amount: number | null;
}

/** A level's copy (domain) → the penalty's snapshot columns. */
export function toSnapshotData(l: CatalogueLevel): SnapshotData {
  return {
    level: l.level,
    actionId: l.action.id,
    actionNameEn: l.action.nameEn,
    actionNameAr: l.action.nameAr,
    effect: l.action.effect,
    percentBase: l.action.percentBase,
    days: l.days,
    percent: l.percent,
    amount: l.amount,
  };
}

const num = (v: Prisma.Decimal | number | null): number | null => (v === null ? null : Number(v));

/** A penalty's stored snapshot columns → the level, action and number it holds (domain). */
export function fromSnapshot(r: SnapshotColumns): CatalogueLevel {
  return {
    level: r.level,
    action: { id: r.actionId, nameEn: r.actionNameEn, nameAr: r.actionNameAr, effect: r.effect, percentBase: r.percentBase },
    days: num(r.days),
    percent: num(r.percent),
    amount: r.amount,
  };
}

export const RECORD_SELECT = {
  id: true,
  employeeId: true,
  violationId: true,
  date: true,
  status: true,
  stageId: true,
  stage: { select: { id: true, nameEn: true, nameAr: true } },
  level: true,
  ...SNAPSHOT_SELECT,
  note: true,
  cancelReason: true,
  createdAt: true,
  createdById: true,
  reviewedAt: true,
  reviewNote: true,
  reviewSkip: true,
  approvedAt: true,
  approvalNote: true,
  rejectedAt: true,
  rejectedStep: true,
  rejectionReason: true,
  cancelledAt: true,
  employee: {
    select: {
      id: true,
      code: true,
      nameEn: true,
      nameAr: true,
      photoUrl: true,
      gender: true,
      // For the scope checks (a team scope goes by the employee's manager); not in the response.
      managerId: true,
    },
  },
  // The catalogue's current levels: a PENDING record is shown with them (§4).
  violation: {
    select: {
      id: true,
      nameEn: true,
      nameAr: true,
      oncePerDay: true,
      levels: { select: LEVEL_SELECT, orderBy: { level: 'asc' } },
    },
  },
  createdBy: USER_REF,
  reviewedBy: USER_REF,
  approvedBy: USER_REF,
  rejectedBy: USER_REF,
} satisfies Prisma.PenaltyRecordSelect;

export type RecordRow = Prisma.PenaltyRecordGetPayload<{ select: typeof RECORD_SELECT }>;

export interface RecordCreateData extends SnapshotData {
  employeeId: string;
  violationId: string;
  /** Where the violation happened (owner 2026-11-21). */
  stageId: string;
  date: IsoDate;
  note: string | null;
  createdById: string | null;
  /** PENDING_REVIEW, or WAITING_HR when it skips the stage review (`reviewSkip` says why). */
  status: typeof PenaltyStatus.PENDING_REVIEW | typeof PenaltyStatus.WAITING_HR;
  reviewSkip: PenaltyReviewSkip | null;
}

/** A scope's filter on `penalty_records` (`HrAccessService.penaltyWhere`) — `{}` for all. */
export type PenaltyScopeWhere = Prisma.PenaltyRecordWhereInput;

export interface RecordListFilter {
  employeeId?: string;
  /** `YYYY-MM`: records dated in that month. */
  month?: string;
  /** One status, or `OPEN`: waiting at either step. */
  status?: PenaltyStatusFilter;
  /** The stage where it happened. */
  stageId?: string;
  search?: string;
}

/** One (employee, violation) pair whose approved records count toward a level. */
export interface RepeatKey {
  employeeId: string;
  violationId: string;
}

/**
 * An APPROVED (or PENDING) record as the repeat count looks at it (§4): its pair, status and place
 * in the repeat order (violation date, then when recorded, then id), and the level, action and days
 * stored on it (fixed on an approved one — what a backdated approval recounts). Same shape as the
 * domain's `ApprovedPenalty`.
 */
export interface ApprovedCandidate extends RepeatKey, CatalogueLevel {
  id: string;
  date: IsoDate;
  recordedAt: Date;
  status: PenaltyStatus;
  /** Where it happened: who may see it (a stage scope, security review L1). */
  stageId: string;
}

const CANDIDATE_SELECT = {
  id: true,
  employeeId: true,
  violationId: true,
  date: true,
  createdAt: true,
  status: true,
  stageId: true,
  level: true,
  ...SNAPSHOT_SELECT,
} as const;

const toCandidate = (
  r: Prisma.PenaltyRecordGetPayload<{ select: typeof CANDIDATE_SELECT }>,
): ApprovedCandidate => ({
  id: r.id,
  employeeId: r.employeeId,
  violationId: r.violationId,
  date: toIsoDate(r.date),
  recordedAt: r.createdAt,
  status: r.status,
  stageId: r.stageId,
  ...fromSnapshot(r),
});

/**
 * Records of the pairs in `statuses` dated `from <= date <= upTo` (same date included: §4); no
 * `upTo`: every later date too (the approved ones a backdated penalty would recount).
 */
const candidatesWhere = (
  keys: readonly RepeatKey[],
  upTo: IsoDate | undefined,
  from?: IsoDate,
  statuses: readonly PenaltyStatus[] = [PenaltyStatus.APPROVED],
): Prisma.PenaltyRecordWhereInput => ({
  status: { in: [...statuses] },
  date: {
    ...(from ? { gte: fromIsoDate(from) } : {}),
    ...(upTo ? { lte: fromIsoDate(upTo) } : {}),
  },
  OR: keys.map((k) => ({ employeeId: k.employeeId, violationId: k.violationId })),
});

/** How an approval ended (`approve`); `earlierPending`: the date (and stage) of the penalty to approve first (§4). */
export type ApproveOutcome =
  | 'APPROVED'
  | 'NOT_PENDING'
  | 'ONCE_PER_DAY'
  | { earlierPending: IsoDate; stageId: string };

/** §4 approve in date order: the pair's earlier PENDING record that blocks the approval, or null. */
export type EarlierPendingCheck = (pairRecords: ApprovedCandidate[]) => ApprovedCandidate | null;

/** One approved record a backdated approval moves up: its level when read, and its new values. */
export interface RecountUpdate extends SnapshotData {
  id: string;
  /** The level it had when the recount was worked out (the write checks it is unchanged). */
  fromLevel: number;
}

/**
 * §4 backdated penalty (owner 2026-11-20): given the pair's records (approved and pending, from the
 * window's start, every later date included), the approved records approving this one moves up —
 * or it throws (a locked month, a missing or stale confirmation), which rolls the approval back.
 * Runs under the pair's lock, after the order check.
 */
export type RecountPlan = (pairRecords: ApprovedCandidate[]) => Promise<RecountUpdate[]>;

/** The pair's approved record changed under the recount (it can't, under the lock): roll back. */
export class RecountConflictError extends Error {
  constructor(id: string) {
    super(`penalty ${id} changed while it was being recounted`);
    this.name = 'RecountConflictError';
  }
}

/** The statuses whose records a waiting row's level and order check look at. */
const APPROVED_OR_PENDING = [PenaltyStatus.APPROVED, ...OPEN_PENALTY_STATUSES] as const;

/**
 * §4 once per day: given the statuses of the OTHER records of the same pair and date, whether the
 * write must be refused (the service passes the domain's `oncePerDayRefuses`).
 */
export type SameDayRefusal = (sameDayOthers: PenaltyStatus[]) => boolean;

type Tx = DbClient;

/**
 * Serialises writes of one employee + violation pair (recording and approving) for the rest of the
 * transaction, so two of them can't both read the same count or the same free day.
 */
const lockPair = (tx: Tx, key: RepeatKey) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`penalty:${key.employeeId}:${key.violationId}`}))`;

/** Statuses of the pair's records dated `date`, other than `exceptId`. */
async function sameDayStatuses(
  db: Tx,
  key: RepeatKey,
  date: IsoDate,
  exceptId?: string,
): Promise<PenaltyStatus[]> {
  const rows = await db.penaltyRecord.findMany({
    where: {
      employeeId: key.employeeId,
      violationId: key.violationId,
      date: fromIsoDate(date),
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { status: true },
  });
  return rows.map((r) => r.status);
}

/**
 * Recorded penalties (§4). Never deleted. Status changes are conditional updates
 * (`where status = …`), so two concurrent approvals or cancels can't both succeed.
 */
@Injectable()
export class PenaltyRecordsRepository extends BaseRepository<
  RecordRow,
  RecordCreateData,
  Prisma.PenaltyRecordUncheckedUpdateInput
> {
  constructor(
    databaseService: DatabaseService,
    private readonly txHost: TransactionHost<DbAdapter>,
  ) {
    super(databaseService, 'penaltyRecord');
  }

  /** The open transaction when there is one (an audited request, audit D2), else the plain client. */
  private get db(): DbClient {
    return this.txHost.tx;
  }

  /** `scope`: the records the viewer may see (R5; a stage scope by the penalty's stage) — `{}` for all. */
  list(
    page: number | undefined,
    limit: number | undefined,
    filter: RecordListFilter,
    scope: PenaltyScopeWhere = {},
  ) {
    const where: Prisma.PenaltyRecordWhereInput = { AND: [scope] };
    if (filter.employeeId) where.employeeId = filter.employeeId;
    if (filter.status === 'OPEN') where.status = { in: [...OPEN_PENALTY_STATUSES] };
    else if (filter.status) where.status = filter.status;
    if (filter.stageId) where.stageId = filter.stageId;
    if (filter.month) where.date = monthDateRange(filter.month);
    // The employee's code or names, or the violation's names (the shared search on each).
    const searched = searchWhere(filter.search);
    if (searched) where.OR = [{ employee: searched }, { violation: searched }];
    return this.findAllWithPagination(page, limit, undefined, where, {
      select: RECORD_SELECT,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /** The record, or null when unknown or outside `scope` (R5 — the caller 404s). */
  findOne(id: string, scope: PenaltyScopeWhere = {}): Promise<RecordRow | null> {
    return this.db.penaltyRecord.findFirst({
      where: { AND: [{ id }, scope] },
      select: RECORD_SELECT,
    });
  }

  /** What a scope check reads about records (notification recipients, §11): unknown ids are absent. */
  findScopeFields(
    ids: readonly string[],
  ): Promise<{ id: string; stageId: string; employeeId: string; employee: { managerId: string | null } }[]> {
    if (!ids.length) return Promise.resolve([]);
    return this.db.penaltyRecord.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, stageId: true, employeeId: true, employee: { select: { managerId: true } } },
    });
  }

  /** Status only, for deciding which error a failed status change gets. */
  async findStatus(
    id: string,
    scope: PenaltyScopeWhere = {},
  ): Promise<{ status: PenaltyStatus; date: IsoDate } | null> {
    const row = await this.db.penaltyRecord.findFirst({
      where: { AND: [{ id }, scope] },
      select: { status: true, date: true },
    });
    return row && { status: row.status, date: toIsoDate(row.date) };
  }

  /** The ids of the records in `scope` (the Activity log's filter, R5). */
  async findIdsInScope(scope: PenaltyScopeWhere): Promise<string[]> {
    const rows = await this.db.penaltyRecord.findMany({
      where: scope,
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /**
   * The ids of the records of one employee, or (`code`) of the employees whose code contains it,
   * any case — their History and Activity's search (audit log).
   */
  async findIdsOfEmployees(by: { employeeId: string } | { code: string }): Promise<string[]> {
    const rows = await this.db.penaltyRecord.findMany({
      where:
        'employeeId' in by
          ? { employeeId: by.employeeId }
          : { employee: { code: codeContains(by.code) } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /** Statuses of the pair's records on `date` (the preview's once-per-day check, §4). */
  sameDayStatuses(key: RepeatKey, date: IsoDate): Promise<PenaltyStatus[]> {
    return sameDayStatuses(this.db, key, date);
  }

  /**
   * Records a penalty (PENDING_REVIEW or WAITING_HR, `data.status`), unless `refuse` says the day is taken (§4 once per day) — then
   * nothing is written and null is returned. Checked and written under the pair's lock, so two
   * concurrent recordings of the same day can't both pass.
   */
  createRecord(data: RecordCreateData, refuse: SameDayRefusal): Promise<RecordRow | null> {
    return this.txHost.withTransaction(async () => {
      const tx = this.txHost.tx;
      await lockPair(tx, data);
      if (refuse(await sameDayStatuses(tx, data, data.date))) return null;
      return tx.penaltyRecord.create({
        data: { ...data, date: fromIsoDate(data.date) },
        select: RECORD_SELECT,
      });
    });
  }

  /**
   * APPROVED records of the pairs dated up to `upTo` (and from `from`, when given), same date
   * included: which of them come earlier is the domain's call (`countPriorInWindow`, §4). One
   * query for a whole page of rows. `withPending`: waiting ones (either step) too (a pending row's order check,
   * `earlierPendingPenalty`). `upTo` undefined: later dates too (what a backdated one recounts).
   */
  async approvedCandidates(
    keys: readonly RepeatKey[],
    upTo: IsoDate | undefined,
    from?: IsoDate,
    { withPending = false }: { withPending?: boolean } = {},
  ): Promise<ApprovedCandidate[]> {
    if (keys.length === 0) return [];
    const rows = await this.db.penaltyRecord.findMany({
      where: candidatesWhere(keys, upTo, from, withPending ? APPROVED_OR_PENDING : undefined),
      select: CANDIDATE_SELECT,
    });
    return rows.map(toCandidate);
  }

  /**
   * Approves a PENDING record, fixing the level `resolve` computes from the pair's APPROVED
   * records in `window` (same date included; `resolve` decides which come earlier, §4).
   * Writes of the same employee + violation are serialised with a transaction-level advisory
   * lock, so two approvals can't both read the same records, and the once-per-day rule (`refuse`,
   * §4) is checked again inside the same transaction. So is the date order (`earlier`, §4): under
   * the same lock, so of two concurrent approvals of the 19th and the 20th the 20th either sees the
   * 19th approved (and counts it) or still pending (and is refused) — never neither. NOT_PENDING
   * when the record was no longer PENDING; ONCE_PER_DAY when another record of that day is already
   * approved; `{ earlierPending }` when an earlier record of the pair is still pending.
   *
   * §4 backdated penalty (owner 2026-11-20): `recount` gets the pair's records from the window's
   * start on — later dates included — and returns the approved ones this approval moves up (or
   * throws to refuse). They are written in the same transaction, under the same lock, after the
   * approval itself (`recountedAt` set: a draft payroll run is due a Recalculate).
   */
  async approve(
    id: string,
    key: RepeatKey,
    window: { from: IsoDate; upTo: IsoDate },
    approvedById: string | null,
    resolve: (approved: ApprovedCandidate[]) => CatalogueLevel,
    refuse: SameDayRefusal,
    earlier: EarlierPendingCheck,
    recount: RecountPlan = () => Promise.resolve([]),
    /** The statuses it may be approved from: WAITING_HR (and PENDING_REVIEW when HR may decide it). */
    from: readonly PenaltyStatus[] = [PenaltyStatus.WAITING_HR],
    note: string | null = null,
  ): Promise<ApproveOutcome> {
    return this.txHost.withTransaction(async () => {
      const tx = this.txHost.tx;
      await lockPair(tx, key);
      // Still pending? Checked first, under the lock: a concurrent approval that won has already
      // recounted, so the loser must hear "not pending", not a stale-recount or order refusal.
      const self = await tx.penaltyRecord.findUnique({ where: { id }, select: { status: true } });
      if (!self || !from.includes(self.status)) return 'NOT_PENDING';
      // `window.upTo` is the record's own date.
      if (refuse(await sameDayStatuses(tx, key, window.upTo, id))) return 'ONCE_PER_DAY';
      // Every later date too: which come earlier is the domain's call; later approved ones are
      // what a backdated approval recounts.
      const rows = await tx.penaltyRecord.findMany({
        where: { ...candidatesWhere([key], undefined, window.from, APPROVED_OR_PENDING), id: { not: id } },
        select: CANDIDATE_SELECT,
      });
      const pairRecords = rows.map(toCandidate);
      const blocker = earlier(pairRecords);
      if (blocker) return { earlierPending: blocker.date, stageId: blocker.stageId };
      const fixed = resolve(pairRecords.filter((r) => r.status === PenaltyStatus.APPROVED));
      const updates = await recount(pairRecords);
      const now = new Date();
      const { count } = await tx.penaltyRecord.updateMany({
        where: { id, status: { in: [...from] } },
        data: {
          // The snapshot is fixed here, names included (spec 2026-11-25).
          ...toSnapshotData(fixed),
          status: PenaltyStatus.APPROVED,
          approvedById,
          approvedAt: now,
          approvalNote: note,
        },
      });
      if (count !== 1) return 'NOT_PENDING';
      for (const u of updates) {
        const moved = await tx.penaltyRecord.updateMany({
          where: { id: u.id, status: PenaltyStatus.APPROVED, level: u.fromLevel },
          data: {
            level: u.level,
            actionId: u.actionId,
            actionNameEn: u.actionNameEn,
            actionNameAr: u.actionNameAr,
            effect: u.effect,
            percentBase: u.percentBase,
            days: u.days,
            percent: u.percent,
            amount: u.amount,
            recountedAt: now,
          },
        });
        if (moved.count !== 1) throw new RecountConflictError(u.id);
      }
      return 'APPROVED';
    });
  }

  /**
   * Whether a penalty dated in `month` was recounted after `since` (§4, §6): a draft run calculated
   * before then is due a Recalculate.
   */
  async recountedInMonthSince(month: string, since: Date, scope: PenaltyScopeWhere = {}): Promise<boolean> {
    const found = await this.db.penaltyRecord.findFirst({
      where: { AND: [{ date: monthDateRange(month), recountedAt: { gt: since } }, scope] },
      select: { id: true },
    });
    return found !== null;
  }

  /** Waiting (either step) and APPROVED records dated in a month: what payroll counts and flags (§6). */
  findForPayroll(
    month: string,
  ): Promise<
    {
      employeeId: string;
      status: PenaltyStatus;
      effect: PenaltyEffect;
      percentBase: PenaltySalaryBase | null;
      days: Prisma.Decimal | null;
      percent: Prisma.Decimal | null;
      amount: number | null;
    }[]
  > {
    return this.db.penaltyRecord.findMany({
      where: {
        date: monthDateRange(month),
        status: { in: [...OPEN_PENALTY_STATUSES, PenaltyStatus.APPROVED] },
      },
      select: { employeeId: true, status: true, effect: true, percentBase: true, days: true, percent: true, amount: true },
    });
  }

  /** How many records dated in a month still wait at either step (the payroll run's live notice). */
  /** `scope`: only the penalties a scoped payroll viewer covers (`penaltyWhere`, L3 / L-5); `{}`: all. */
  countPendingInMonth(month: string, scope: PenaltyScopeWhere = {}): Promise<number> {
    return this.db.penaltyRecord.count({
      where: { AND: [{ date: monthDateRange(month), status: { in: [...OPEN_PENALTY_STATUSES] } }, scope] },
    });
  }

  /** One employee's APPROVED records dated in a month, by date, for the payslip. */
  findApprovedForPayslip(month: string, employeeId: string) {
    return this.db.penaltyRecord.findMany({
      where: { employeeId, status: PenaltyStatus.APPROVED, date: monthDateRange(month) },
      select: {
        date: true,
        level: true,
        ...SNAPSHOT_SELECT,
        violation: { select: { nameEn: true, nameAr: true } },
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /** How many records dated in a month (in `scope`) are in each status. */
  async countByStatusInMonth(
    month: string,
    scope: PenaltyScopeWhere = {},
  ): Promise<Record<PenaltyStatus, number>> {
    const groups = await this.db.penaltyRecord.groupBy({
      by: ['status'],
      where: { AND: [{ date: monthDateRange(month) }, scope] },
      _count: { _all: true },
    });
    const counts: Record<PenaltyStatus, number> = {
      PENDING_REVIEW: 0,
      WAITING_HR: 0,
      APPROVED: 0,
      REJECTED: 0,
      CANCELLED: 0,
    };
    for (const g of groups) counts[g.status] = g._count._all;
    return counts;
  }

  /**
   * The stage review approves a PENDING_REVIEW record: WAITING_HR, with who, when and the note
   * (§4 two steps). A conditional update: of two reviews at once exactly one matches; false for the
   * other (or when it was no longer waiting for review).
   */
  async review(id: string, reviewedById: string | null, note: string | null): Promise<boolean> {
    const { count } = await this.db.penaltyRecord.updateMany({
      where: { id, status: PenaltyStatus.PENDING_REVIEW },
      data: {
        status: PenaltyStatus.WAITING_HR,
        reviewedById,
        reviewedAt: new Date(),
        reviewNote: note,
      },
    });
    return count === 1;
  }

  /**
   * Rejects a record waiting in one of `from`, with the reason and the step (§4 two steps). Under
   * the pair's lock, like a cancel. False when it was no longer in one of `from`.
   */
  async reject(
    id: string,
    from: readonly PenaltyStatus[],
    rejectedById: string | null,
    reason: string,
    step: PenaltyStep,
    key: RepeatKey,
  ): Promise<boolean> {
    return this.txHost.withTransaction(async () => {
      const tx = this.txHost.tx;
      await lockPair(tx, key);
      const { count } = await tx.penaltyRecord.updateMany({
        where: { id, status: { in: [...from] } },
        data: {
          status: PenaltyStatus.REJECTED,
          rejectedById,
          rejectedAt: new Date(),
          rejectedStep: step,
          rejectionReason: reason,
        },
      });
      return count === 1;
    });
  }

  /**
   * Cancels a waiting (either step) or APPROVED record. Returns false when it was already final. `key`: under
   * the pair's lock, so a cancel can't slip between a backdated approval's recount and its writes.
   */
  async cancel(
    id: string,
    reason: string,
    cancelledById: string | null,
    key?: RepeatKey,
  ): Promise<boolean> {
    return this.txHost.withTransaction(async () => {
      const tx = this.txHost.tx;
      if (key) await lockPair(tx, key);
      const { count } = await tx.penaltyRecord.updateMany({
        where: { id, status: { in: [...OPEN_PENALTY_STATUSES, PenaltyStatus.APPROVED] } },
        data: {
          status: PenaltyStatus.CANCELLED,
          cancelReason: reason,
          cancelledById,
          cancelledAt: new Date(),
        },
      });
      return count === 1;
    });
  }
}
