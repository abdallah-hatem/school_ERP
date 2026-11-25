import {
  contractYearFor,
  isOpenPenaltyStatus,
  PenaltyStatus,
  type IsoDate,
  type PenaltyEffect,
  type PenaltySalaryBase,
  type RepetitionWindow,
} from '@school-erp/shared';

/** The level fields `penaltyLevel` needs from a violation's catalogue levels. */
export interface LevelRef {
  level: number;
}

/**
 * The repeat level of a new penalty (§4): 1 + the number of approved earlier penalties (earlier
 * date, or same date and recorded earlier) for the same violation and employee inside the
 * repetition window. After the last defined level, the
 * last level repeats (GUESS).
 *
 * `levels` are the violation's catalogue levels (1..n, no gaps). The caller counts the prior
 * approved penalties; this function only maps the count to a level.
 *
 * @example penaltyLevel(0, levels5) // 1
 * @example penaltyLevel(7, levels5) // 5 (last level repeats)
 */
export function penaltyLevel(priorApprovedCount: number, levels: readonly LevelRef[]): number {
  if (!Number.isInteger(priorApprovedCount) || priorApprovedCount < 0) {
    throw new RangeError(`priorApprovedCount must be a whole number ≥ 0, got ${priorApprovedCount}`);
  }
  if (levels.length === 0) throw new RangeError('a violation needs at least one level');
  const last = Math.max(...levels.map((l) => l.level));
  return Math.min(priorApprovedCount + 1, last);
}

/**
 * A penalty action as a level names it and a penalty keeps it (spec 2026-11-25): names, effect and
 * — for a % — its salary base. On a penalty this is the snapshot (fixed at approval).
 */
export interface ActionSnapshot {
  id: string;
  nameEn: string;
  nameAr: string;
  effect: PenaltyEffect;
  percentBase: PenaltySalaryBase | null;
}

/** A level's number: exactly the one its action's effect asks for (shared `levelValueProblem`). */
export interface LevelNumbers {
  days: number | null;
  percent: number | null;
  /** Piastres. */
  amount: number | null;
}

/** A catalogue level with the fields a recorded penalty copies: its action and its number. */
export interface CatalogueLevel extends LevelRef, LevelNumbers {
  action: ActionSnapshot;
}

/** The copy a penalty takes of a level: the action snapshot and the number, nothing shared. */
export function copyLevel(entry: CatalogueLevel): CatalogueLevel {
  return {
    level: entry.level,
    action: { ...entry.action },
    days: entry.days,
    percent: entry.percent,
    amount: entry.amount,
  };
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * The first day (inclusive) of the repetition window for a penalty dated `date` (§4, §7):
 * - CONTRACT_YEAR — 1 June of the contract year holding `date` (1 June – 31 May, GUESS default)
 * - CALENDAR_YEAR — 1 January of `date`'s year
 * - ROLLING_12_MONTHS — the same day 12 months earlier (29 Feb → 28 Feb)
 *
 * Earlier penalties count when `windowStart <= their date` and they come earlier in the repeat
 * order (`isEarlierPenalty`).
 */
export function repetitionWindowStart(date: IsoDate, window: RepetitionWindow): IsoDate {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  switch (window) {
    case 'CONTRACT_YEAR':
      return contractYearFor(date).start;
    case 'CALENDAR_YEAR':
      return `${y}-01-01`;
    case 'ROLLING_12_MONTHS': {
      const lastDay = new Date(Date.UTC(y - 1, m, 0)).getUTCDate();
      return `${y - 1}-${pad2(m)}-${pad2(Math.min(d, lastDay))}`;
    }
  }
}

/** Where a recorded penalty sits in the repeat order (§4): violation date, then when recorded. */
export interface PenaltyPosition {
  date: IsoDate;
  /** When the penalty was recorded (`created_at`). */
  recordedAt: Date;
  /** Final tie-break when two penalties were recorded at the same instant. */
  id: string;
}

/** The employee + violation pair whose penalties repeat each other. */
export interface PenaltyPair {
  employeeId: string;
  violationId: string;
}

/** A recorded penalty as the repeat count looks at it. */
export interface RecordedPenalty extends PenaltyPair, PenaltyPosition {
  status: PenaltyStatus;
}

/**
 * The penalty whose level is being worked out. Without `recordedAt` / `id` it is not recorded
 * yet (preview, or the moment of recording): it will be recorded after every existing penalty,
 * so all of them on the same date come before it.
 */
export type PenaltyTarget = PenaltyPair & ({ date: IsoDate } | PenaltyPosition);

/**
 * Whether `other` comes before `target` in the repeat order (§4 DECIDED, owner 2026-11-18):
 * an earlier violation date, or the same date and recorded earlier (`recordedAt`, then `id`).
 */
export function isEarlierPenalty(
  other: PenaltyPosition,
  target: { date: IsoDate } | PenaltyPosition,
): boolean {
  // ISO dates compare correctly as strings.
  if (other.date !== target.date) return other.date < target.date;
  if (!('recordedAt' in target)) return true;
  const a = other.recordedAt.getTime();
  const b = target.recordedAt.getTime();
  if (a !== b) return a < b;
  // UUIDs: lowercase hex compares as strings the way Postgres orders the uuid type.
  return other.id < target.id;
}

/**
 * How many of `records` count toward `target`'s level (§4): APPROVED (waiting, rejected and
 * cancelled never count; levels count across all of the employee's stages, owner 2026-11-21), the same employee and violation, inside the repetition window, and earlier in the
 * repeat order (`isEarlierPenalty`). `target` itself never counts.
 */
export function countPriorInWindow(
  target: PenaltyTarget,
  window: RepetitionWindow,
  records: readonly RecordedPenalty[],
): number {
  const start = repetitionWindowStart(target.date, window);
  return records.filter(
    (p) =>
      p.status === PenaltyStatus.APPROVED &&
      p.employeeId === target.employeeId &&
      p.violationId === target.violationId &&
      p.date >= start &&
      isEarlierPenalty(p, target),
  ).length;
}

/**
 * The penalty that must be approved or cancelled before `target` can be approved (§4 DECIDED,
 * owner 2026-11-20: approve in date order): the EARLIEST still-waiting penalty — at the stage
 * review or at HR (owner 2026-11-21) — of the same
 * employee and violation, inside `target`'s repetition window, that comes before it in the repeat
 * order (`isEarlierPenalty`). Null when there is none — approved, rejected and cancelled ones never block,
 * nor do other violations, other employees, or a same-date penalty recorded after `target`.
 *
 * Approving out of order would fix a level that ignores the earlier one (18 approved → L1; approve
 * 20 → L2; then 19 → also L2), so the approval waits for it.
 *
 * @example earlierPendingPenalty(the20th, 'CONTRACT_YEAR', [the18th(APPROVED), the19th(PENDING)]) // the19th
 */
export function earlierPendingPenalty<R extends RecordedPenalty>(
  target: PenaltyTarget,
  window: RepetitionWindow,
  records: readonly R[],
): R | null {
  const start = repetitionWindowStart(target.date, window);
  const blocking = records.filter(
    (p) =>
      isOpenPenaltyStatus(p.status) &&
      p.employeeId === target.employeeId &&
      p.violationId === target.violationId &&
      p.date >= start &&
      // `target` itself never blocks (nor is it ever "earlier" than itself).
      !('id' in target && p.id === target.id) &&
      isEarlierPenalty(p, target),
  );
  return blocking.reduce<R | null>(
    (earliest, p) => (earliest === null || isEarlierPenalty(p, earliest) ? p : earliest),
    null,
  );
}

/**
 * The level, action and number a penalty gets from its violation's catalogue levels, given the
 * number of prior approved penalties. "Doubles on repeat" stays text: numbers are never doubled.
 */
export function resolvePenalty(
  priorApprovedCount: number,
  levels: readonly CatalogueLevel[],
): CatalogueLevel {
  const level = penaltyLevel(priorApprovedCount, levels);
  const entry = levels.find((l) => l.level === level);
  if (!entry) throw new RangeError(`level ${level} is missing from the catalogue levels`);
  return copyLevel(entry);
}

/** An APPROVED penalty with the level, action and number fixed on it — what a recount may change. */
export interface ApprovedPenalty extends RecordedPenalty, CatalogueLevel {}

/** One approved penalty a backdated approval moves up (§4 DECIDED, owner 2026-11-20). */
export interface RecountChange<R extends ApprovedPenalty = ApprovedPenalty> {
  record: R;
  before: CatalogueLevel;
  after: CatalogueLevel;
}

/** Whether `target` (recorded or not) comes before `other` in the repeat order. */
function comesBefore(target: PenaltyTarget, other: PenaltyPosition): boolean {
  if ('id' in target && target.id === other.id) return false;
  if (!('recordedAt' in target)) return target.date < other.date;
  return isEarlierPenalty(target, other);
}

/**
 * What approving `target` does to the pair's APPROVED penalties that come AFTER it (§4 DECIDED,
 * owner 2026-11-20: a backdated penalty recounts the later ones — the one exception to "approved
 * levels are never recomputed"). Each approved penalty of the same employee and violation that
 * comes later in the repeat order (`isEarlierPenalty`), and whose own repetition window holds
 * `target`'s date, now has one more earlier approved penalty, so it moves up ONE level — capped at
 * the violation's last level (a capped one doesn't change and isn't listed). Its action and number
 * become those of its new level in `levels` (today's catalogue — names and effect included: the source an approval uses — the
 * catalogue keeps no history). Gaps left by cancellations stay: a cancellation never recounts, and
 * this only adds the one penalty being approved.
 *
 * Pending and cancelled penalties are never changed (a pending one is shown from today's count
 * anyway). Other employees, other violations, and penalties outside the window are untouched.
 * `target` not recorded yet (preview, recording): it comes after every same-date penalty, so only
 * later dates move. Sorted by the repeat order.
 *
 * @example recountAfterApproval(the18th, 'CONTRACT_YEAR', [the19th(L1), the20th(L2)], levels5)
 *   // [the19th 1 → 2, the20th 2 → 3]
 */
export function recountAfterApproval<R extends ApprovedPenalty>(
  target: PenaltyTarget,
  window: RepetitionWindow,
  records: readonly R[],
  levels: readonly CatalogueLevel[],
): RecountChange<R>[] {
  if (levels.length === 0) throw new RangeError('a violation needs at least one level');
  const last = Math.max(...levels.map((l) => l.level));
  const changes: RecountChange<R>[] = [];
  for (const r of records) {
    if (r.status !== PenaltyStatus.APPROVED) continue;
    if (r.employeeId !== target.employeeId || r.violationId !== target.violationId) continue;
    if (!comesBefore(target, r)) continue;
    if (target.date < repetitionWindowStart(r.date, window)) continue;
    const level = Math.min(r.level + 1, last);
    // Capped (or a level above today's last one): it stays as it was.
    if (level <= r.level) continue;
    const entry = levels.find((l) => l.level === level);
    if (!entry) throw new RangeError(`level ${level} is missing from the catalogue levels`);
    changes.push({
      record: r,
      before: copyLevel(r),
      after: copyLevel(entry),
    });
  }
  return changes.sort((a, b) => (isEarlierPenalty(a.record, b.record) ? -1 : 1));
}

/**
 * The earliest month among `changes` whose payroll is approved (`lockedMonths`, `YYYY-MM`), or null
 * (§4 DECIDED, owner 2026-11-20): an approved month can't be recounted, so the recording — or the
 * approval — is refused naming it; corrections for approved months go into the next month as
 * adjustments (§6).
 */
export function recountLockedMonth(
  changes: readonly RecountChange[],
  lockedMonths: ReadonlySet<string>,
): string | null {
  const locked = changes.map((c) => c.record.date.slice(0, 7)).filter((m) => lockedMonths.has(m));
  return locked.length === 0 ? null : locked.reduce((a, b) => (a < b ? a : b));
}

/** What the user confirmed: each recounted penalty and the level, action and number it gets. */
export interface RecountAcknowledgement {
  id: string;
  level: number;
  actionId: string;
  days: number | null;
  percent: number | null;
  amount: number | null;
}

/**
 * Whether the user's confirmation (`acknowledged`: the list their screen showed) is exactly what
 * approving now does (`changes`): the same penalties, each to the same level, action and number, in
 * any order (§4 DECIDED, owner 2026-11-20 — a stale screen can't recount silently). `undefined`
 * (nothing confirmed) matches only when nothing changes.
 */
export function recountAcknowledged(
  changes: readonly RecountChange[],
  acknowledged: readonly RecountAcknowledgement[] | undefined,
): boolean {
  if (acknowledged === undefined) return changes.length === 0;
  if (acknowledged.length !== changes.length) return false;
  const byId = new Map(acknowledged.map((a) => [a.id, a]));
  if (byId.size !== acknowledged.length) return false;
  return changes.every((c) => {
    const a = byId.get(c.record.id);
    return (
      a !== undefined &&
      a.level === c.after.level &&
      a.actionId === c.after.action.id &&
      (a.days ?? null) === c.after.days &&
      (a.percent ?? null) === c.after.percent &&
      (a.amount ?? null) === c.after.amount
    );
  });
}
