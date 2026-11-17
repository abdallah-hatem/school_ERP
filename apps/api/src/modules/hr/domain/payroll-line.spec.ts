import { PayrollFlag, SETTING_DEFAULTS, type PayrollRule } from '@school-erp/shared';
import {
  calculateLine,
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

const input = (overrides: Partial<LineInput> = {}): LineInput => ({
  basicSalary: 1_000_000,
  workSystem: 'FULL_TIME',
  penaltyDays: [],
  latenessDays: 0,
  adjustments: [],
  pendingPenalties: 0,
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
    const line = calculateLine(input(), RULE);
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
    const line = calculateLine(input({ basicSalary: 1_000_001, penaltyDays: [1, 0.5] }), RULE);
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
    );
    // 0.75 × 1,000,000 ÷ 30 = 25,000
    expect(line.latenessAmount).toBe(25_000);
    expect(line.net).toBe(1_000_000 - 25_000 + 20_000 - 5_000);
  });

  it('part-time uses the setting percentage', () => {
    expect(calculateLine(input({ workSystem: 'PART_TIME_3' }), RULE).monthSalary).toBe(600_000);
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
    );
    expect(line.net).toBe(30_000);
    expect(line.flags).toEqual([]);
  });

  it('net floored at 0 with NET_FLOORED; pending penalties add PENDING_PENALTIES', () => {
    const line = calculateLine(input({ penaltyDays: [30, 5], pendingPenalties: 2 }), RULE);
    expect(line.net).toBe(0);
    expect(line.flags).toEqual([PayrollFlag.NET_FLOORED, PayrollFlag.PENDING_PENALTIES]);
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
