import { describe, expect, it } from 'vitest';
import {
  daysToQuarters,
  isQuarterStep,
  isValidDays,
  latenessDays,
  quartersToDays,
  SETTING_DEFAULTS,
  type LatenessRule,
} from '../src';

const DEFAULT_RULE: LatenessRule = {
  graceMinutes: SETTING_DEFAULTS['hr.lateness.graceMinutes'],
  steps: SETTING_DEFAULTS['hr.lateness.steps'],
  extraHourDays: SETTING_DEFAULTS['hr.lateness.extraHourDays'],
};

describe('latenessDays — default rule (§5)', () => {
  it.each([
    [0, 0],
    [1, 0.25],
    [60, 0.25],
    [61, 0.75],
    [120, 0.75],
    [121, 1.25],
    [180, 1.25],
    [181, 1.75],
  ])('lateness %i min → %d days', (minutes, days) => {
    expect(latenessDays(minutes, DEFAULT_RULE)).toBe(days);
  });

  it('6,000 minutes (the monthly maximum) → 0.75 + 98 × 0.5 = 49.75 days', () => {
    expect(latenessDays(6000, DEFAULT_RULE)).toBe(49.75);
  });

  it('rejects negative or fractional minutes', () => {
    expect(() => latenessDays(-1, DEFAULT_RULE)).toThrow(RangeError);
    expect(() => latenessDays(1.5, DEFAULT_RULE)).toThrow(RangeError);
  });
});

describe('latenessDays — grace minutes subtracted first (§5 GUESS)', () => {
  const rule = { ...DEFAULT_RULE, graceMinutes: 10 };

  it('grace 10: 10 → 0; 11 → 0.25', () => {
    expect(latenessDays(10, rule)).toBe(0);
    expect(latenessDays(11, rule)).toBe(0.25);
  });

  it('grace 10 with 70 minutes → 60 after grace → 0.25', () => {
    expect(latenessDays(70, rule)).toBe(0.25);
    expect(latenessDays(71, rule)).toBe(0.75);
  });
});

describe('latenessDays — custom steps (§5, §7)', () => {
  // 1st hour 0.5, 2nd 1, 3rd 1.5, each further hour 0.25.
  const rule: LatenessRule = {
    graceMinutes: 0,
    steps: [
      { hour: 1, days: 0.5 },
      { hour: 2, days: 1 },
      { hour: 3, days: 1.5 },
    ],
    extraHourDays: 0.25,
  };

  it('custom steps: 61 → 1.5', () => {
    expect(latenessDays(61, rule)).toBe(1.5);
  });

  // The plan lists 181 → 3.0 and 241 → 3.25. Under the documented rule ("any minutes inside an
  // hour count as that hour", the same rule that makes 61 → 1.5 above) 181 minutes is the 4th
  // hour, so the documented rule gives 180 → 3.0, 181 → 3.25, 240 → 3.25, 241 → 3.5.
  // Reported as a doubt; the documented rule is what is implemented.
  it('custom steps: 180 → 3.0; 181 → 3.25 (4th hour, extra 0.25); 240 → 3.25; 241 → 3.5', () => {
    expect(latenessDays(180, rule)).toBe(3);
    expect(latenessDays(181, rule)).toBe(3.25);
    expect(latenessDays(240, rule)).toBe(3.25);
    expect(latenessDays(241, rule)).toBe(3.5);
  });

  it('steps given out of order give the same answer', () => {
    const shuffled = { ...rule, steps: [...rule.steps].reverse() };
    expect(latenessDays(181, shuffled)).toBe(latenessDays(181, rule));
  });

  it('no float drift over many quarter steps', () => {
    const extraOnly: LatenessRule = { graceMinutes: 0, steps: [], extraHourDays: 0.25 };
    expect(latenessDays(60 * 100, extraOnly)).toBe(25);
  });
});

describe('day quarter steps (§7)', () => {
  it('isQuarterStep accepts 0, 0.25, 1.5, 30 and rejects 0.3, NaN, Infinity', () => {
    for (const v of [0, 0.25, 1.5, 30]) expect(isQuarterStep(v)).toBe(true);
    for (const v of [0.3, Number.NaN, Number.POSITIVE_INFINITY]) expect(isQuarterStep(v)).toBe(false);
  });

  it('isValidDays: 0.3 / −0.25 / 30.25 → invalid; 0, 0.25, 5, 30 → valid', () => {
    for (const v of [0.3, -0.25, 30.25]) expect(isValidDays(v)).toBe(false);
    for (const v of [0, 0.25, 5, 30]) expect(isValidDays(v)).toBe(true);
  });

  it('converts between days and quarters', () => {
    expect(daysToQuarters(1.25)).toBe(5);
    expect(quartersToDays(5)).toBe(1.25);
    expect(() => daysToQuarters(0.3)).toThrow(RangeError);
  });
});
