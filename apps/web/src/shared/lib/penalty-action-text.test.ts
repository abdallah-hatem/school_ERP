import { describe, expect, it } from 'vitest';
import arPayroll from '@school-erp/shared/locales/ar/payroll.json';
import enPayroll from '@school-erp/shared/locales/en/payroll.json';
import { ACTION, AMOUNT_ACTION, PERCENT_ACTION } from '@/test/penalty-actions';
import { createTranslator, getBaseMessages, mergeMessages, type MessageTree } from './i18n';
import { describeAction, payslipActionLabel, penaltyKinds } from './penalty-action-text';

/*
 * The labels of `docs/specs/2026-11-25-penalty-actions-scenarios.md` (named after the S-number of the
 * scenario that states them) and the owner's answers Q9, Q12, Q13 (2026-11-26).
 */

const en = createTranslator(mergeMessages(getBaseMessages('en'), { payroll: enPayroll } as unknown as MessageTree));
const ar = createTranslator(mergeMessages(getBaseMessages('ar'), { payroll: arPayroll } as unknown as MessageTree));
const LRI = '⁦';
const PDI = '⁩';
const BASIC = { ...PERCENT_ACTION, percentBase: 'BASIC_SALARY' as const };
/** An action named like its effect's default ("Deduct a % of salary"). */
const plainPercent = { ...PERCENT_ACTION, nameEn: 'Deduct a % of salary', nameAr: 'خصم نسبة من الأجر' };

describe('penalty labels — scenarios', () => {
  it('S1 — "Deduct 1 day"; Arabic as formatDayCount says it after خصم', () => {
    expect(describeAction(en, 'en', ACTION.DEDUCT_DAYS, { days: 1 })).toBe('Deduct 1 day');
    expect(describeAction(ar, 'ar', ACTION.DEDUCT_DAYS, { days: 1 })).toBe('خصم يوم واحد');
  });

  it('S2, S24 — "Deduct 0.5 day"; Arabic "خصم 0.5 يوم" (today’s formatDayCount, not "نصف يوم")', () => {
    expect(describeAction(en, 'en', ACTION.DEDUCT_DAYS, { days: 0.5 })).toBe('Deduct 0.5 day');
    expect(describeAction(ar, 'ar', ACTION.DEDUCT_DAYS, { days: 0.5 })).toBe('خصم 0.5 يوم');
  });

  it('S5 — "Deduct 10% of the salary for the month" / "خصم 10% من أجر الشهر" (the % kept in order in Arabic)', () => {
    expect(describeAction(en, 'en', PERCENT_ACTION, { percent: 10 })).toBe('Deduct 10% of the salary for the month');
    expect(describeAction(ar, 'ar', PERCENT_ACTION, { percent: 10 })).toBe(`خصم ${LRI}10%${PDI} من أجر الشهر`);
  });

  it('S6 — "Deduct 10% of the basic salary" / "خصم 10% من الأجر الأساسي"', () => {
    expect(describeAction(en, 'en', BASIC, { percent: 10 })).toBe('Deduct 10% of the basic salary');
    expect(describeAction(ar, 'ar', BASIC, { percent: 10 })).toBe(`خصم ${LRI}10%${PDI} من الأجر الأساسي`);
  });

  it('S7, S8 — two decimals, never trailing zeros: 0.05%, 2.5%, 12.75%', () => {
    expect(describeAction(en, 'en', PERCENT_ACTION, { percent: 0.05 })).toBe('Deduct 0.05% of the salary for the month');
    expect(describeAction(en, 'en', PERCENT_ACTION, { percent: 2.5 })).toBe('Deduct 2.5% of the salary for the month');
    expect(describeAction(en, 'en', PERCENT_ACTION, { percent: 12.75 })).toBe('Deduct 12.75% of the salary for the month');
  });

  it('S12, S57 — amounts: thousands grouped, piastres only when not zero, Western digits', () => {
    expect(describeAction(en, 'en', AMOUNT_ACTION, { amount: 30_000 })).toBe('Deduct EGP 300');
    expect(describeAction(en, 'en', AMOUNT_ACTION, { amount: 15_050 })).toBe('Deduct EGP 150.50');
    expect(describeAction(en, 'en', AMOUNT_ACTION, { amount: 125_000 })).toBe('Deduct EGP 1,250');
    expect(describeAction(en, 'en', AMOUNT_ACTION, { amount: 100_000_000 })).toBe('Deduct EGP 1,000,000');
    expect(describeAction(ar, 'ar', AMOUNT_ACTION, { amount: 30_000 })).toBe('خصم 300 جنيه');
    expect(describeAction(ar, 'ar', AMOUNT_ACTION, { amount: 15_050 })).toBe('خصم 150.50 جنيه');
    expect(describeAction(ar, 'ar', AMOUNT_ACTION, { amount: 125_000 })).toBe('خصم 1,250 جنيه');
  });

  it('S14, S21 — investigation with days names them; without, the name; record only, the name', () => {
    expect(describeAction(en, 'en', ACTION.INVESTIGATION, { days: 1.25 })).toBe('Referral to investigation, 1.25 days deducted');
    expect(describeAction(en, 'en', ACTION.INVESTIGATION, { days: 2 })).toBe('Referral to investigation, 2 days deducted');
    expect(describeAction(ar, 'ar', ACTION.INVESTIGATION, { days: 2 })).toBe('إحالة للتحقيق مع خصم يومين');
    expect(describeAction(en, 'en', ACTION.INVESTIGATION, {})).toBe('Referral to investigation');
    expect(describeAction(ar, 'ar', ACTION.RAISE_LOSS, {})).toBe('الحرمان من العلاوة السنوية');
    expect(describeAction(en, 'en', ACTION.WARNING, {})).toBe('Warning');
  });
});

describe('the payslip’s label (owner Q12, Q13)', () => {
  it('Q12 — the effect’s text, then the action’s own name when it isn’t the effect’s default', () => {
    expect(payslipActionLabel(en, 'en', { ...AMOUNT_ACTION, nameEn: 'Late uniform fine' }, { amount: 20_000 }, undefined)).toBe(
      'Deduct EGP 200 (Late uniform fine)',
    );
    expect(payslipActionLabel(en, 'en', ACTION.DEDUCT_DAYS, { days: 1 }, 900_000)).toBe('Deduct 1 day');
    expect(payslipActionLabel(en, 'en', plainPercent, { percent: 10 }, 900_000)).toBe('Deduct 10% of the salary for the month');
    expect(payslipActionLabel(en, 'en', ACTION.WARNING, {}, 900_000)).toBe('Warning');
    // A seeded action's name is never added, in either language.
    expect(payslipActionLabel(ar, 'ar', ACTION.DEDUCT_DAYS, { days: 1 }, 900_000)).toBe('خصم يوم واحد');
    const plainAmount = { ...AMOUNT_ACTION, nameEn: 'Deduct a fixed amount', nameAr: 'خصم مبلغ ثابت' };
    expect(payslipActionLabel(en, 'en', plainAmount, { amount: 20_000 }, undefined)).toBe('Deduct EGP 200');
    expect(payslipActionLabel(ar, 'ar', plainAmount, { amount: 20_000 }, undefined)).toBe('خصم 200 جنيه');
    expect(payslipActionLabel(ar, 'ar', { ...plainAmount, nameAr: 'غرامة الزي' }, { amount: 20_000 }, undefined)).toBe('خصم 200 جنيه (غرامة الزي)');
  });

  it('Q13 — a % of the basic salary says the base, in both languages', () => {
    const base = { ...BASIC, nameEn: 'Deduct a % of salary', nameAr: 'خصم نسبة من الأجر' };
    expect(payslipActionLabel(en, 'en', base, { percent: 10 }, 1_234_567)).toBe('Deduct 10% of the basic salary (12,345.67)');
    expect(payslipActionLabel(ar, 'ar', base, { percent: 10 }, 1_234_567)).toBe(`خصم ${LRI}10%${PDI} من الأجر الأساسي (${LRI}12,345.67${PDI})`);
  });
});

describe('a line without salary access (owner Q9)', () => {
  it('lists the deducting penalties by kind — never "0 days", never the EGP taken', () => {
    const kinds = [
      { effect: 'DEDUCT_DAYS' as const, days: 0.5, percent: null, amount: null },
      { effect: 'DEDUCT_PERCENT' as const, days: null, percent: 5, amount: null },
    ];
    expect(penaltyKinds(en, 'en', kinds)).toBe('2 penalties: 0.5 day, 5%');
    expect(penaltyKinds(en, 'en', [{ effect: 'DEDUCT_AMOUNT', days: null, percent: null, amount: 30_000 }])).toBe('1 penalty: EGP 300');
  });
});
