import { InsuranceStatus } from '../enums';
import { SETTING_DEFAULTS, type TaxBracket } from '../settings';
import type { Piastres } from '../types/common';
import type { TaxRule } from '../types/hr';
import { MAX_PIASTRES } from './employee-details';

/*
 * §6 tax, martyrs' fund and social insurance (owner, 2026-11-17: salaries are NET — grossed up).
 *
 * The line's net is what the employee is paid; the school pays the employee's insurance share,
 * the income tax and the martyrs' fund on top. Everything is monthly, in whole piastres, on
 * integers (BigInt): rates are held as basis points (22.5% → 2250) so nothing drifts.
 *
 * Pure and shared: the API calculates payroll with it, the HR rules screen previews with it.
 */

/** 100% in basis points. */
const BP = 10_000n;

/** The most brackets a tax table may have. */
export const TAX_BRACKETS_MAX = 10;

/** The §7 default tax rule (HR-system's values), as `HrSettings.tax`. */
export const DEFAULT_TAX_RULE: TaxRule = {
  brackets: SETTING_DEFAULTS['hr.tax.brackets'],
  martyrPercent: SETTING_DEFAULTS['hr.tax.martyrPercent'],
  insurancePercent: SETTING_DEFAULTS['hr.tax.insurancePercent'],
};

/** A percent rate as basis points, or null when it isn't 0 ≤ p < 100 with at most 2 decimals. */
export function percentToBasisPoints(percent: number): number | null {
  if (!Number.isFinite(percent) || percent < 0 || percent >= 100) return null;
  const bp = Math.round(percent * 100);
  return Math.abs(bp - percent * 100) < 1e-6 ? bp : null;
}

function bp(percent: number): bigint {
  const value = percentToBasisPoints(percent);
  if (value === null) throw new RangeError(`rate must be 0 ≤ p < 100 with ≤ 2 decimals, got ${percent}`);
  return BigInt(value);
}

/** `n ÷ d` rounded half up, for n ≥ 0 and d > 0. */
function roundDiv(n: bigint, d: bigint): bigint {
  return (2n * n + d) / (2n * d);
}

function assertPiastres(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be whole piastres ≥ 0, got ${value}`);
  }
}

export type TaxRuleIssue =
  | 'bracketsCount'
  | 'openEndedLast'
  | 'bracketWidth'
  | 'bracketPercent'
  | 'bracketPlusFund'
  | 'martyrPercent'
  | 'insurancePercent';

/**
 * What is wrong with a tax rule (§7), one entry per problem, in field order. `index` points at the
 * bracket. Rules: 1–10 brackets; only the last is open-ended (no width) and it must be; widths are
 * whole piastres > 0; every percent is 0 ≤ p < 100 with ≤ 2 decimals; each bracket's percent plus
 * the martyrs' fund stays under 100 so the gross-up has an answer.
 */
export function taxRuleIssues(rule: TaxRule): { issue: TaxRuleIssue; index?: number }[] {
  const issues: { issue: TaxRuleIssue; index?: number }[] = [];
  const { brackets } = rule;
  if (brackets.length < 1 || brackets.length > TAX_BRACKETS_MAX) issues.push({ issue: 'bracketsCount' });
  const martyr = percentToBasisPoints(rule.martyrPercent);
  brackets.forEach((b, index) => {
    const last = index === brackets.length - 1;
    if (last !== (b.width === null)) issues.push({ issue: 'openEndedLast', index });
    else if (b.width !== null && (!Number.isSafeInteger(b.width) || b.width <= 0 || b.width > MAX_PIASTRES)) {
      issues.push({ issue: 'bracketWidth', index });
    }
    const rate = percentToBasisPoints(b.percent);
    if (rate === null) issues.push({ issue: 'bracketPercent', index });
    else if (martyr !== null && rate + martyr >= 10_000) issues.push({ issue: 'bracketPlusFund', index });
  });
  if (martyr === null) issues.push({ issue: 'martyrPercent' });
  if (percentToBasisPoints(rule.insurancePercent) === null) issues.push({ issue: 'insurancePercent' });
  return issues;
}

/**
 * The employee's social-insurance share (§6): insured → `round(insured salary × insurance %)`;
 * not insured, or no insured salary → 0. Not pro-rated for part-time or part months (GUESS).
 *
 * @example insuranceShare('INSURED', 500_000, 11) // 55,000 (550.00 EGP)
 */
export function insuranceShare(
  status: InsuranceStatus,
  insuredSalary: Piastres | null,
  insurancePercent: number,
): Piastres {
  if (status !== InsuranceStatus.INSURED || !insuredSalary) return 0;
  assertPiastres('insuredSalary', insuredSalary);
  return Number(roundDiv(BigInt(insuredSalary) * bp(insurancePercent), BP));
}

/** Tax × 10⁴ (exact) on a taxable amount, slice by slice. */
function taxTimesBp(taxable: bigint, brackets: readonly TaxBracket[]): bigint {
  let remaining = taxable;
  let tax = 0n;
  for (const b of brackets) {
    if (remaining <= 0n) break;
    const slice = b.width === null || BigInt(b.width) > remaining ? remaining : BigInt(b.width);
    tax += slice * bp(b.percent);
    remaining -= slice;
  }
  return tax;
}

/**
 * Monthly income tax on a taxable amount (§6): each slice at its percent, summed exactly, rounded
 * once, half up. Default table: 10,000.00 EGP → 812.50 EGP.
 */
export function incomeTax(taxable: Piastres, brackets: readonly TaxBracket[]): Piastres {
  assertPiastres('taxable', taxable);
  return Number(roundDiv(taxTimesBp(BigInt(taxable), brackets), BP));
}

/**
 * The taxable amount `t` whose take-home is `net` (§6 gross-up):
 * `t − tax(t) − fund% × (t + insurance) = net`. Walks the slices; in the slice `[lo, hi)` at rate
 * `r`, `t = (net + taxLo − lo·r + m·I) ÷ (1 − r − m)`, solved exactly and rounded half up. A net
 * that lands exactly on a slice's top stays in that slice.
 */
function grossUpTaxable(net: bigint, insurance: bigint, rule: TaxRule): bigint {
  const m = bp(rule.martyrPercent);
  const target = net * BP;
  let lo = 0n;
  let taxLo = 0n; // × 10⁴
  for (const b of rule.brackets) {
    const r = bp(b.percent);
    if (b.width !== null) {
      const hi = lo + BigInt(b.width);
      const taxHi = taxLo + BigInt(b.width) * r;
      const takeHomeHi = hi * BP - taxHi - m * (hi + insurance); // × 10⁴
      if (target > takeHomeHi) {
        lo = hi;
        taxLo = taxHi;
        continue;
      }
    }
    const numerator = target + taxLo - lo * r + m * insurance;
    const t = roundDiv(numerator, BP - r - m);
    return t < 0n ? 0n : t;
  }
  return 0n; // unreachable: the last bracket is open-ended
}

export interface PayrollTaxAmounts {
  /** The employee's social-insurance share, paid by the school. */
  insuranceAmount: Piastres;
  /** Income tax on the grossed-up taxable amount. */
  incomeTax: Piastres;
  /** Martyrs' fund on the gross. */
  martyrTax: Piastres;
  /** net + insurance + income tax + martyrs' fund — the line always balances to the piastre. */
  gross: Piastres;
}

/**
 * Tax, fund and insurance for one line (§6 steps 7–10). The net is guaranteed: the taxable amount
 * is grossed up so that, after the insurance share, the income tax and the martyrs' fund, the
 * employee still takes home `net`. Gross is stored as the exact sum of the parts (GUESS: within a
 * couple of piastres of the unrounded solution).
 *
 * @example payrollTax(1_000_000, 0, defaults) // not insured, 10,000.00 net → tax, fund, gross
 */
export function payrollTax(net: Piastres, insuranceAmount: Piastres, rule: TaxRule): PayrollTaxAmounts {
  assertPiastres('net', net);
  assertPiastres('insuranceAmount', insuranceAmount);
  if (net === 0 && insuranceAmount === 0) return { insuranceAmount: 0, incomeTax: 0, martyrTax: 0, gross: 0 };
  const insurance = BigInt(insuranceAmount);
  const taxable = grossUpTaxable(BigInt(net), insurance, rule);
  const tax = roundDiv(taxTimesBp(taxable, rule.brackets), BP);
  const martyr = roundDiv((taxable + insurance) * bp(rule.martyrPercent), BP);
  return {
    insuranceAmount,
    incomeTax: Number(tax),
    martyrTax: Number(martyr),
    gross: net + insuranceAmount + Number(tax) + Number(martyr),
  };
}
