import { describe, expect, it } from 'vitest';
import { InsuranceStatus } from '../enums';
import { SETTING_DEFAULTS } from '../settings';
import type { TaxRule } from '../types/hr';
import {
  incomeTax,
  insuranceShare,
  payrollTax,
  percentToBasisPoints,
  taxRuleIssues,
} from './payroll-tax';

/*
 * Expected values were worked out independently with exact fractions (bisection on
 * `t − tax(t) − fund% × (t + I) = net`), then rounded half up — not by running this code.
 */

const DEFAULTS: TaxRule = {
  brackets: SETTING_DEFAULTS['hr.tax.brackets'],
  martyrPercent: SETTING_DEFAULTS['hr.tax.martyrPercent'],
  insurancePercent: SETTING_DEFAULTS['hr.tax.insurancePercent'],
};

describe('default tax rule (HR-system values)', () => {
  it('is the monthly Egyptian scale: 5,000 at 0%, 1,250 at 10%, 1,250 at 15%, 10,833.33 at 20%, 16,666.67 at 22.5%, the rest at 25%', () => {
    expect(DEFAULTS.brackets).toEqual([
      { width: 500_000, percent: 0 },
      { width: 125_000, percent: 10 },
      { width: 125_000, percent: 15 },
      { width: 1_083_333, percent: 20 },
      { width: 1_666_667, percent: 22.5 },
      { width: null, percent: 25 },
    ]);
    expect(DEFAULTS.martyrPercent).toBe(0.05);
    expect(DEFAULTS.insurancePercent).toBe(11);
    expect(taxRuleIssues(DEFAULTS)).toEqual([]);
  });
});

describe('incomeTax', () => {
  it('HR-system parity: 10,000.00 taxable → 812.50 (0 + 125 + 187.5 + 500)', () => {
    expect(incomeTax(1_000_000, DEFAULTS.brackets)).toBe(81_250);
  });

  it('HR-system parity: 4,000.00 taxable → 0 (inside the 0% slice)', () => {
    expect(incomeTax(400_000, DEFAULTS.brackets)).toBe(0);
  });

  it('rounds the exact sum once, half up', () => {
    // 5,000.05 → 0.05 EGP at 10% = 0.005 → 0.01
    expect(incomeTax(500_005, DEFAULTS.brackets)).toBe(1);
  });
});

describe('insuranceShare', () => {
  it('insured on 5,000.00 at 11% → 550.00', () => {
    expect(insuranceShare(InsuranceStatus.INSURED, 500_000, 11)).toBe(55_000);
  });

  it('not insured → 0, whatever the insured salary', () => {
    expect(insuranceShare(InsuranceStatus.NOT_INSURED, 500_000, 11)).toBe(0);
  });

  it('insured with no insured salary → 0', () => {
    expect(insuranceShare(InsuranceStatus.INSURED, null, 11)).toBe(0);
  });
});

describe('payrollTax (gross-up)', () => {
  it('net in the 0% slice, not insured → no tax, fund on the gross, gross = net + fund', () => {
    expect(payrollTax(300_000, 0, DEFAULTS)).toEqual({
      insuranceAmount: 0,
      incomeTax: 0,
      martyrTax: 150,
      gross: 300_150,
    });
  });

  it('net exactly at the top of a slice stays in that slice (no off-by-one piastre)', () => {
    // 4,997.50 net ⇔ exactly 5,000.00 taxable: 0% tax, fund 2.50
    expect(payrollTax(499_750, 0, DEFAULTS)).toEqual({
      insuranceAmount: 0,
      incomeTax: 0,
      martyrTax: 250,
      gross: 500_000,
    });
  });

  it('HR-system parity: net 8,000.00 insured on 5,000.00 → insurance 550, and the parts add up to net', () => {
    const r = payrollTax(800_000, 55_000, DEFAULTS);
    expect(r).toEqual({ insuranceAmount: 55_000, incomeTax: 51_676, martyrTax: 454, gross: 907_130 });
    expect(r.gross - r.insuranceAmount - r.incomeTax - r.martyrTax).toBe(800_000);
  });

  it('net in the open-ended 25% slice is solved there', () => {
    expect(payrollTax(5_000_000, 0, DEFAULTS)).toEqual({
      insuranceAmount: 0,
      incomeTax: 1_331_611,
      martyrTax: 3_167,
      gross: 6_334_778,
    });
  });

  it('net 10,000.00, not insured', () => {
    expect(payrollTax(1_000_000, 0, DEFAULTS)).toEqual({
      insuranceAmount: 0,
      incomeTax: 101_700,
      martyrTax: 551,
      gross: 1_102_251,
    });
  });

  it('net 0 (floored), insured → the school still pays the insurance and its fund', () => {
    expect(payrollTax(0, 55_000, DEFAULTS)).toEqual({
      insuranceAmount: 55_000,
      incomeTax: 0,
      martyrTax: 28,
      gross: 55_028,
    });
  });

  it('net 0, not insured → everything 0', () => {
    expect(payrollTax(0, 0, DEFAULTS)).toEqual({ insuranceAmount: 0, incomeTax: 0, martyrTax: 0, gross: 0 });
  });

  it('a school without tax (all 0%) → gross = net + insurance', () => {
    const none: TaxRule = { brackets: [{ width: null, percent: 0 }], martyrPercent: 0, insurancePercent: 0 };
    expect(payrollTax(1_234_567, 0, none)).toEqual({ insuranceAmount: 0, incomeTax: 0, martyrTax: 0, gross: 1_234_567 });
  });

  it('gross always balances: gross − insurance − tax − fund = net, for many nets', () => {
    for (let net = 0; net <= 10_000_000; net += 77_777) {
      const r = payrollTax(net, 33_000, DEFAULTS);
      expect(r.gross - r.insuranceAmount - r.incomeTax - r.martyrTax).toBe(net);
    }
  });
});

describe('taxRuleIssues', () => {
  const bad = (rule: Partial<TaxRule>) => taxRuleIssues({ ...DEFAULTS, ...rule }).map((i) => i.issue);

  it('no brackets, or more than 10 → bracketsCount', () => {
    expect(bad({ brackets: [] })).toContain('bracketsCount');
    const eleven = [...Array.from({ length: 10 }, () => ({ width: 1, percent: 0 })), { width: null, percent: 0 }];
    expect(bad({ brackets: eleven })).toContain('bracketsCount');
  });

  it('an open-ended bracket in the middle, or a last bracket with a width → openEndedLast', () => {
    expect(bad({ brackets: [{ width: null, percent: 0 }, { width: null, percent: 10 }] })).toEqual(['openEndedLast']);
    expect(bad({ brackets: [{ width: 100, percent: 0 }] })).toEqual(['openEndedLast']);
  });

  it('a width of 0 or a fraction of a piastre → bracketWidth', () => {
    expect(bad({ brackets: [{ width: 0, percent: 0 }, { width: null, percent: 10 }] })).toEqual(['bracketWidth']);
    expect(bad({ brackets: [{ width: 1.5, percent: 0 }, { width: null, percent: 10 }] })).toEqual(['bracketWidth']);
  });

  it('a percent of 100 or more, negative, or with 3 decimals → bracketPercent', () => {
    expect(bad({ brackets: [{ width: null, percent: 100 }] })).toEqual(['bracketPercent']);
    expect(bad({ brackets: [{ width: null, percent: -1 }] })).toEqual(['bracketPercent']);
    expect(bad({ brackets: [{ width: null, percent: 10.125 }] })).toEqual(['bracketPercent']);
  });

  it('a bracket whose percent plus the fund reaches 100 → bracketPlusFund (no gross-up exists)', () => {
    expect(bad({ brackets: [{ width: null, percent: 99.96 }] })).toEqual(['bracketPlusFund']);
  });

  it('a bad fund or insurance percent is reported', () => {
    expect(bad({ martyrPercent: 100 })).toEqual(['martyrPercent']);
    expect(bad({ insurancePercent: 11.111 })).toEqual(['insurancePercent']);
  });

  it('percentToBasisPoints keeps 2 decimals exactly', () => {
    expect(percentToBasisPoints(22.5)).toBe(2250);
    expect(percentToBasisPoints(0.05)).toBe(5);
    expect(percentToBasisPoints(0.07)).toBe(7);
  });
});
