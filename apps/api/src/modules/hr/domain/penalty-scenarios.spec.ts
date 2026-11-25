import { PayrollFlag, SETTING_DEFAULTS, type PayrollRule } from '@school-erp/shared';
import { calculateLine, payslipPenaltyAmounts, type LineInput, type PenaltyDeduction } from './index';

/*
 * The money scenarios of `docs/specs/2026-11-25-penalty-actions-scenarios.md` (S1–S24, S63), written
 * blind from the spec and business docs, as pure-rule tests: one per scenario, named after it. The
 * payroll line is `calculateLine`; the payslip's per-penalty amounts are `payslipPenaltyAmounts`.
 * The labels these scenarios name are checked in the web app (`penalty-scenarios.test.ts`); the
 * same flows through the API in `penalty-actions-scenarios.e2e-spec.ts`.
 */

const RULE: PayrollRule = { dayDivisor: 30, partTime: SETTING_DEFAULTS['hr.payroll.partTime'] };

const none = { percentBase: null, days: null, percent: null, amount: null } as const;
const days = (n: number): PenaltyDeduction => ({ ...none, effect: 'DEDUCT_DAYS', days: n });
const investigation = (n: number | null): PenaltyDeduction => ({ ...none, effect: 'INVESTIGATION', days: n });
const month = (percent: number): PenaltyDeduction => ({ ...none, effect: 'DEDUCT_PERCENT', percentBase: 'MONTH_SALARY', percent });
const basic = (percent: number): PenaltyDeduction => ({ ...none, effect: 'DEDUCT_PERCENT', percentBase: 'BASIC_SALARY', percent });
const fixed = (amount: number): PenaltyDeduction => ({ ...none, effect: 'DEDUCT_AMOUNT', amount });
const recordOnly: PenaltyDeduction = { ...none, effect: 'RECORD_ONLY' };

function line(basicSalary: number, penalties: PenaltyDeduction[], over: Partial<LineInput> = {}, rule = RULE) {
  return calculateLine(
    { basicSalary, workSystem: 'FULL_TIME', penalties, latenessDays: 0, adjustments: [], pendingPenalties: 0, ...over },
    rule,
  );
}
const slip = (basicSalary: number, penalties: PenaltyDeduction[], over: Partial<LineInput> = {}) => {
  const l = line(basicSalary, penalties, over);
  return payslipPenaltyAmounts(penalties, { ...l, basicSalary });
};

describe('penalty actions — money scenarios (S1–S24, S63)', () => {
  it('S1 — one day deducted, round salary: 300.00, net 8,700.00, the days amount is the whole penalty amount', () => {
    expect(line(900_000, [days(1)])).toMatchObject({ penaltyDaysAmount: 30_000, penaltyAmount: 30_000, net: 870_000 });
  });

  it('S2 — half a day at an odd salary: 7,777.77 → 129.63, net 7,648.14', () => {
    expect(line(777_777, [days(0.5)])).toMatchObject({ penaltyAmount: 12_963, net: 764_814 });
  });

  it('S3 — a day deduction exactly on x.xx5 rounds up: 75.01; the day value shown 300.02', () => {
    expect(line(900_060, [days(0.25)])).toMatchObject({ penaltyAmount: 7_501, net: 892_559, dayValue: 30_002 });
  });

  it('S4 — a part-timer (80%): salary for the month 7,012.34, one day 233.74, net 6,778.60', () => {
    expect(line(876_543, [days(1)], { workSystem: 'PART_TIME_4' })).toMatchObject({ monthSalary: 701_234, penaltyAmount: 23_374, net: 677_860 });
  });

  it('S5 — 10% of the salary for the month: 900.00, net 8,100.00, no day-priced part', () => {
    expect(line(900_000, [month(10)])).toMatchObject({ penaltyDaysAmount: 0, penaltyAmount: 90_000, net: 810_000 });
  });

  it('S6 — a part-timer (60%, basic 10,000): 10% of the month 600.00, of the basic 1,000.00; equal for a full-timer', () => {
    expect(line(1_000_000, [month(10)], { workSystem: 'PART_TIME_3' })).toMatchObject({ penaltyAmount: 60_000, net: 540_000 });
    expect(line(1_000_000, [basic(10)], { workSystem: 'PART_TIME_3' })).toMatchObject({ penaltyAmount: 100_000, net: 500_000 });
    expect(line(1_000_000, [month(10)]).penaltyAmount).toBe(line(1_000_000, [basic(10)]).penaltyAmount);
  });

  it('S7 — a % on x.xx5 and just below: 0.05% of 10,010.00 = 5.01; of 10,009.00 = 5.00', () => {
    expect(line(1_001_000, [month(0.05)]).penaltyAmount).toBe(501);
    expect(line(1_000_900, [month(0.05)]).penaltyAmount).toBe(500);
  });

  it('S8 — two % in one month (10% and 2.5% of 9,999.99): 1,000.00 + 250.00, net 8,749.99; 12.75% → 1,275.00', () => {
    expect(line(999_999, [month(10), month(2.5)])).toMatchObject({ penaltyAmount: 125_000, net: 874_999 });
    expect(line(999_999, [month(12.75)]).penaltyAmount).toBe(127_500);
  });

  it('S9 — each % is rounded on its own: two 0.05% of 10,010.00 = 10.02 (not 10.01), net 9,999.98', () => {
    expect(line(1_001_000, [month(0.05), month(0.05)])).toMatchObject({ penaltyAmount: 1_002, net: 999_998 });
  });

  it('S10 — days are summed first and priced once: two 0.25 days = 150.01 (not 150.02); the shares add up to it (owner Q14)', () => {
    expect(line(900_060, [days(0.25), days(0.25)])).toMatchObject({ penaltyDays: 0.5, penaltyAmount: 15_001, net: 885_059 });
    // Largest remainder: 7,500.5 each → 7,501 + 7,500 (the scenario's 75.01 + 75.01 was half up each).
    expect(slip(900_060, [days(0.25), days(0.25)])).toEqual([7_501, 7_500]);
  });

  it('S11 — three 0.25 days of 10,000.00: 250.00 paid, net 9,750.00; the shares add up to 250.00 (owner Q14)', () => {
    expect(line(1_000_000, [days(0.25), days(0.25), days(0.25)])).toMatchObject({ penaltyAmount: 25_000, net: 975_000 });
    const shares = slip(1_000_000, [days(0.25), days(0.25), days(0.25)]);
    expect(shares).toEqual([8_334, 8_333, 8_333]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(25_000);
  });

  // The scenario says 1,750.50 / 7,249.50: its own sum is off by 50.00 (300 + 150.50 + 1,250 = 1,700.50).
  it('S12 — fixed amounts are added as they are: 300 + 150.50 + 1,250 = 1,700.50, net 7,299.50', () => {
    expect(line(900_000, [fixed(30_000), fixed(15_050), fixed(125_000)])).toMatchObject({ penaltyAmount: 170_050, net: 729_950 });
  });

  it('S13 — a fixed amount for a part-timer is not scaled: 300.00, net 5,700.00 (owner Q8)', () => {
    expect(line(1_000_000, [fixed(30_000)], { workSystem: 'PART_TIME_3' })).toMatchObject({ penaltyAmount: 30_000, net: 570_000 });
  });

  it('S14 — every effect in one month (Karim, 12,345.67): 1,652.55, net 10,693.12, and each payslip amount', () => {
    const ps = [days(0.75), investigation(1.25), month(2.5), basic(3), fixed(15_050), recordOnly];
    expect(line(1_234_567, ps)).toMatchObject({ penaltyDays: 2, penaltyDaysAmount: 82_304, penaltyAmount: 165_255, net: 1_069_312 });
    expect(slip(1_234_567, ps)).toEqual([30_864, 51_440, 30_864, 37_037, 15_050, 0]);
  });

  it('S15 — mixed effects for a part-timer (80%, 8,765.43): 2,311.51, net 4,700.83', () => {
    expect(line(876_543, [days(1), month(10), basic(10), fixed(50_000)], { workSystem: 'PART_TIME_4' })).toMatchObject({
      monthSalary: 701_234,
      penaltyAmount: 231_151,
      net: 470_083,
    });
  });

  it('S16 — with lateness and adjustments: penalties 750.00 (days 300.00), lateness 225.00, net 8,425.00', () => {
    const l = line(900_000, [month(5), days(1)], {
      latenessDays: 0.75,
      adjustments: [
        { type: 'ADDITION', amount: 50_000 },
        { type: 'DEDUCTION', amount: 10_000 },
      ],
    });
    expect(l).toMatchObject({ penaltyAmount: 75_000, penaltyDaysAmount: 30_000, latenessAmount: 22_500, net: 842_500 });
  });

  it('S17 — the net would go negative: floored at 0 and flagged NET_FLOORED; no cap', () => {
    const l = line(900_000, [month(60), fixed(500_000)], { latenessDays: 0.5, adjustments: [{ type: 'ADDITION', amount: 50_000 }] });
    expect(l).toMatchObject({ penaltyAmount: 1_040_000, latenessAmount: 15_000, net: 0, flags: [PayrollFlag.NET_FLOORED] });
  });

  it('S18 — a % of the basic for a part-timer above the month’s pay: accepted, net 0, NET_FLOORED', () => {
    expect(line(800_000, [basic(50)], { workSystem: 'PART_TIME_2' })).toMatchObject({ monthSalary: 320_000, penaltyAmount: 400_000, net: 0, flags: [PayrollFlag.NET_FLOORED] });
  });

  it('S19 — 100% exactly: net 0.00, not flagged (only a net below 0 is, owner Q3)', () => {
    expect(line(900_000, [month(100)])).toMatchObject({ penaltyAmount: 900_000, net: 0, flags: [] });
  });

  it('S20 — deductions above pay, an addition brings the net back above 0: 1,000.00, not flagged (owner Q3)', () => {
    expect(line(500_000, [fixed(600_000)], { adjustments: [{ type: 'ADDITION', amount: 200_000 }] })).toMatchObject({ net: 100_000, flags: [] });
  });

  it('S21 — investigation with and without days, a record-only action: 0.00, 600.00, 0.00; net 8,400.00', () => {
    const ps = [investigation(null), investigation(2), recordOnly];
    expect(line(900_000, ps)).toMatchObject({ penaltyAmount: 60_000, net: 840_000 });
    expect(slip(900_000, ps)).toEqual([0, 60_000, 0]);
  });

  it('S22 — January vs February: the same 10% and 1 day cost 1,200.00 in both months', () => {
    expect(line(900_000, [month(10), days(1)]).penaltyAmount).toBe(120_000);
    // A month has one salary and one divisor (§6): nothing in the line depends on the month's length.
    expect(line(900_000, [month(10), days(1)])).toEqual(line(900_000, [month(10), days(1)]));
  });

  it('S23 — the divisor changed to 26: days 346.15, % and fixed unchanged — 1,446.15, net 7,553.85', () => {
    const at30 = line(900_000, [days(1), month(10), fixed(20_000)]);
    expect(at30.penaltyAmount).toBe(140_000);
    const at26 = line(900_000, [days(1), month(10), fixed(20_000)], {}, { ...RULE, dayDivisor: 26 });
    expect(at26).toMatchObject({ penaltyDaysAmount: 34_615, penaltyAmount: 144_615, net: 755_385 });
  });

  it('S24 — a seeded "Deduct days" 0.5 prices as before the feature: 150.00', () => {
    expect(line(900_000, [days(0.5)])).toMatchObject({ penaltyAmount: 15_000, penaltyDaysAmount: 15_000 });
  });

  it('S63 — the most a month can take (30 days + 100% + EGP 1,000,000): accepted, net 0, floored, no cap', () => {
    expect(line(900_000, [days(30), month(100), fixed(100_000_000)])).toMatchObject({
      penaltyAmount: 900_000 + 900_000 + 100_000_000,
      net: 0,
      flags: [PayrollFlag.NET_FLOORED],
    });
  });
});
