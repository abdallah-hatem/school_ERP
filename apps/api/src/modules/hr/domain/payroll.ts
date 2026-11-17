import {
  daysToQuarters,
  PayrollFlag,
  QUARTERS_PER_DAY,
  WorkSystem,
  type PartTimeWorkSystem,
  type Piastres,
} from '@school-erp/shared';
import { divRoundHalfUp, mulDivRoundHalfUp } from './rounding';

/** A work system's share of the basic salary, in percent (full-time is always 100). */
function workSystemPercent(
  workSystem: WorkSystem,
  partTimePercents: Record<PartTimeWorkSystem, number>,
): number {
  if (workSystem === WorkSystem.FULL_TIME) return 100;
  const percent = partTimePercents[workSystem];
  if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
    throw new RangeError(`part-time percent for ${workSystem} must be 1–100, got ${percent}`);
  }
  return percent;
}

/**
 * Salary for the month (§6 step 1) = basic salary × work-system percentage, rounded half up to
 * the piastre. Full-time 100%; part-time from the setting (default 80 / 60 / 40).
 *
 * @example monthSalary(1_000_001, 'PART_TIME_3', { …, PART_TIME_3: 60 }) // 600,001 (600,000.6)
 */
export function monthSalary(
  basicSalary: Piastres,
  workSystem: WorkSystem,
  partTimePercents: Record<PartTimeWorkSystem, number>,
): Piastres {
  return mulDivRoundHalfUp(basicSalary, workSystemPercent(workSystem, partTimePercents), 100);
}

/**
 * A deduction (§6 steps 3–4) = round half up of `days × month salary ÷ divisor`. The day value is
 * NOT rounded on its own (GUESS): everything is multiplied first and rounded once.
 *
 * @example deductionAmount(1.25, 1_000_001, 30) // 41,667 (41,666.71)
 */
export function deductionAmount(days: number, monthSalaryPiastres: Piastres, divisor: number): Piastres {
  if (days < 0) throw new RangeError(`days must be ≥ 0, got ${days}`);
  assertDivisor(divisor);
  // days = quarters / 4, so days × salary ÷ divisor = quarters × salary ÷ (4 × divisor).
  return mulDivRoundHalfUp(daysToQuarters(days), monthSalaryPiastres, QUARTERS_PER_DAY * divisor);
}

/**
 * The day value shown on the payroll line and payslip (§6 step 2), rounded half up to the
 * piastre. **Display only** — deductions never multiply it; they use `deductionAmount`.
 *
 * @example displayDayValue(600_000, 30)   // 20,000
 * @example displayDayValue(1_000_001, 30) // 33,333 (33,333.37 unrounded)
 */
export function displayDayValue(monthSalaryPiastres: Piastres, divisor: number): Piastres {
  assertDivisor(divisor);
  return divRoundHalfUp(monthSalaryPiastres, divisor);
}

function assertDivisor(divisor: number): void {
  if (!Number.isInteger(divisor) || divisor < 1) {
    throw new RangeError(`divisor must be a whole number ≥ 1, got ${divisor}`);
  }
}

export interface LineNetInput {
  monthSalary: Piastres;
  penaltyAmount: Piastres;
  latenessAmount: Piastres;
  adjustmentAdditions: Piastres;
  adjustmentDeductions: Piastres;
}

export interface LineNetResult {
  net: Piastres;
  /** `NET_FLOORED` when the deductions exceeded what the line earned. */
  flags: PayrollFlag[];
}

/**
 * Net (§6 step 6) = month salary − penalty deductions − lateness deductions + additions −
 * one-off deductions. Additions count before the floor. Net never goes below 0 (GUESS): when it
 * would, it is 0 and the line carries `NET_FLOORED` for review.
 */
export function lineNet(input: LineNetInput): LineNetResult {
  for (const [name, value] of Object.entries(input)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`${name} must be whole piastres ≥ 0, got ${value}`);
    }
  }
  const raw =
    input.monthSalary -
    input.penaltyAmount -
    input.latenessAmount +
    input.adjustmentAdditions -
    input.adjustmentDeductions;
  return raw < 0 ? { net: 0, flags: [PayrollFlag.NET_FLOORED] } : { net: raw, flags: [] };
}
