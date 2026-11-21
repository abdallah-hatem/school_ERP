import { DEFAULT_TAX_RULE } from '@school-erp/shared';
import { describe, expect, it } from 'vitest';
import { formatPercent, parseYear, ruleSlices, sameRule } from './payroll-taxes';

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
