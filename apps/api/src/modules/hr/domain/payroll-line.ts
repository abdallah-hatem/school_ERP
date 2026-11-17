import {
  AdjustmentType,
  daysToQuarters,
  PayrollFlag,
  PenaltyAction,
  quartersToDays,
  type Days,
  type PayrollRule,
  type Piastres,
  type WorkSystem,
} from '@school-erp/shared';
import { deductionAmount, displayDayValue, lineNet, monthSalary } from './payroll';
import { mulDivRoundHalfUp } from './rounding';

/** What one employee's line is calculated from (§6 "Calculating a line"). */
export interface LineInput {
  basicSalary: Piastres;
  workSystem: WorkSystem;
  /** Fixed days of each APPROVED deducting penalty dated in the month. */
  penaltyDays: readonly Days[];
  /** Days from the month's lateness minutes under the current rule (§5). */
  latenessDays: Days;
  adjustments: readonly { type: AdjustmentType; amount: Piastres }[];
  /** PENDING penalties dated in the month — the line is flagged for review. */
  pendingPenalties: number;
}

/** The calculated money fields of a line. */
export interface LineAmounts {
  monthSalary: Piastres;
  dayValue: Piastres;
  penaltyDays: Days;
  penaltyAmount: Piastres;
  latenessDays: Days;
  latenessAmount: Piastres;
  adjustmentAdditions: Piastres;
  adjustmentDeductions: Piastres;
  net: Piastres;
  flags: PayrollFlag[];
}

/**
 * The days an APPROVED penalty takes off pay (§4): a day deduction, or an investigation with days.
 * Every other action (notice, warning, raise, pay cut, demotion, dismissal) is recorded only → 0.
 */
export function deductedDays(action: PenaltyAction, days: Days | null): Days {
  if (action !== PenaltyAction.DEDUCT_DAYS && action !== PenaltyAction.INVESTIGATION) return 0;
  return days ?? 0;
}

/** Sum of day counts in whole quarters, so 0.25 + 0.5 never drifts. */
export function sumDays(days: readonly Days[]): Days {
  return quartersToDays(days.reduce((q, d) => q + daysToQuarters(d), 0));
}

/** Sum of the ADDITION and DEDUCTION adjustments separately. */
export function sumAdjustments(adjustments: LineInput['adjustments']): {
  additions: Piastres;
  deductions: Piastres;
} {
  let additions = 0;
  let deductions = 0;
  for (const a of adjustments) {
    if (a.type === AdjustmentType.ADDITION) additions += a.amount;
    else deductions += a.amount;
  }
  return { additions, deductions };
}

/**
 * Net and flags from a line's stored amounts. Used when only the adjustments change (the rest of
 * the line keeps the numbers of its last calculation). `PENDING_PENALTIES` is carried over.
 */
export function lineNetWithFlags(
  amounts: Pick<
    LineAmounts,
    | 'monthSalary'
    | 'penaltyAmount'
    | 'latenessAmount'
    | 'adjustmentAdditions'
    | 'adjustmentDeductions'
  >,
  pendingPenalties: boolean,
): { net: Piastres; flags: PayrollFlag[] } {
  const { net, flags } = lineNet(amounts);
  return { net, flags: pendingPenalties ? [...flags, PayrollFlag.PENDING_PENALTIES] : flags };
}

/**
 * One payroll line (§6): month salary from the work system, penalty and lateness deductions each
 * `round(days × month salary ÷ divisor)`, one-off additions and deductions, net floored at 0.
 * Flags: `NET_FLOORED` (net would be negative), `PENDING_PENALTIES` (pending penalties in the month).
 */
export function calculateLine(input: LineInput, rule: PayrollRule): LineAmounts {
  const salary = monthSalary(input.basicSalary, input.workSystem, rule.partTime);
  const penaltyDays = sumDays(input.penaltyDays);
  const penaltyAmount = deductionAmount(penaltyDays, salary, rule.dayDivisor);
  const latenessAmount = deductionAmount(input.latenessDays, salary, rule.dayDivisor);
  const { additions, deductions } = sumAdjustments(input.adjustments);
  const amounts = {
    monthSalary: salary,
    penaltyAmount,
    latenessAmount,
    adjustmentAdditions: additions,
    adjustmentDeductions: deductions,
  };
  return {
    ...amounts,
    dayValue: displayDayValue(salary, rule.dayDivisor),
    penaltyDays,
    latenessDays: input.latenessDays,
    ...lineNetWithFlags(amounts, input.pendingPenalties > 0),
  };
}

/**
 * One penalty's share of a line's penalty amount, for the payslip: `days ÷ line days × line
 * amount`, rounded half up. Taken from the line's snapshot, so a later divisor change never
 * alters an approved payslip.
 */
export function penaltyShare(days: Days | null, lineDays: Days, lineAmount: Piastres): Piastres {
  if (!days || lineDays <= 0) return 0;
  return mulDivRoundHalfUp(daysToQuarters(days), lineAmount, daysToQuarters(lineDays));
}
