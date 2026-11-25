import {
  daysToQuarters,
  PayrollFlag,
  SEEDED_PENALTY_ACTIONS,
  SETTING_DEFAULTS,
  WORK_SYSTEMS,
  type PayrollRule,
  type PenaltyEffect,
} from '@school-erp/shared';
import { FALLBACK_CATALOGUE } from '../../../../prisma/seed/data/fallback';
import {
  calculateLine,
  deductedDays,
  monthSalary,
  ownPenaltyAmount,
  payslipPenaltyAmount,
  penaltyShare,
  percentOf,
  sumAdjustments,
  sumDays,
  type LineInput,
  type PenaltyDeduction,
} from './index';
import { mulDivRoundHalfUp } from './rounding';

const RULE: PayrollRule = {
  dayDivisor: 30,
  partTime: SETTING_DEFAULTS['hr.payroll.partTime'],
};

const input = (overrides: Partial<LineInput> = {}): LineInput => ({
  basicSalary: 1_000_000,
  workSystem: 'FULL_TIME',
  penalties: [],
  latenessDays: 0,
  adjustments: [],
  pendingPenalties: 0,
  ...overrides,
});

const days = (n: number | null, effect: PenaltyEffect = 'DEDUCT_DAYS'): PenaltyDeduction => ({
  effect,
  percentBase: null,
  days: n,
  percent: null,
  amount: null,
});
const pct = (percent: number, percentBase: 'MONTH_SALARY' | 'BASIC_SALARY' = 'MONTH_SALARY'): PenaltyDeduction => ({
  effect: 'DEDUCT_PERCENT',
  percentBase,
  days: null,
  percent,
  amount: null,
});
const fixed = (amount: number): PenaltyDeduction => ({ effect: 'DEDUCT_AMOUNT', percentBase: null, days: null, percent: null, amount });
const recordOnly: PenaltyDeduction = { effect: 'RECORD_ONLY', percentBase: null, days: null, percent: null, amount: null };

describe('deductedDays', () => {
  it('counts DEDUCT_DAYS and INVESTIGATION with days', () => {
    expect(deductedDays('DEDUCT_DAYS', 1.5)).toBe(1.5);
    expect(deductedDays('INVESTIGATION', 1)).toBe(1);
  });

  it.each(['RECORD_ONLY', 'DEDUCT_PERCENT', 'DEDUCT_AMOUNT'] as const)('%s → 0 days', (effect) => {
    expect(deductedDays(effect, 2)).toBe(0);
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
      penaltyDaysAmount: 0,
      latenessAmount: 0,
      net: 1_000_000,
      flags: [],
    });
  });

  it('two penalties (1 + 0.5 days) → 1.5 days, amount = round(1.5 × salary ÷ divisor), priced once', () => {
    const line = calculateLine(input({ basicSalary: 1_000_001, penalties: [days(1), days(0.5)] }), RULE);
    expect(line.penaltyDays).toBe(1.5);
    // 1.5 × 1,000,001 ÷ 30 = 50,000.05 → 50,000
    expect(line.penaltyAmount).toBe(50_000);
    expect(line.penaltyDaysAmount).toBe(50_000);
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
    const line = calculateLine(input({ penalties: [days(30), days(5)], pendingPenalties: 2 }), RULE);
    expect(line.net).toBe(0);
    expect(line.flags).toEqual([PayrollFlag.NET_FLOORED, PayrollFlag.PENDING_PENALTIES]);
  });
});

describe('penalty effects in payroll (spec 2026-11-25-penalty-actions)', () => {
  it('the spec example: 2.5% of 9,999.99 = 24,999.975 → EGP 250.00', () => {
    expect(percentOf(999_999, 2.5)).toBe(25_000);
  });

  it('walk A: 10% of the salary for the month on 9,000 → EGP 900.00', () => {
    const line = calculateLine(input({ basicSalary: 900_000, penalties: [pct(10)] }), RULE);
    expect(line.penaltyAmount).toBe(90_000);
    expect(line.penaltyDaysAmount).toBe(0);
    expect(line.penaltyDays).toBe(0);
    expect(line.net).toBe(810_000);
  });

  it('walk D: the % follows the line’s salary at this calculation (9,000 → 900; 10,000 → 1,000, days at 10,000 ÷ 30 too)', () => {
    expect(calculateLine(input({ basicSalary: 900_000, penalties: [pct(10)] }), RULE).penaltyAmount).toBe(90_000);
    const raised = calculateLine(input({ basicSalary: 1_000_000, penalties: [pct(10), days(1)] }), RULE);
    expect(raised.penaltyDaysAmount).toBe(33_333);
    expect(raised.penaltyAmount).toBe(100_000 + 33_333);
  });

  it('walk D part-timer: Huda (60%, basic 10,000): 10% of the salary for the month = 600.00; of the basic = 1,000.00', () => {
    const huda = (base: 'MONTH_SALARY' | 'BASIC_SALARY') =>
      calculateLine(input({ basicSalary: 1_000_000, workSystem: 'PART_TIME_3', penalties: [pct(10, base)] }), RULE);
    expect(huda('MONTH_SALARY').monthSalary).toBe(600_000);
    expect(huda('MONTH_SALARY').penaltyAmount).toBe(60_000);
    expect(huda('BASIC_SALARY').penaltyAmount).toBe(100_000);
  });

  it('walk E: 0.5 day + 5% + EGP 300 on 9,000 → 150.00 + 450.00 + 300.00 = EGP 900.00 (before the move: 600.00)', () => {
    const after = calculateLine(input({ basicSalary: 900_000, penalties: [recordOnly, days(0.5), pct(5), fixed(30_000)] }), RULE);
    expect(after.penaltyDaysAmount).toBe(15_000);
    expect(after.penaltyAmount).toBe(90_000);
    const before = calculateLine(input({ basicSalary: 900_000, penalties: [recordOnly, days(0.5), pct(5)] }), RULE);
    expect(before.penaltyAmount).toBe(60_000);
  });

  it('walk F: 31 Jan vs 28 Feb — a % takes the same EGP in both months (a share of the month’s salary, no day count)', () => {
    const jan = calculateLine(input({ basicSalary: 900_000, penalties: [pct(10)] }), RULE);
    const feb = calculateLine(input({ basicSalary: 900_000, penalties: [pct(10)] }), RULE);
    expect(jan.penaltyAmount).toBe(feb.penaltyAmount);
  });

  it('edge case 5: an investigation with no days costs 0; with days it is priced as days', () => {
    expect(calculateLine(input({ penalties: [days(null, 'INVESTIGATION')] }), RULE).penaltyAmount).toBe(0);
    const withDays = calculateLine(input({ basicSalary: 900_000, penalties: [days(2, 'INVESTIGATION')] }), RULE);
    expect(withDays.penaltyDays).toBe(2);
    expect(withDays.penaltyAmount).toBe(60_000);
  });

  it('edge case 16: two % penalties in one month (10% and 2.5% of 9,999.99) → 1,000.00 + 250.00, each rounded on its own', () => {
    const line = calculateLine(input({ basicSalary: 999_999, penalties: [pct(10), pct(2.5)] }), RULE);
    // 99,999.9 → 100,000 and 24,999.975 → 25,000; rounding the sum (124,999.875) would give 124,999.88.
    expect(line.penaltyAmount).toBe(125_000);
  });

  it('edge case 17: penalties exceeding the month’s pay (60% + EGP 5,000 on 9,000) → net 0, NET_FLOORED (no cap)', () => {
    const line = calculateLine(input({ basicSalary: 900_000, penalties: [pct(60), fixed(500_000)] }), RULE);
    expect(line.penaltyAmount).toBe(540_000 + 500_000);
    expect(line.net).toBe(0);
    expect(line.flags).toEqual([PayrollFlag.NET_FLOORED]);
  });

  it('edge case 18: a % of the basic salary for a part-timer may exceed a share of their month’s salary; the floor still applies', () => {
    const line = calculateLine(input({ basicSalary: 1_000_000, workSystem: 'PART_TIME_2', penalties: [pct(100, 'BASIC_SALARY')] }), RULE);
    expect(line.monthSalary).toBe(400_000);
    expect(line.penaltyAmount).toBe(1_000_000);
    expect(line.net).toBe(0);
    expect(line.flags).toContain(PayrollFlag.NET_FLOORED);
  });

  it('record-only penalties cost nothing', () => {
    expect(ownPenaltyAmount(recordOnly, { monthSalary: 1, basicSalary: 1 })).toBeNull();
    expect(calculateLine(input({ penalties: [recordOnly, recordOnly] }), RULE).penaltyAmount).toBe(0);
  });
});

describe('payslip amounts per penalty', () => {
  const line = { monthSalary: 900_000, basicSalary: 900_000, penaltyDays: 1.5, penaltyDaysAmount: 45_000 };

  it('a days penalty gets its share of the day-priced part only; a % its own amount; a fixed one its amount; record-only 0', () => {
    expect(payslipPenaltyAmount(days(1), line)).toBe(30_000);
    expect(payslipPenaltyAmount(days(0.5), line)).toBe(15_000);
    expect(payslipPenaltyAmount(pct(10), line)).toBe(90_000);
    expect(payslipPenaltyAmount(fixed(20_000), line)).toBe(20_000);
    expect(payslipPenaltyAmount(recordOnly, line)).toBe(0);
  });

  it('penaltyShare splits the line days amount by days, rounding half up', () => {
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

/**
 * The owner's rule for the move: today's day deductions don't change by a piastre. Every violation
 * of today's seeded catalogue, each level and all its levels in one month, over a sweep of salaries
 * and every work system: the line's penalty amount equals the old rule's
 * `round(Σ days × month salary ÷ divisor)` and each payslip share equals the old share.
 */
describe("day deductions are unchanged over today's seeded catalogue", () => {
  const effectOf = new Map(SEEDED_PENALTY_ACTIONS.map((a) => [a.code as string, a.effect]));
  const violations = FALLBACK_CATALOGUE.groups.flatMap((g) => g.violations);
  /** The rule before penalty actions (payroll-line.ts, dev before 2026-11-26). */
  const oldAmount = (dayList: number[], salary: number, divisor: number) =>
    mulDivRoundHalfUp(daysToQuarters(sumDays(dayList)), salary, 4 * divisor);
  const oldShare = (d: number, lineDays: number, lineAmount: number) =>
    lineDays <= 0 || !d ? 0 : mulDivRoundHalfUp(daysToQuarters(d), lineAmount, daysToQuarters(lineDays));
  const salaries = [100, 333_333, 900_000, 999_999, 1_000_001, 1_234_567, 7_654_321, 100_000_000];

  it('the seeded catalogue has day levels to check, and every seeded code has an effect', () => {
    const levels = violations.flatMap((v) => v.levels);
    expect(levels.some((l) => l.days)).toBe(true);
    for (const l of levels) expect(effectOf.has(l.action)).toBe(true);
  });

  it.each(WORK_SYSTEMS)('%s: every level alone, and all of a violation’s levels together, price as before', (workSystem) => {
    for (const divisor of [26, 30, 31]) {
      const rule = { ...RULE, dayDivisor: divisor };
      for (const basicSalary of salaries) {
        const salary = monthSalary(basicSalary, workSystem, rule.partTime);
        for (const v of violations) {
          const penalties = v.levels.map((l): PenaltyDeduction => ({
            effect: effectOf.get(l.action)!,
            percentBase: null,
            days: l.days ?? null,
            percent: null,
            amount: null,
          }));
          const groups = [...penalties.map((p) => [p]), penalties];
          for (const group of groups) {
            const dayList = group.map((p) => deductedDays(p.effect, p.days)).filter((d) => d > 0);
            const got = calculateLine(input({ basicSalary, workSystem, penalties: group }), rule);
            const old = oldAmount(dayList, salary, divisor);
            expect(got.penaltyAmount).toBe(old);
            expect(got.penaltyDaysAmount).toBe(old);
            for (const p of group) {
              expect(payslipPenaltyAmount(p, { ...got, basicSalary })).toBe(
                oldShare(deductedDays(p.effect, p.days), got.penaltyDays, old),
              );
            }
          }
        }
      }
    }
  });
});
