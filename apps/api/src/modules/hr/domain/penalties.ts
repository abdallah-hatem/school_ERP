import {
  contractYearFor,
  type IsoDate,
  type PenaltyAction,
  type RepetitionWindow,
} from '@school-erp/shared';

/** The level fields `penaltyLevel` needs from a violation's catalogue levels. */
export interface LevelRef {
  level: number;
}

/**
 * The repeat level of a new penalty (§4): 1 + the number of approved earlier penalties for the
 * same violation and employee inside the repetition window. After the last defined level, the
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

/** A catalogue level with the fields a recorded penalty copies. */
export interface CatalogueLevel extends LevelRef {
  action: PenaltyAction;
  days: number | null;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * The first day (inclusive) of the repetition window for a penalty dated `date` (§4, §7):
 * - CONTRACT_YEAR — 1 June of the contract year holding `date` (1 June – 31 May, GUESS default)
 * - CALENDAR_YEAR — 1 January of `date`'s year
 * - ROLLING_12_MONTHS — the same day 12 months earlier (29 Feb → 28 Feb)
 *
 * Earlier penalties count when `windowStart <= their date < date`.
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

/**
 * How many of `approvedDates` (the dates of APPROVED penalties for the same violation and
 * employee) count toward a penalty dated `date`: strictly earlier dates inside the window (§4
 * GUESS: same-day penalties don't count for each other).
 */
export function countPriorInWindow(
  date: IsoDate,
  window: RepetitionWindow,
  approvedDates: readonly IsoDate[],
): number {
  const start = repetitionWindowStart(date, window);
  // ISO dates compare correctly as strings.
  return approvedDates.filter((d) => d >= start && d < date).length;
}

/**
 * The level, action and days a penalty gets from its violation's catalogue levels, given the
 * number of prior approved penalties. "Doubles on repeat" stays text: days are never doubled.
 */
export function resolvePenalty(
  priorApprovedCount: number,
  levels: readonly CatalogueLevel[],
): CatalogueLevel {
  const level = penaltyLevel(priorApprovedCount, levels);
  const entry = levels.find((l) => l.level === level);
  if (!entry) throw new RangeError(`level ${level} is missing from the catalogue levels`);
  return { level: entry.level, action: entry.action, days: entry.days };
}
