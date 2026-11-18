import { DEFAULT_TAX_RULE } from '@school-erp/shared';
import { describe, expect, it } from 'vitest';
import { LIMITED_MONTH, MONTH } from '../test/fixtures';
import { formatPercent, groupByInsurance, parseYear, ruleSlices, sameRule, subtotals } from './payroll-taxes';

const NOW = new Date(2026, 10, 18);

describe('payroll taxes helpers', () => {
  it('parseYear: the URL year, else this year (missing, garbage, out of range, repeated)', () => {
    expect(parseYear({ year: '2025' }, NOW)).toBe(2025);
    expect(parseYear({}, NOW)).toBe(2026);
    expect(parseYear({ year: 'abc' }, NOW)).toBe(2026);
    expect(parseYear({ year: '1999' }, NOW)).toBe(2026);
    expect(parseYear({ year: '2025.5' }, NOW)).toBe(2026);
    expect(parseYear({ year: ['2024', '2023'] }, NOW)).toBe(2024);
  });

  it('groups by insurance and sums each group; a hidden line hides the subtotal', () => {
    const { insured, notInsured } = groupByInsurance(MONTH.lines);
    expect(insured.map((l) => l.employeeCode)).toEqual(['EMP-0002', 'EMP-0003']);
    expect(notInsured.map((l) => l.employeeCode)).toEqual(['EMP-0001']);
    expect(subtotals(insured)).toEqual({ net: 1_200_000, insuranceAmount: 110_000, incomeTax: 151_738, martyrTax: 732, gross: 1_462_470 });
    expect(subtotals([])).toEqual({ net: 0, insuranceAmount: 0, incomeTax: 0, martyrTax: 0, gross: 0 });
    expect(subtotals(groupByInsurance(LIMITED_MONTH.lines).insured)).toBeNull();
  });

  it('ruleSlices: first, next…, then the rest from where the slices end; one open slice is all of it', () => {
    const slices = ruleSlices(DEFAULT_TAX_RULE);
    expect(slices[0]).toEqual({ kind: 'first', amount: 500_000, percent: 0 });
    expect(slices[1]).toEqual({ kind: 'next', amount: 125_000, percent: 10 });
    expect(slices.at(-1)).toEqual({ kind: 'rest', amount: 3_500_000, percent: 25 });
    expect(ruleSlices({ ...DEFAULT_TAX_RULE, brackets: [{ width: null, percent: 0 }] })).toEqual([{ kind: 'all', amount: 0, percent: 0 }]);
  });

  it('sameRule compares slices and both rates; formatPercent keeps up to 2 decimals', () => {
    expect(sameRule(DEFAULT_TAX_RULE, structuredClone(DEFAULT_TAX_RULE))).toBe(true);
    expect(sameRule(DEFAULT_TAX_RULE, { ...DEFAULT_TAX_RULE, insurancePercent: 10 })).toBe(false);
    expect(sameRule(DEFAULT_TAX_RULE, { ...DEFAULT_TAX_RULE, brackets: DEFAULT_TAX_RULE.brackets.slice(1) })).toBe(false);
    expect(formatPercent(0.05)).toBe('0.05%');
    expect(formatPercent(22.5)).toBe('22.5%');
  });
});
