import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { Prisma } from '@prisma/client';
import { PenaltyStatus, type IsoDate, type PenaltyAction } from '@school-erp/shared';
import { BaseRepository } from '../../../../common/repositories/base.repository';
import { fromIsoDate, monthDateRange, toIsoDate } from '../../../../common/utils/dates.util';
import { DatabaseService } from '../../../../database/database.service';
import type { DbAdapter, DbClient } from '../../../../database/transactions';
import { LEVEL_SELECT, type LevelData } from './penalty-catalogue.repository';

const USER_REF = { select: { id: true, name: true } } as const;

export const RECORD_SELECT = {
  id: true,
  employeeId: true,
  violationId: true,
  date: true,
  status: true,
  level: true,
  action: true,
  days: true,
  note: true,
  cancelReason: true,
  createdAt: true,
  employee: { select: { id: true, code: true, nameEn: true, nameAr: true, photoUrl: true, gender: true } },
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
  approvedBy: USER_REF,
} satisfies Prisma.PenaltyRecordSelect;

export type RecordRow = Prisma.PenaltyRecordGetPayload<{ select: typeof RECORD_SELECT }>;

export interface RecordCreateData extends LevelData {
  employeeId: string;
  violationId: string;
  date: IsoDate;
  note: string | null;
  createdById: string | null;
}

export interface RecordListFilter {
  employeeId?: string;
  /** `YYYY-MM`: records dated in that month. */
  month?: string;
  status?: PenaltyStatus;
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
export interface ApprovedCandidate extends RepeatKey, LevelData {
  id: string;
  date: IsoDate;
  recordedAt: Date;
  status: PenaltyStatus;
}

const CANDIDATE_SELECT = {
  id: true,
  employeeId: true,
  violationId: true,
  date: true,
  createdAt: true,
  status: true,
  level: true,
  action: true,
  days: true,
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
  level: r.level,
  action: r.action,
  days: r.days === null ? null : Number(r.days),
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

/** How an approval ended (`approve`); `earlierPending`: the date of the penalty to approve first (§4). */
export type ApproveOutcome =
  | 'APPROVED'
  | 'NOT_PENDING'
  | 'ONCE_PER_DAY'
  | { earlierPending: IsoDate };

/** §4 approve in date order: the pair's earlier PENDING record that blocks the approval, or null. */
export type EarlierPendingCheck = (pairRecords: ApprovedCandidate[]) => ApprovedCandidate | null;

/** One approved record a backdated approval moves up: its level when read, and its new values. */
export interface RecountUpdate extends LevelData {
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

/** The statuses whose records a pending row's level and order check look at. */
const APPROVED_OR_PENDING = [PenaltyStatus.APPROVED, PenaltyStatus.PENDING] as const;

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

  /** `scope`: the employees whose records the viewer may see (R5) — `{}` for all. */
  list(
    page: number | undefined,
    limit: number | undefined,
    filter: RecordListFilter,
    scope: Prisma.EmployeeWhereInput = {},
  ) {
    const where: Prisma.PenaltyRecordWhereInput = { AND: [{ employee: scope }] };
    if (filter.employeeId) where.employeeId = filter.employeeId;
    if (filter.status) where.status = filter.status;
    if (filter.month) where.date = monthDateRange(filter.month);
    if (filter.search) {
      const contains = { contains: filter.search, mode: 'insensitive' as const };
      where.OR = [
        { employee: { code: contains } },
        { employee: { nameEn: contains } },
        { employee: { nameAr: contains } },
        { violation: { nameEn: contains } },
        { violation: { nameAr: contains } },
      ];
    }
    return this.findAllWithPagination(page, limit, undefined, undefined, where, {
      select: RECORD_SELECT,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /** The record, or null when unknown or its employee is outside `scope` (R5 — the caller 404s). */
  findOne(id: string, scope: Prisma.EmployeeWhereInput = {}): Promise<RecordRow | null> {
    return this.db.penaltyRecord.findFirst({
      where: { id, employee: scope },
      select: RECORD_SELECT,
    });
  }

  /** Status only, for deciding which error a failed status change gets. */
  async findStatus(
    id: string,
    scope: Prisma.EmployeeWhereInput = {},
  ): Promise<{ status: PenaltyStatus; date: IsoDate } | null> {
    const row = await this.db.penaltyRecord.findFirst({
      where: { id, employee: scope },
      select: { status: true, date: true },
    });
    return row && { status: row.status, date: toIsoDate(row.date) };
  }

  /** The ids of the records whose employee is in `scope` (the Activity log's filter, R5). */
  async findIdsInScope(scope: Prisma.EmployeeWhereInput): Promise<string[]> {
    const rows = await this.db.penaltyRecord.findMany({
      where: { employee: scope },
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
          : { employee: { code: { contains: by.code, mode: 'insensitive' } } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /** Statuses of the pair's records on `date` (the preview's once-per-day check, §4). */
  sameDayStatuses(key: RepeatKey, date: IsoDate): Promise<PenaltyStatus[]> {
    return sameDayStatuses(this.db, key, date);
  }

  /**
   * Records a PENDING penalty, unless `refuse` says the day is taken (§4 once per day) — then
   * nothing is written and null is returned. Checked and written under the pair's lock, so two
   * concurrent recordings of the same day can't both pass.
   */
  createRecord(data: RecordCreateData, refuse: SameDayRefusal): Promise<RecordRow | null> {
    return this.txHost.withTransaction(async () => {
      const tx = this.txHost.tx;
      await lockPair(tx, data);
      if (refuse(await sameDayStatuses(tx, data, data.date))) return null;
      return tx.penaltyRecord.create({
        data: { ...data, date: fromIsoDate(data.date), status: PenaltyStatus.PENDING },
        select: RECORD_SELECT,
      });
    });
  }

  /**
   * APPROVED records of the pairs dated up to `upTo` (and from `from`, when given), same date
   * included: which of them come earlier is the domain's call (`countPriorInWindow`, §4). One
   * query for a whole page of rows. `withPending`: PENDING ones too (a pending row's order check,
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
    resolve: (approved: ApprovedCandidate[]) => LevelData,
    refuse: SameDayRefusal,
    earlier: EarlierPendingCheck,
    recount: RecountPlan = () => Promise.resolve([]),
  ): Promise<ApproveOutcome> {
    return this.txHost.withTransaction(async () => {
      const tx = this.txHost.tx;
      await lockPair(tx, key);
      // Still pending? Checked first, under the lock: a concurrent approval that won has already
      // recounted, so the loser must hear "not pending", not a stale-recount or order refusal.
      const self = await tx.penaltyRecord.findUnique({ where: { id }, select: { status: true } });
      if (self?.status !== PenaltyStatus.PENDING) return 'NOT_PENDING';
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
      if (blocker) return { earlierPending: blocker.date };
      const fixed = resolve(pairRecords.filter((r) => r.status === PenaltyStatus.APPROVED));
      const updates = await recount(pairRecords);
      const now = new Date();
      const { count } = await tx.penaltyRecord.updateMany({
        where: { id, status: PenaltyStatus.PENDING },
        data: {
          level: fixed.level,
          action: fixed.action,
          days: fixed.days,
          status: PenaltyStatus.APPROVED,
          approvedById,
          approvedAt: now,
        },
      });
      if (count !== 1) return 'NOT_PENDING';
      for (const u of updates) {
        const moved = await tx.penaltyRecord.updateMany({
          where: { id: u.id, status: PenaltyStatus.APPROVED, level: u.fromLevel },
          data: { level: u.level, action: u.action, days: u.days, recountedAt: now },
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
  async recountedInMonthSince(month: string, since: Date): Promise<boolean> {
    const found = await this.db.penaltyRecord.findFirst({
      where: { date: monthDateRange(month), recountedAt: { gt: since } },
      select: { id: true },
    });
    return found !== null;
  }

  /** PENDING and APPROVED records dated in a month: what payroll counts and flags (§6). */
  findForPayroll(
    month: string,
  ): Promise<
    {
      employeeId: string;
      status: PenaltyStatus;
      action: PenaltyAction;
      days: Prisma.Decimal | null;
    }[]
  > {
    return this.db.penaltyRecord.findMany({
      where: {
        date: monthDateRange(month),
        status: { in: [PenaltyStatus.PENDING, PenaltyStatus.APPROVED] },
      },
      select: { employeeId: true, status: true, action: true, days: true },
    });
  }

  /** How many PENDING records are dated in a month (the payroll run's live notice). */
  countPendingInMonth(month: string): Promise<number> {
    return this.db.penaltyRecord.count({
      where: { date: monthDateRange(month), status: PenaltyStatus.PENDING },
    });
  }

  /** One employee's APPROVED records dated in a month, by date, for the payslip. */
  findApprovedForPayslip(month: string, employeeId: string) {
    return this.db.penaltyRecord.findMany({
      where: { employeeId, status: PenaltyStatus.APPROVED, date: monthDateRange(month) },
      select: {
        date: true,
        level: true,
        action: true,
        days: true,
        violation: { select: { nameEn: true, nameAr: true } },
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /** How many records dated in a month (of employees in `scope`) are in each status. */
  async countByStatusInMonth(
    month: string,
    scope: Prisma.EmployeeWhereInput = {},
  ): Promise<Record<PenaltyStatus, number>> {
    const groups = await this.db.penaltyRecord.groupBy({
      by: ['status'],
      where: { date: monthDateRange(month), employee: scope },
      _count: { _all: true },
    });
    const counts: Record<PenaltyStatus, number> = { PENDING: 0, APPROVED: 0, CANCELLED: 0 };
    for (const g of groups) counts[g.status] = g._count._all;
    return counts;
  }

  /**
   * Cancels a PENDING or APPROVED record. Returns false when it was already CANCELLED. `key`: under
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
        where: { id, status: { in: [PenaltyStatus.PENDING, PenaltyStatus.APPROVED] } },
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
