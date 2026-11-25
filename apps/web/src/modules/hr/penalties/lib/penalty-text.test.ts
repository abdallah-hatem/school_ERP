import { describe, expect, it } from 'vitest';
import ar from '@school-erp/shared/locales/ar/penalties.json';
import en from '@school-erp/shared/locales/en/penalties.json';
import enErrors from '@school-erp/shared/locales/en/errors.json';
import { createTranslator, getBaseMessages, hasMessage, mergeMessages, type MessageTree } from '@/shared/lib/i18n';
import { groups } from '../test/fixtures';
import { parsePenaltiesQuery, penaltiesQueryString } from './list-query';
import { describeAction, employeeChoice, errorMessage, violationGroups } from './penalty-text';
import { ACTION, AMOUNT_ACTION, PERCENT_ACTION } from '@/test/penalty-actions';

const messages = mergeMessages(getBaseMessages('en'), { penalties: en, errors: enErrors } as unknown as MessageTree);
const t = createTranslator(messages);
const has = (key: string) => hasMessage(messages, key);

describe('describeAction', () => {
  it('says the days for a deduction and an investigation with days, the name otherwise', () => {
    expect(describeAction(t, 'en', ACTION.DEDUCT_DAYS, { days: 0.25 })).toBe('Deduct 0.25 day');
    expect(describeAction(t, 'en', ACTION.DEDUCT_DAYS, { days: 1.5 })).toBe('Deduct 1.5 days');
    expect(describeAction(t, 'en', ACTION.INVESTIGATION, { days: 2 })).toBe('Referral to investigation, 2 days deducted');
    expect(describeAction(t, 'en', ACTION.INVESTIGATION, { days: null })).toBe('Referral to investigation');
    expect(describeAction(t, 'en', ACTION.WARNING, { days: null })).toBe('Warning');
  });

  it('Arabic: the noun agrees with the day count and follows خصم (يومين, not 2 أيام or يومان)', () => {
    const tAr = createTranslator(
      mergeMessages(getBaseMessages('ar'), { penalties: ar } as unknown as MessageTree),
    );
    expect(describeAction(tAr, 'ar', ACTION.DEDUCT_DAYS, { days: 1 })).toBe('خصم يوم واحد');
    expect(describeAction(tAr, 'ar', ACTION.DEDUCT_DAYS, { days: 2 })).toBe('خصم يومين');
    expect(describeAction(tAr, 'ar', ACTION.DEDUCT_DAYS, { days: 3 })).toBe('خصم 3 أيام');
    expect(describeAction(tAr, 'ar', ACTION.DEDUCT_DAYS, { days: 0.5 })).toBe('خصم 0.5 يوم');
    expect(describeAction(tAr, 'ar', ACTION.INVESTIGATION, { days: 15 })).toBe('إحالة للتحقيق مع خصم 15 يومًا');
    expect(describeAction(tAr, 'ar', PERCENT_ACTION, { percent: 10 })).toBe('خصم 10% من أجر الشهر');
    expect(describeAction(tAr, 'ar', { ...PERCENT_ACTION, percentBase: 'BASIC_SALARY' }, { percent: 2.5 })).toBe('خصم 2.5% من الأجر الأساسي');
    expect(describeAction(tAr, 'ar', AMOUNT_ACTION, { amount: 20_000 })).toBe('خصم 200 جنيه');
    expect(describeAction(tAr, 'ar', ACTION.WARNING, {})).toBe('إنذار');
  });

  it('spec 2026-11-25 labels: a % says its salary, an amount reads short, a record-only action by its name', () => {
    expect(describeAction(t, 'en', PERCENT_ACTION, { percent: 10 })).toBe('Deduct 10% of the salary for the month');
    expect(describeAction(t, 'en', { ...PERCENT_ACTION, percentBase: 'BASIC_SALARY' }, { percent: 12.75 })).toBe('Deduct 12.75% of the basic salary');
    expect(describeAction(t, 'en', AMOUNT_ACTION, { amount: 20_000 })).toBe('Deduct EGP 200');
    expect(describeAction(t, 'en', AMOUNT_ACTION, { amount: 125_050 })).toBe('Deduct EGP 1,250.50');
    // A school-added record-only action reads by its own name.
    expect(describeAction(t, 'en', { ...ACTION.NOTICE, nameEn: 'Verbal note' }, {})).toBe('Verbal note');
  });

  it('edge case 30: a percent stored as 10.00 or 2.50 reads “10%” and “2.5%”, Western digits and % in both languages', () => {
    expect(describeAction(t, 'en', PERCENT_ACTION, { percent: 10.0 })).toContain('10%');
    expect(describeAction(t, 'en', PERCENT_ACTION, { percent: 2.5 })).toContain('2.5%');
    expect(describeAction(t, 'en', PERCENT_ACTION, { percent: 2.5 })).not.toContain('2.50');
  });
});

describe('violationGroups', () => {
  it('one section per group of the API\'s answer (it leaves out what is retired), in its order', () => {
    expect(violationGroups([groups[0]!], 'ar')).toEqual([
      { key: groups[0]!.id, label: groups[0]!.nameAr, options: groups[0]!.violations.map((v) => ({ value: v.id, label: v.nameAr })) },
    ]);
  });
});

describe('employeeChoice', () => {
  it('"Name · code" in the page language (the API lists the active employees)', () => {
    expect(employeeChoice({ id: 'a', code: 'EMP-1', nameEn: 'A', nameAr: 'أ' }, 'en')).toEqual({ value: 'a', label: 'A · EMP-1' });
    expect(employeeChoice({ id: 'a', code: 'EMP-1', nameEn: 'A', nameAr: 'أ' }, 'ar')).toEqual({ value: 'a', label: 'أ · EMP-1' });
  });
});

describe('errorMessage', () => {
  it('uses the translated code, then the server message, then the fallback', () => {
    expect(errorMessage({ error: 'EMPLOYEE_INACTIVE' }, t, has, 'x')).toBe('This employee is inactive.');
    expect(errorMessage({ error: 'SOMETHING_NEW', message: 'From server' }, t, has, 'x')).toBe('From server');
    expect(errorMessage({}, t, has, 'fallback')).toBe('fallback');
  });
});

describe('penalties list query', () => {
  it('defaults to this month and refuses a future month or unknown status', () => {
    expect(parsePenaltiesQuery({ month: '2027-01', status: 'NOPE', page: '0' }, '2026-11')).toEqual({
      month: '2026-11',
      status: undefined,
      search: undefined,
      page: 1,
      limit: 10,
    });
    const q = parsePenaltiesQuery({ month: '2026-09', status: 'WAITING_HR', search: ' Mona ' }, '2026-11');
    expect(penaltiesQueryString(q, '2026-11')).toBe('?month=2026-09&status=WAITING_HR&search=Mona');
  });
});
