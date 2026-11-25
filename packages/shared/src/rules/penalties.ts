import { PenaltyEffect } from '../enums';
import { isValidDays } from './days';
import { MAX_MONTHLY_PIASTRES } from './employee-details';

/** A violation has 1 to 5 levels, for the 1st to 5th time it happens (§4). */
export const MIN_VIOLATION_LEVELS = 1;
export const MAX_VIOLATION_LEVELS = 5;

/** A level's percent (spec 2026-11-25): above 0, at most 100, two decimals. */
export const PENALTY_PERCENT_MAX = 100;
/** A level's fixed amount: above 0, at most EGP 1,000,000 (the salary maximum), in piastres. */
export const PENALTY_AMOUNT_MAX = MAX_MONTHLY_PIASTRES;

/** The effects whose level carries days (required for DEDUCT_DAYS, optional for INVESTIGATION). */
export const DAY_EFFECTS: readonly PenaltyEffect[] = [PenaltyEffect.DEDUCT_DAYS, PenaltyEffect.INVESTIGATION];

/** Which number a level of this effect takes, if any (`INVESTIGATION`: optional days). */
export type LevelNumberKind = 'days' | 'percent' | 'amount' | null;
export function levelNumberKind(effect: PenaltyEffect): LevelNumberKind {
  switch (effect) {
    case PenaltyEffect.DEDUCT_DAYS:
    case PenaltyEffect.INVESTIGATION:
      return 'days';
    case PenaltyEffect.DEDUCT_PERCENT:
      return 'percent';
    case PenaltyEffect.DEDUCT_AMOUNT:
      return 'amount';
    case PenaltyEffect.RECORD_ONLY:
      return null;
  }
}

/** Why a violation's level list is invalid (each maps to 400 `INVALID_LEVELS`). */
export type ViolationLevelsProblem =
  | 'COUNT'
  | 'NUMBERING'
  | 'DAYS_REQUIRED'
  | 'DAYS_INVALID'
  | 'PERCENT_REQUIRED'
  | 'PERCENT_INVALID'
  | 'AMOUNT_REQUIRED'
  | 'AMOUNT_INVALID'
  | 'VALUE_NOT_ALLOWED';

/** A level's numbers as typed or sent: each may be missing. */
export interface LevelValueInput {
  days?: number | null;
  percent?: number | null;
  amount?: number | null;
}

const given = (v: number | null | undefined): v is number => v !== null && v !== undefined;

/**
 * Whether `value` is a level percent: finite, above 0, at most 100, at most two decimals
 * (0.01 – 100). 12.345 and 100.01 are not.
 */
export function isValidPenaltyPercent(value: number): boolean {
  if (!Number.isFinite(value) || value <= 0 || value > PENALTY_PERCENT_MAX) return false;
  const hundredths = value * 100;
  return Math.abs(hundredths - Math.round(hundredths)) < 1e-9;
}

/** A percent in whole hundredths (2.5 → 250), for integer pricing. */
export function percentHundredths(percent: number): number {
  return Math.round(percent * 100);
}

/** Whether `value` is a level amount in piastres: a whole number above 0, at most EGP 1,000,000. */
export function isValidPenaltyAmount(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && value <= PENALTY_AMOUNT_MAX;
}

/**
 * Whether one level's number fits its action's effect (spec 2026-11-25): exactly the number the
 * effect asks for — days for DEDUCT_DAYS (required) and INVESTIGATION (optional), a percent for
 * DEDUCT_PERCENT, an amount for DEDUCT_AMOUNT, none for RECORD_ONLY. Days are quarter steps above
 * 0 up to 30 (§7); percents 0.01–100 with two decimals; amounts whole piastres up to EGP 1,000,000.
 *
 * @example levelValueProblem('RECORD_ONLY', { days: 1 }) // 'VALUE_NOT_ALLOWED'
 * @example levelValueProblem('DEDUCT_PERCENT', { percent: 12.345 }) // 'PERCENT_INVALID'
 */
export function levelValueProblem(effect: PenaltyEffect, level: LevelValueInput): ViolationLevelsProblem | null {
  const kind = levelNumberKind(effect);
  const others = (['days', 'percent', 'amount'] as const).filter((k) => k !== kind);
  if (others.some((k) => given(level[k]))) return 'VALUE_NOT_ALLOWED';
  switch (kind) {
    case null:
      return null;
    case 'days': {
      // An investigation's days are optional: 0 means none (stored as null — owner Q11, 2026-11-26).
      if (!given(level.days) || (effect === PenaltyEffect.INVESTIGATION && level.days === 0)) {
        return effect === PenaltyEffect.DEDUCT_DAYS ? 'DAYS_REQUIRED' : null;
      }
      return isValidDays(level.days) && level.days > 0 ? null : 'DAYS_INVALID';
    }
    case 'percent':
      if (!given(level.percent)) return 'PERCENT_REQUIRED';
      return isValidPenaltyPercent(level.percent) ? null : 'PERCENT_INVALID';
    case 'amount':
      if (!given(level.amount)) return 'AMOUNT_REQUIRED';
      return isValidPenaltyAmount(level.amount) ? null : 'AMOUNT_INVALID';
  }
}

/**
 * A level's days as stored: an investigation's 0 days means none (null — owner Q11, 2026-11-26);
 * anything else as given.
 */
export function storedLevelDays(effect: PenaltyEffect, days: number | null | undefined): number | null {
  if (days === null || days === undefined) return null;
  return effect === PenaltyEffect.INVESTIGATION && days === 0 ? null : days;
}

/** One level as the whole-list check sees it: its number, its numbers, and its action's effect. */
export interface LevelCheck extends LevelValueInput {
  level: number;
  /** The level's action's effect; unknown (no action picked yet) skips the number check. */
  effect?: PenaltyEffect | null;
}

/**
 * The first problem with a violation's catalogue levels, or null when they are valid: 1–5 entries,
 * numbered 1..n with no gaps or repeats (any order), and each level's number fitting its action's
 * effect (`levelValueProblem`).
 *
 * @example violationLevelsProblem([{ level: 1, effect: 'RECORD_ONLY' }, { level: 3, effect: 'RECORD_ONLY' }]) // 'NUMBERING'
 */
export function violationLevelsProblem(levels: readonly LevelCheck[]): ViolationLevelsProblem | null {
  if (levels.length < MIN_VIOLATION_LEVELS || levels.length > MAX_VIOLATION_LEVELS) return 'COUNT';
  const numbers = levels.map((l) => l.level).sort((a, b) => a - b);
  if (!numbers.every((n, i) => n === i + 1)) return 'NUMBERING';
  for (const l of levels) {
    if (!l.effect) continue;
    const problem = levelValueProblem(l.effect, l);
    if (problem) return problem;
  }
  return null;
}
