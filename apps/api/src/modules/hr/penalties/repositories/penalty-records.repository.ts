import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PenaltyStatus, type IsoDate, type PenaltyAction } from '@school-erp/shared';
import { BaseRepository } from '../../../../common/repositories/base.repository';
import { fromIsoDate, monthDateRange, toIsoDate } from '../../../../common/utils/dates.util';
import { DatabaseService } from '../../../../database/database.service';
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
  employee: { select: { id: true, code: true, nameEn: true, nameAr: true, photoUrl: true } },
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
 * An APPROVED record as the repeat count looks at it (§4): its pair, status and place in the
 * repeat order (violation date, then when recorded, then id). Same shape as the domain's
 * `RecordedPenalty`.
 */
export interface ApprovedCandidate extends RepeatKey {
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
});

/** APPROVED records of the pairs dated `from <= date <= upTo` (same date included: §4). */
const candidatesWhere = (
  keys: readonly RepeatKey[],
  upTo: IsoDate,
  from?: IsoDate,
): Prisma.PenaltyRecordWhereInput => ({
  status: PenaltyStatus.APPROVED,
  date: { ...(from ? { gte: fromIsoDate(from) } : {}), lte: fromIsoDate(upTo) },
  OR: keys.map((k) => ({ employeeId: k.employeeId, violationId: k.violationId })),
});

/** How an approval ended (`approve`). */
export type ApproveOutcome = 'APPROVED' | 'NOT_PENDING' | 'ONCE_PER_DAY';

/**
 * §4 once per day: given the statuses of the OTHER records of the same pair and date, whether the
 * write must be refused (the service passes the domain's `oncePerDayRefuses`).
 */
export type SameDayRefusal = (sameDayOthers: PenaltyStatus[]) => boolean;

type Tx = Prisma.TransactionClient;

/**
 * Serialises writes of one employee + violation pair (recording and approving) for the rest of the
 * transaction, so two of them can't both read the same count or the same free day.
 */
const lockPair = (tx: Tx, key: RepeatKey) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`penalty:${key.employeeId}:${key.violationId}`}))`;

/** Statuses of the pair's records dated `date`, other than `exceptId`. */
async function sameDayStatuses(
  db: Tx | DatabaseService,
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
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'penaltyRecord');
  }

  private get db(): DatabaseService {
    return this.databaseService;
  }

  list(page: number | undefined, limit: number | undefined, filter: RecordListFilter) {
    const where: Prisma.PenaltyRecordWhereInput = {};
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

  findOne(id: string): Promise<RecordRow | null> {
    return this.db.penaltyRecord.findUnique({ where: { id }, select: RECORD_SELECT });
  }

  /** Status only, for deciding which error a failed status change gets. */
  async findStatus(id: string): Promise<{ status: PenaltyStatus; date: IsoDate } | null> {
    const row = await this.db.penaltyRecord.findUnique({
      where: { id },
      select: { status: true, date: true },
    });
    return row && { status: row.status, date: toIsoDate(row.date) };
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
    return this.db.$transaction(async (tx) => {
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
   * query for a whole page of rows.
   */
  async approvedCandidates(
    keys: readonly RepeatKey[],
    upTo: IsoDate,
    from?: IsoDate,
  ): Promise<ApprovedCandidate[]> {
    if (keys.length === 0) return [];
    const rows = await this.db.penaltyRecord.findMany({
      where: candidatesWhere(keys, upTo, from),
      select: CANDIDATE_SELECT,
    });
    return rows.map(toCandidate);
  }

  /**
   * Approves a PENDING record, fixing the level `resolve` computes from the pair's APPROVED
   * records in `window` (same date included; `resolve` decides which come earlier, §4).
   * Writes of the same employee + violation are serialised with a transaction-level advisory
   * lock, so two approvals can't both read the same records, and the once-per-day rule (`refuse`,
   * §4) is checked again inside the same transaction. NOT_PENDING when the record was no longer
   * PENDING; ONCE_PER_DAY when another record of that day is already approved.
   */
  async approve(
    id: string,
    key: RepeatKey,
    window: { from: IsoDate; upTo: IsoDate },
    approvedById: string | null,
    resolve: (approved: ApprovedCandidate[]) => LevelData,
    refuse: SameDayRefusal,
  ): Promise<ApproveOutcome> {
    return this.db.$transaction(async (tx) => {
      await lockPair(tx, key);
      // `window.upTo` is the record's own date.
      if (refuse(await sameDayStatuses(tx, key, window.upTo, id))) return 'ONCE_PER_DAY';
      const approved = await tx.penaltyRecord.findMany({
        where: candidatesWhere([key], window.upTo, window.from),
        select: CANDIDATE_SELECT,
      });
      const fixed = resolve(approved.map(toCandidate));
      const { count } = await tx.penaltyRecord.updateMany({
        where: { id, status: PenaltyStatus.PENDING },
        data: {
          level: fixed.level,
          action: fixed.action,
          days: fixed.days,
          status: PenaltyStatus.APPROVED,
          approvedById,
          approvedAt: new Date(),
        },
      });
      return count === 1 ? 'APPROVED' : 'NOT_PENDING';
    });
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

  /** How many records dated in a month are in each status. */
  async countByStatusInMonth(month: string): Promise<Record<PenaltyStatus, number>> {
    const groups = await this.db.penaltyRecord.groupBy({
      by: ['status'],
      where: { date: monthDateRange(month) },
      _count: { _all: true },
    });
    const counts: Record<PenaltyStatus, number> = { PENDING: 0, APPROVED: 0, CANCELLED: 0 };
    for (const g of groups) counts[g.status] = g._count._all;
    return counts;
  }

  /** Cancels a PENDING or APPROVED record. Returns false when it was already CANCELLED. */
  async cancel(id: string, reason: string, cancelledById: string | null): Promise<boolean> {
    const { count } = await this.db.penaltyRecord.updateMany({
      where: { id, status: { in: [PenaltyStatus.PENDING, PenaltyStatus.APPROVED] } },
      data: {
        status: PenaltyStatus.CANCELLED,
        cancelReason: reason,
        cancelledById,
        cancelledAt: new Date(),
      },
    });
    return count === 1;
  }
}
