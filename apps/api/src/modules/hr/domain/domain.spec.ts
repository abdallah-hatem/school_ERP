import { PayrollFlag, SETTING_DEFAULTS, type LatenessRule } from '@school-erp/shared';
import {
  deductionAmount,
  displayDayValue,
  divRoundHalfUp,
  latenessDays,
  lineNet,
  monthSalary,
  mulDivRoundHalfUp,
  penaltyLevel,
} from './index';

const PART_TIME = SETTING_DEFAULTS['hr.payroll.partTime'];
const levels = (n: number) => Array.from({ length: n }, (_, i) => ({ level: i + 1 }));

describe('latenessDays (re-exported from @school-erp/shared)', () => {
  const rule: LatenessRule = {
    graceMinutes: 0,
    steps: SETTING_DEFAULTS['hr.lateness.steps'],
    extraHourDays: SETTING_DEFAULTS['hr.lateness.extraHourDays'],
  };

  // Same table as the shared package and the web build: one implementation, same answers.
  it.each([
    [0, 0],
    [1, 0.25],
    [60, 0.25],
    [61, 0.75],
    [120, 0.75],
    [121, 1.25],
    [180, 1.25],
    [181, 1.75],
  ])('lateness %i min → %d days in the API', (minutes, days) => {
    expect(latenessDays(minutes, rule)).toBe(days);
  });

  it('grace 10 with 70 minutes → 60 after grace → 0.25', () => {
    expect(latenessDays(70, { ...rule, graceMinutes: 10 })).toBe(0.25);
  });
});

describe('penaltyLevel (§4)', () => {
  it('penalty level: 0 prior → level 1', () => {
    expect(penaltyLevel(0, levels(5))).toBe(1);
  });

  it('penalty level: 4 prior with 5 levels → level 5', () => {
    expect(penaltyLevel(4, levels(5))).toBe(5);
  });

  it('penalty level: 7 prior → level 5 (last repeats)', () => {
    expect(penaltyLevel(7, levels(5))).toBe(5);
  });

  it('penalty level: 3 levels and 5 prior → level 3', () => {
    expect(penaltyLevel(5, levels(3))).toBe(3);
  });

  it('levels given out of order still cap at the highest', () => {
    expect(penaltyLevel(9, [{ level: 2 }, { level: 1 }])).toBe(2);
  });

  it('rejects a negative or fractional count and an empty level list', () => {
    expect(() => penaltyLevel(-1, levels(5))).toThrow(RangeError);
    expect(() => penaltyLevel(1.5, levels(5))).toThrow(RangeError);
    expect(() => penaltyLevel(0, [])).toThrow(RangeError);
  });
});

describe('monthSalary (§6 step 1)', () => {
  it('month salary: full-time 100%', () => {
    expect(monthSalary(1_000_000, 'FULL_TIME', PART_TIME)).toBe(1_000_000);
    expect(monthSalary(1_000_001, 'FULL_TIME', PART_TIME)).toBe(1_000_001);
  });

  it('month salary: PART_TIME_3 at 60% of 1,000,000 → 600,000', () => {
    expect(monthSalary(1_000_000, 'PART_TIME_3', PART_TIME)).toBe(600_000);
  });

  it('PART_TIME_4 80% and PART_TIME_2 40%', () => {
    expect(monthSalary(1_000_000, 'PART_TIME_4', PART_TIME)).toBe(800_000);
    expect(monthSalary(1_000_000, 'PART_TIME_2', PART_TIME)).toBe(400_000);
  });

  it('rounding: month salary 1,000,001 at PART_TIME_3 60% → 600,001 (half up)', () => {
    expect(monthSalary(1_000_001, 'PART_TIME_3', PART_TIME)).toBe(600_001);
  });

  it('exact half rounds up: 5 piastres at 50% → 3', () => {
    expect(monthSalary(5, 'PART_TIME_3', { ...PART_TIME, PART_TIME_3: 50 })).toBe(3);
  });

  it('uses the setting, not a hard-coded percentage', () => {
    expect(monthSalary(1_000_000, 'PART_TIME_3', { ...PART_TIME, PART_TIME_3: 75 })).toBe(750_000);
  });

  it('rejects a percentage outside 1–100', () => {
    expect(() => monthSalary(1_000, 'PART_TIME_2', { ...PART_TIME, PART_TIME_2: 0 })).toThrow(
      RangeError,
    );
    expect(() => monthSalary(1_000, 'PART_TIME_2', { ...PART_TIME, PART_TIME_2: 101 })).toThrow(
      RangeError,
    );
  });
});

describe('deductionAmount (§6 steps 3–4)', () => {
  it('rounding: penalty 1.25 days on month salary 1,000,001 ÷ 30 → round(41,666.71) = 41,667', () => {
    expect(deductionAmount(1.25, 1_000_001, 30)).toBe(41_667);
  });

  it('1.5 days on 600,000 ÷ 30 → 30,000', () => {
    expect(deductionAmount(1.5, 600_000, 30)).toBe(30_000);
  });

  it('0 days → 0', () => {
    expect(deductionAmount(0, 1_000_001, 30)).toBe(0);
  });

  it('exact half rounds up: 0.25 × 2 ÷ 1 = 0.5 → 1', () => {
    expect(deductionAmount(0.25, 2, 1)).toBe(1);
  });

  it('uses the divisor setting', () => {
    expect(deductionAmount(1, 600_000, 26)).toBe(23_077); // 23,076.92
  });

  it('rejects days that are not quarter steps, negative days and a bad divisor', () => {
    expect(() => deductionAmount(0.3, 600_000, 30)).toThrow(RangeError);
    expect(() => deductionAmount(-1, 600_000, 30)).toThrow(RangeError);
    expect(() => deductionAmount(1, 600_000, 0)).toThrow(RangeError);
    expect(() => deductionAmount(1, 600_000, 1.5)).toThrow(RangeError);
  });
});

describe('displayDayValue (§6 step 2)', () => {
  it('dayValue is display-only: 1,000,001 ÷ 30 shows 33,333.37 and is never used to multiply; 600,000 ÷ 30 = 20,000', () => {
    // The unrounded day value is 33,333.37 piastres; shown rounded to the piastre.
    expect(1_000_001 / 30).toBeCloseTo(33_333.37, 2);
    expect(displayDayValue(1_000_001, 30)).toBe(33_333);
    expect(displayDayValue(600_000, 30)).toBe(20_000);

    // Multiplying the rounded day value would give 41,666; the real deduction is 41,667.
    const fromRounded = Math.round(1.25 * displayDayValue(1_000_001, 30));
    expect(fromRounded).toBe(41_666);
    expect(deductionAmount(1.25, 1_000_001, 30)).toBe(41_667);
  });
});

describe('lineNet (§6 step 6)', () => {
  const base = {
    monthSalary: 600_000,
    penaltyAmount: 0,
    latenessAmount: 0,
    adjustmentAdditions: 0,
    adjustmentDeductions: 0,
  };

  it('net = salary − penalties − lateness + additions − deductions', () => {
    expect(
      lineNet({
        monthSalary: 600_000,
        penaltyAmount: 30_000,
        latenessAmount: 15_000,
        adjustmentAdditions: 50_000,
        adjustmentDeductions: 5_000,
      }),
    ).toEqual({ net: 600_000, flags: [] });
  });

  it('net floors at 0 and returns the NET_FLOORED flag', () => {
    expect(lineNet({ ...base, monthSalary: 100_000, penaltyAmount: 150_000 })).toEqual({
      net: 0,
      flags: [PayrollFlag.NET_FLOORED],
    });
  });

  it('net exactly 0 is not floored', () => {
    expect(lineNet({ ...base, monthSalary: 100_000, penaltyAmount: 100_000 })).toEqual({
      net: 0,
      flags: [],
    });
  });

  it('additions count before the floor: salary 1,000, deductions 1,500, addition 800 → net 300, no flag', () => {
    expect(
      lineNet({ ...base, monthSalary: 1_000, penaltyAmount: 1_500, adjustmentAdditions: 800 }),
    ).toEqual({ net: 300, flags: [] });
  });

  it('rejects negative or fractional amounts', () => {
    expect(() => lineNet({ ...base, penaltyAmount: -1 })).toThrow(RangeError);
    expect(() => lineNet({ ...base, monthSalary: 0.5 })).toThrow(RangeError);
  });
});

describe('rounding helpers', () => {
  it('divRoundHalfUp rounds half up on integers', () => {
    expect(divRoundHalfUp(5, 2)).toBe(3);
    expect(divRoundHalfUp(4, 3)).toBe(1);
    expect(divRoundHalfUp(5, 3)).toBe(2);
    expect(divRoundHalfUp(0, 7)).toBe(0);
  });

  it('mulDivRoundHalfUp multiplies before rounding', () => {
    expect(mulDivRoundHalfUp(5, 1_000_001, 120)).toBe(41_667);
  });

  it('rejects non-integers, negatives, a zero denominator and unsafe products', () => {
    expect(() => divRoundHalfUp(1.5, 2)).toThrow(RangeError);
    expect(() => divRoundHalfUp(-1, 2)).toThrow(RangeError);
    expect(() => divRoundHalfUp(1, 0)).toThrow(RangeError);
    expect(() => mulDivRoundHalfUp(Number.MAX_SAFE_INTEGER, 2, 1)).toThrow(RangeError);
  });
});
