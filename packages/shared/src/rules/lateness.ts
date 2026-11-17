import type { LatenessRule } from '../types/hr';
import { daysToQuarters, quartersToDays } from './days';

const MINUTES_PER_HOUR = 60;

/**
 * Days deducted for a month's accumulated lateness and early-leave minutes (§5).
 *
 * 1. The grace minutes are subtracted from the month's total first (GUESS).
 * 2. Any minutes inside an hour count as that hour: 1–60 → hour 1, 61–120 → hour 2… (GUESS).
 * 3. Hour `h` costs the days of the step whose `hour` is `h`; every hour beyond the listed steps
 *    costs `extraHourDays` (GUESS). The days add up across hours.
 *
 * Default rule (grace 0, 1st hour ¼, 2nd hour ½, extra ½): 60 → 0.25, 61 → 0.75, 121 → 1.25.
 *
 * Pure and shared: the API uses it for the lateness list and payroll, the screens for the live
 * preview — one implementation.
 */
export function latenessDays(minutes: number, rule: LatenessRule): number {
  if (!Number.isInteger(minutes) || minutes < 0) {
    throw new RangeError(`minutes must be a whole number ≥ 0, got ${minutes}`);
  }
  const counted = Math.max(0, minutes - Math.max(0, rule.graceMinutes));
  const hours = Math.ceil(counted / MINUTES_PER_HOUR);

  const stepQuarters = new Map<number, number>();
  for (const step of rule.steps) stepQuarters.set(step.hour, daysToQuarters(step.days));
  const extraQuarters = daysToQuarters(rule.extraHourDays);

  let quarters = 0;
  for (let hour = 1; hour <= hours; hour += 1) {
    quarters += stepQuarters.get(hour) ?? extraQuarters;
  }
  return quartersToDays(quarters);
}
