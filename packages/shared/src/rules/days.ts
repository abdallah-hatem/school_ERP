import { SETTING_LIMITS } from '../settings';

/**
 * Day counts move in quarter steps (0.25): penalty level days, lateness step days (§4, §5, §7).
 * Working in whole quarters keeps the arithmetic exact (no float drift).
 */
export const QUARTERS_PER_DAY = Math.round(1 / SETTING_LIMITS.daysStep);

/** True when `value` is a finite multiple of 0.25 (0, 0.25, 1.5 — not 0.3). */
export function isQuarterStep(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value * QUARTERS_PER_DAY);
}

/**
 * True when `value` is a valid day count for a setting or a catalogue level: a quarter step from
 * `SETTING_LIMITS.daysMin` to `SETTING_LIMITS.daysMax` inclusive (§7: 0 to 30).
 */
export function isValidDays(value: number): boolean {
  return (
    isQuarterStep(value) && value >= SETTING_LIMITS.daysMin && value <= SETTING_LIMITS.daysMax
  );
}

/** Days → whole quarters (1.25 → 5). Throws on a value that isn't a quarter step. */
export function daysToQuarters(days: number): number {
  if (!isQuarterStep(days)) throw new RangeError(`days must be a multiple of 0.25, got ${days}`);
  return Math.round(days * QUARTERS_PER_DAY);
}

/** Whole quarters → days (5 → 1.25). */
export function quartersToDays(quarters: number): number {
  return quarters / QUARTERS_PER_DAY;
}
