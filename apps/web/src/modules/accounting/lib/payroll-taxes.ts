import { ACCOUNTING_YEAR_RANGE, type Piastres, type TaxRule } from '@school-erp/shared';

/** Pure helpers of the payroll taxes screens (§10): the URL's year and the rule. The lines are the API's. */

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

/** `?year=2026` → 2026; missing or out of range → this year. */
export function parseYear(params: SearchParamsRecord, now: Date = new Date()): number {
  const raw = Array.isArray(params.year) ? params.year[0] : params.year;
  const year = Number(raw);
  const current = now.getFullYear();
  if (!raw || !Number.isInteger(year) || year < ACCOUNTING_YEAR_RANGE.min || year > ACCOUNTING_YEAR_RANGE.max) {
    return current;
  }
  return year;
}

export const SUBTOTAL_FIELDS = ['net', 'insuranceAmount', 'incomeTax', 'martyrTax', 'gross'] as const;
export type SubtotalField = (typeof SUBTOTAL_FIELDS)[number];

export interface RuleSlice {
  /** `first` (from 0), `next`, `rest` (open-ended, from `from`) or `all` (one open slice: the whole amount). */
  kind: 'first' | 'next' | 'rest' | 'all';
  /** The slice's width, or where the open-ended rest starts. */
  amount: Piastres;
  percent: number;
}

/** The monthly income-tax slices as the statement lists them: "First 5,000.00 · 0%", "Next 1,250.00 · 10%", "Above 34,999.99 · 25%". */
export function ruleSlices(rule: TaxRule): RuleSlice[] {
  let from = 0;
  return rule.brackets.map((bracket, i) => {
    if (bracket.width === null) {
      return { kind: from === 0 ? 'all' : 'rest', amount: from, percent: bracket.percent };
    }
    const slice: RuleSlice = { kind: i === 0 ? 'first' : 'next', amount: bracket.width, percent: bracket.percent };
    from += bracket.width;
    return slice;
  });
}

/** Whether two tax rules are the same (slices, fund and insurance rates). */
export function sameRule(a: TaxRule, b: TaxRule): boolean {
  return (
    a.martyrPercent === b.martyrPercent &&
    a.insurancePercent === b.insurancePercent &&
    a.brackets.length === b.brackets.length &&
    a.brackets.every((x, i) => x.width === b.brackets[i]?.width && x.percent === b.brackets[i]?.percent)
  );
}

/** `12.5` → `12.5%`, `0.05` → `0.05%` (Latin digits, as every figure). */
export function formatPercent(percent: number): string {
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(percent)}%`;
}
