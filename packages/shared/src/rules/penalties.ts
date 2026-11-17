import {
  PENALTY_ACTIONS_ALLOWING_DAYS,
  PENALTY_ACTIONS_REQUIRING_DAYS,
  type PenaltyAction,
} from '../enums';
import type { ViolationLevelInput } from '../types/hr';
import { isValidDays } from './days';

/** A violation has 1 to 5 levels, for the 1st to 5th time it happens (§4). */
export const MIN_VIOLATION_LEVELS = 1;
export const MAX_VIOLATION_LEVELS = 5;

/** Why a violation's level list is invalid (each maps to 400 `INVALID_LEVELS`). */
export type ViolationLevelsProblem =
  | 'COUNT'
  | 'NUMBERING'
  | 'DAYS_REQUIRED'
  | 'DAYS_NOT_ALLOWED'
  | 'DAYS_INVALID';

/**
 * Whether one level's `days` fit its action (contract): required and > 0 for DEDUCT_DAYS, optional
 * (but > 0 when given) for INVESTIGATION, absent otherwise. Days are quarter steps 0–30 (§7).
 */
export function levelDaysProblem(
  action: PenaltyAction,
  days: number | null | undefined,
): ViolationLevelsProblem | null {
  const given = days !== null && days !== undefined;
  if (!given) return PENALTY_ACTIONS_REQUIRING_DAYS.includes(action) ? 'DAYS_REQUIRED' : null;
  if (!PENALTY_ACTIONS_ALLOWING_DAYS.includes(action)) return 'DAYS_NOT_ALLOWED';
  if (!isValidDays(days) || days <= 0) return 'DAYS_INVALID';
  return null;
}

/**
 * The first problem with a violation's catalogue levels, or null when they are valid: 1–5 entries,
 * numbered 1..n with no gaps or repeats (any order), and each level's days fitting its action.
 *
 * @example violationLevelsProblem([{ level: 1, action: 'NOTICE' }, { level: 3, action: 'WARNING' }]) // 'NUMBERING'
 */
export function violationLevelsProblem(
  levels: readonly ViolationLevelInput[],
): ViolationLevelsProblem | null {
  if (levels.length < MIN_VIOLATION_LEVELS || levels.length > MAX_VIOLATION_LEVELS) return 'COUNT';
  const numbers = levels.map((l) => l.level).sort((a, b) => a - b);
  if (!numbers.every((n, i) => n === i + 1)) return 'NUMBERING';
  for (const l of levels) {
    const problem = levelDaysProblem(l.action, l.days);
    if (problem) return problem;
  }
  return null;
}
