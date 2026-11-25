import {
  AdjustmentType,
  daysToQuarters,
  PayrollFlag,
  PenaltyEffect,
  PenaltySalaryBase,
  percentHundredths,
  quartersToDays,
  type Days,
  type PayrollRule,
  type Piastres,
  type WorkSystem,
} from '@school-erp/shared';
import { deductionAmount, displayDayValue, lineNet, monthSalary } from './payroll';
import { mulDivRoundHalfUp } from './rounding';

/**
 * An APPROVED penalty dated in the month as payroll prices it (spec 2026-11-25): its effect (and,
 * for a %, its salary base) and its fixed number. Never money from the penalty itself, except a
 * fixed amount, which is the catalogue's number.
 */
export interface PenaltyDeduction {
  effect: PenaltyEffect;
  percentBase: PenaltySalaryBase | null;
  days: Days | null;
  percent: number | null;
  /** Piastres (DEDUCT_AMOUNT). */
  amount: Piastres | null;
}

/** What one employee's line is calculated from (§6 "Calculating a line"). */
export interface LineInput {
  basicSalary: Piastres;
  workSystem: WorkSystem;
  /** Each APPROVED penalty dated in the month, as fixed at approval (record-only ones cost 0). */
  penalties: readonly PenaltyDeduction[];
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
  /** The whole penalty deduction: days part + % part + fixed part. */
  penaltyAmount: Piastres;
  /** The day-priced part of `penaltyAmount`: `round(penaltyDays × month salary ÷ divisor)`. */
  penaltyDaysAmount: Piastres;
  latenessDays: Days;
  latenessAmount: Piastres;
  adjustmentAdditions: Piastres;
  adjustmentDeductions: Piastres;
  net: Piastres;
  flags: PayrollFlag[];
}

/**
 * The days an APPROVED penalty takes off pay (§4): a day deduction, or an investigation with days.
 * Every other effect takes no days (a % and a fixed amount are priced on their own) → 0.
 */
export function deductedDays(effect: PenaltyEffect, days: Days | null): Days {
  if (effect !== PenaltyEffect.DEDUCT_DAYS && effect !== PenaltyEffect.INVESTIGATION) return 0;
  return days ?? 0;
}

/**
 * `percent` of `base`, rounded half up to the piastre on its own (spec 2026-11-25): integer maths,
 * `base × hundredths-of-a-percent ÷ 10,000`.
 *
 * @example percentOf(999_999, 2.5) // 25,000 (24,999.975 → EGP 250.00)
 */
export function percentOf(base: Piastres, percent: number): Piastres {
  return mulDivRoundHalfUp(base, percentHundredths(percent), 10_000);
}

/** The salaries a % can be of, from the line: the salary for the month and the basic salary. */
export interface PercentBases {
  monthSalary: Piastres;
  basicSalary: Piastres;
}

/**
 * What a % or fixed-amount penalty takes, on its own: `round(base × percent ÷ 100)` from the line's
 * salary for the month or basic salary, or the fixed amount. Null for the others (days are priced
 * together, once — `penaltyShare` splits them for the payslip; record-only costs nothing).
 */
export function ownPenaltyAmount(p: PenaltyDeduction, bases: PercentBases): Piastres | null {
  if (p.effect === PenaltyEffect.DEDUCT_PERCENT && p.percent !== null) {
    const base = p.percentBase === PenaltySalaryBase.BASIC_SALARY ? bases.basicSalary : bases.monthSalary;
    return percentOf(base, p.percent);
  }
  if (p.effect === PenaltyEffect.DEDUCT_AMOUNT && p.amount !== null) return p.amount;
  return null;
}

/** Whether an approved penalty takes anything off pay: days (an investigation's too), a %, an amount. */
export function costsPay(p: Pick<PenaltyDeduction, 'effect' | 'days'>): boolean {
  if (p.effect === PenaltyEffect.DEDUCT_PERCENT || p.effect === PenaltyEffect.DEDUCT_AMOUNT) return true;
  return deductedDays(p.effect, p.days) > 0;
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
 * A line's penalty deductions (spec 2026-11-25, §6 step 3): the days of every day-deducting
 * penalty summed in quarters and priced ONCE (`round(days × month salary ÷ divisor)`, unchanged), plus
 * each % penalty rounded on its own, plus each fixed amount.
 */
export function penaltyDeductions(
  penalties: readonly PenaltyDeduction[],
  bases: PercentBases,
  dayDivisor: number,
): { penaltyDays: Days; penaltyDaysAmount: Piastres; penaltyAmount: Piastres } {
  const penaltyDays = sumDays(penalties.map((p) => deductedDays(p.effect, p.days)));
  const penaltyDaysAmount = deductionAmount(penaltyDays, bases.monthSalary, dayDivisor);
  const own = penalties.reduce((sum, p) => sum + (ownPenaltyAmount(p, bases) ?? 0), 0);
  return { penaltyDays, penaltyDaysAmount, penaltyAmount: penaltyDaysAmount + own };
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
 * One payroll line (§6): month salary from the work system, penalty deductions (`penaltyDeductions`),
 * lateness `round(days × month salary ÷ divisor)`, one-off additions and deductions, net floored at
 * 0 (no cap on penalty deductions — owner, 2026-11-26).
 * Flags: `NET_FLOORED` (net would be negative), `PENDING_PENALTIES` (pending penalties in the month).
 */
export function calculateLine(input: LineInput, rule: PayrollRule): LineAmounts {
  const salary = monthSalary(input.basicSalary, input.workSystem, rule.partTime);
  const { penaltyDays, penaltyDaysAmount, penaltyAmount } = penaltyDeductions(
    input.penalties,
    { monthSalary: salary, basicSalary: input.basicSalary },
    rule.dayDivisor,
  );
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
    penaltyDaysAmount,
    dayValue: displayDayValue(salary, rule.dayDivisor),
    penaltyDays,
    latenessDays: input.latenessDays,
    ...lineNetWithFlags(amounts, input.pendingPenalties > 0),
  };
}

/**
 * One day penalty's share of a line's day-priced deduction, for the payslip: `days ÷ line days ×
 * line days amount`, rounded half up. Taken from the line's snapshot, so a later divisor change
 * never alters an approved payslip.
 */
export function penaltyShare(days: Days | null, lineDays: Days, lineDaysAmount: Piastres): Piastres {
  if (!days || lineDays <= 0) return 0;
  return mulDivRoundHalfUp(daysToQuarters(days), lineDaysAmount, daysToQuarters(lineDays));
}

/**
 * What the payslip shows one approved penalty took (spec 2026-11-25): a days penalty its share of
 * the line's day-priced part; a % its own `round(base × percent ÷ 100)` from the line's snapshot; a
 * fixed one its amount; record-only 0. Only the day shares can differ from the total by a piastre.
 */
export function payslipPenaltyAmount(
  p: PenaltyDeduction,
  line: PercentBases & { penaltyDays: Days; penaltyDaysAmount: Piastres },
): Piastres {
  const own = ownPenaltyAmount(p, line);
  if (own !== null) return own;
  return penaltyShare(deductedDays(p.effect, p.days), line.penaltyDays, line.penaltyDaysAmount);
}

/**
 * What the payslip shows each approved penalty took (owner Q14, 2026-11-26): a % or fixed penalty its
 * own amount; the day penalties split the line's day-priced part by their days with the **largest
 * remainder** method — each gets the floor of its exact share, and the piastres left go one each to
 * the largest remainders (the earlier penalty first on a tie) — so the day shares always add up to
 * the line exactly. Record-only and investigation without days: 0.
 *
 * @example payslipPenaltyAmounts([0.25, 0.25, 0.25 days], { penaltyDaysAmount: 25_000, … }) // [8_334, 8_333, 8_333]
 */
export function payslipPenaltyAmounts(
  penalties: readonly PenaltyDeduction[],
  line: PercentBases & { penaltyDaysAmount: Piastres },
): Piastres[] {
  const own = penalties.map((p) => ownPenaltyAmount(p, line));
  const weights = penalties.map((p, i) => (own[i] === null ? daysToQuarters(deductedDays(p.effect, p.days)) : 0));
  const total = weights.reduce((a, b) => a + b, 0);
  const amount = BigInt(line.penaltyDaysAmount);
  const floors = weights.map((w) => (total === 0 ? 0n : (amount * BigInt(w)) / BigInt(total)));
  const remainders = weights.map((w, i) => (total === 0 ? 0n : amount * BigInt(w) - floors[i] * BigInt(total)));
  let left = total === 0 ? 0n : amount - floors.reduce((a, b) => a + b, 0n);
  const order = weights
    .map((w, i) => i)
    .filter((i) => weights[i] > 0)
    .sort((a, b) => (remainders[b] > remainders[a] ? 1 : remainders[b] < remainders[a] ? -1 : a - b));
  const shares = [...floors];
  for (const i of order) {
    if (left <= 0n) break;
    shares[i] = shares[i] + 1n;
    left -= 1n;
  }
  return penalties.map((_, i) => own[i] ?? Number(shares[i]));
}
