import { describe, expect, it } from 'vitest';
import ar from '@school-erp/shared/locales/ar/penalties.json';
import en from '@school-erp/shared/locales/en/penalties.json';
import enErrors from '@school-erp/shared/locales/en/errors.json';
import { createTranslator, getBaseMessages, hasMessage, mergeMessages, type MessageTree } from '@/shared/lib/i18n';
import { groups } from '../test/fixtures';
import { parsePenaltiesQuery, penaltiesQueryString } from './list-query';
import { describeAction, employeeChoice, errorMessage, violationGroups } from './penalty-text';

const messages = mergeMessages(getBaseMessages('en'), { penalties: en, errors: enErrors } as unknown as MessageTree);
const t = createTranslator(messages);
const has = (key: string) => hasMessage(messages, key);

describe('describeAction', () => {
  it('says the days for a deduction and an investigation with days, the name otherwise', () => {
    expect(describeAction(t, 'en', 'DEDUCT_DAYS', 0.25)).toBe('Deduct 0.25 day');
    expect(describeAction(t, 'en', 'DEDUCT_DAYS', 1.5)).toBe('Deduct 1.5 days');
    expect(describeAction(t, 'en', 'INVESTIGATION', 2)).toBe('Referral to investigation, 2 days deducted');
    expect(describeAction(t, 'en', 'INVESTIGATION', null)).toBe('Referral to investigation');
    expect(describeAction(t, 'en', 'WARNING', null)).toBe('Warning');
  });

  it('Arabic: the noun agrees with the day count and follows خصم (يومين, not 2 أيام or يومان)', () => {
    const tAr = createTranslator(
      mergeMessages(getBaseMessages('ar'), { penalties: ar } as unknown as MessageTree),
    );
    expect(describeAction(tAr, 'ar', 'DEDUCT_DAYS', 1)).toBe('خصم يوم واحد');
    expect(describeAction(tAr, 'ar', 'DEDUCT_DAYS', 2)).toBe('خصم يومين');
    expect(describeAction(tAr, 'ar', 'DEDUCT_DAYS', 3)).toBe('خصم 3 أيام');
    expect(describeAction(tAr, 'ar', 'DEDUCT_DAYS', 0.5)).toBe('خصم 0.5 يوم');
    expect(describeAction(tAr, 'ar', 'INVESTIGATION', 15)).toBe('إحالة للتحقيق مع خصم 15 يومًا');
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
    const q = parsePenaltiesQuery({ month: '2026-09', status: 'PENDING', search: ' Mona ' }, '2026-11');
    expect(penaltiesQueryString(q, '2026-11')).toBe('?month=2026-09&status=PENDING&search=Mona');
  });
});
