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
