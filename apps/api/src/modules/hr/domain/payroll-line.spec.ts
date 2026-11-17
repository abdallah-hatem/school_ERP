import { PayrollFlag, SETTING_DEFAULTS, type PayrollRule, type TaxRule } from '@school-erp/shared';
import {
  calculateLine,
  lineTax,
  deductedDays,
  penaltyShare,
  sumAdjustments,
  sumDays,
  type LineInput,
} from './index';

const RULE: PayrollRule = {
  dayDivisor: 30,
  partTime: SETTING_DEFAULTS['hr.payroll.partTime'],
};

const TAX: TaxRule = {
  brackets: SETTING_DEFAULTS['hr.tax.brackets'],
  martyrPercent: SETTING_DEFAULTS['hr.tax.martyrPercent'],
  insurancePercent: SETTING_DEFAULTS['hr.tax.insurancePercent'],
};

const input = (overrides: Partial<LineInput> = {}): LineInput => ({
  basicSalary: 1_000_000,
  workSystem: 'FULL_TIME',
  penaltyDays: [],
  latenessDays: 0,
  adjustments: [],
  pendingPenalties: 0,
  insuranceStatus: 'NOT_INSURED',
  insuredSalary: null,
  ...overrides,
});

describe('deductedDays', () => {
  it('counts DEDUCT_DAYS and INVESTIGATION with days', () => {
    expect(deductedDays('DEDUCT_DAYS', 1.5)).toBe(1.5);
    expect(deductedDays('INVESTIGATION', 1)).toBe(1);
  });

  it.each([
    'NOTICE',
    'WARNING',
    'RAISE_HALF_LOSS',
    'RAISE_LOSS',
    'RAISE_DEFER_3M',
    'PAY_CUT',
    'DEMOTION',
    'DISMISSAL',
  ] as const)('%s → 0 days', (action) => {
    expect(deductedDays(action, 2)).toBe(0);
  });

  it('INVESTIGATION without days → 0', () => {
    expect(deductedDays('INVESTIGATION', null)).toBe(0);
  });
});

describe('sumDays / sumAdjustments', () => {
  it('adds quarter days exactly', () => {
    expect(sumDays([0.25, 0.5, 1.25])).toBe(2);
    expect(sumDays([])).toBe(0);
  });

  it('splits additions and deductions', () => {
    expect(
      sumAdjustments([
        { type: 'ADDITION', amount: 100 },
        { type: 'DEDUCTION', amount: 30 },
        { type: 'ADDITION', amount: 5 },
      ]),
    ).toEqual({ additions: 105, deductions: 30 });
  });
});

describe('calculateLine', () => {
  it('full-time with no deductions → net = basic salary, day value shown rounded', () => {
    const line = calculateLine(input(), RULE, TAX);
    expect(line).toMatchObject({
      monthSalary: 1_000_000,
      dayValue: 33_333,
      penaltyAmount: 0,
      latenessAmount: 0,
      net: 1_000_000,
      flags: [],
    });
  });

  it('two penalties (1 + 0.5 days) → 1.5 days, amount = round(1.5 × salary ÷ divisor)', () => {
    const line = calculateLine(input({ basicSalary: 1_000_001, penaltyDays: [1, 0.5] }), RULE, TAX);
    expect(line.penaltyDays).toBe(1.5);
    // 1.5 × 1,000,001 ÷ 30 = 50,000.05 → 50,000
    expect(line.penaltyAmount).toBe(50_000);
  });

  it('lateness days × unrounded day value; adjustments added and subtracted', () => {
    const line = calculateLine(
      input({
        latenessDays: 0.75,
        adjustments: [
          { type: 'ADDITION', amount: 20_000 },
          { type: 'DEDUCTION', amount: 5_000 },
        ],
      }),
      RULE,
      TAX,
    );
    // 0.75 × 1,000,000 ÷ 30 = 25,000
    expect(line.latenessAmount).toBe(25_000);
    expect(line.net).toBe(1_000_000 - 25_000 + 20_000 - 5_000);
  });

  it('part-time uses the setting percentage', () => {
    expect(calculateLine(input({ workSystem: 'PART_TIME_3' }), RULE, TAX).monthSalary).toBe(600_000);
  });

  it('additions count before the floor: salary 1,000, deductions 1,500, addition 800 → 300', () => {
    const line = calculateLine(
      input({
        basicSalary: 100_000,
        adjustments: [
          { type: 'DEDUCTION', amount: 150_000 },
          { type: 'ADDITION', amount: 80_000 },
        ],
      }),
      RULE,
      TAX,
    );
    expect(line.net).toBe(30_000);
    expect(line.flags).toEqual([]);
  });

  it('net floored at 0 with NET_FLOORED; pending penalties add PENDING_PENALTIES', () => {
    const line = calculateLine(input({ penaltyDays: [30, 5], pendingPenalties: 2 }), RULE, TAX);
    expect(line.net).toBe(0);
    expect(line.flags).toEqual([PayrollFlag.NET_FLOORED, PayrollFlag.PENDING_PENALTIES]);
  });
});

describe('calculateLine — tax, martyrs\' fund and insurance (net is grossed up)', () => {
  it('not insured, net 10,000.00 → net unchanged; tax 1,017.00, fund 5.51, gross 11,022.51', () => {
    const line = calculateLine(input(), RULE, TAX);
    expect(line).toMatchObject({
      net: 1_000_000,
      insuranceAmount: 0,
      incomeTax: 101_700,
      martyrTax: 551,
      gross: 1_102_251,
    });
  });

  it('insured on 5,000.00 → insurance 550.00 paid by the school; parts add up to the net', () => {
    const line = calculateLine(input({ basicSalary: 800_000, insuranceStatus: 'INSURED', insuredSalary: 500_000 }), RULE, TAX);
    expect(line).toMatchObject({ net: 800_000, insuranceAmount: 55_000, incomeTax: 51_676, martyrTax: 454, gross: 907_130 });
    expect(line.gross - line.insuranceAmount - line.incomeTax - line.martyrTax).toBe(line.net);
  });

  it('part-time: insurance on the insured salary as entered, not pro-rated', () => {
    const line = calculateLine(
      input({ workSystem: 'PART_TIME_3', insuranceStatus: 'INSURED', insuredSalary: 500_000 }),
      RULE,
      TAX,
    );
    expect(line.monthSalary).toBe(600_000);
    expect(line.insuranceAmount).toBe(55_000);
  });

  it('net floored at 0, insured → the school still pays insurance and its fund; not insured → all 0', () => {
    const insured = calculateLine(
      input({ penaltyDays: [30, 5], insuranceStatus: 'INSURED', insuredSalary: 500_000 }),
      RULE,
      TAX,
    );
    expect(insured).toMatchObject({ net: 0, insuranceAmount: 55_000, incomeTax: 0, martyrTax: 28, gross: 55_028 });
    const notInsured = calculateLine(input({ penaltyDays: [30, 5] }), RULE, TAX);
    expect(notInsured).toMatchObject({ net: 0, insuranceAmount: 0, incomeTax: 0, martyrTax: 0, gross: 0 });
  });

  it('a school without tax (0% brackets, no fund, no insurance) → gross = net', () => {
    const none: TaxRule = { brackets: [{ width: null, percent: 0 }], martyrPercent: 0, insurancePercent: 0 };
    const line = calculateLine(input({ insuranceStatus: 'INSURED', insuredSalary: 500_000 }), RULE, none);
    expect(line).toMatchObject({ net: 1_000_000, insuranceAmount: 0, incomeTax: 0, martyrTax: 0, gross: 1_000_000 });
  });

  it('an adjustment changes the net, so lineTax re-grosses it (same as a full calculation)', () => {
    const withAddition = calculateLine(input({ adjustments: [{ type: 'ADDITION', amount: 100_000 }] }), RULE, TAX);
    expect(lineTax(withAddition.net, 0, TAX)).toEqual({
      insuranceAmount: withAddition.insuranceAmount,
      incomeTax: withAddition.incomeTax,
      martyrTax: withAddition.martyrTax,
      gross: withAddition.gross,
    });
    expect(withAddition.incomeTax).toBeGreaterThan(calculateLine(input(), RULE, TAX).incomeTax);
  });
});

describe('penaltyShare', () => {
  it('splits the line amount by days, rounding half up', () => {
    expect(penaltyShare(1, 1.5, 50_000)).toBe(33_333);
    expect(penaltyShare(0.5, 1.5, 50_000)).toBe(16_667);
    expect(penaltyShare(1.5, 1.5, 50_000)).toBe(50_000);
  });

  it('no days, or a line with no days → 0', () => {
    expect(penaltyShare(null, 1, 10_000)).toBe(0);
    expect(penaltyShare(0, 1, 10_000)).toBe(0);
    expect(penaltyShare(1, 0, 0)).toBe(0);
  });
});
