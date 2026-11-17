import { describe, expect, it } from 'vitest';
import en from '@school-erp/shared/locales/en/penalties.json';
import enErrors from '@school-erp/shared/locales/en/errors.json';
import { createTranslator, getBaseMessages, hasMessage, mergeMessages, type MessageTree } from '@/shared/lib/i18n';
import { groups } from '../test/fixtures';
import { parsePenaltiesQuery, penaltiesQueryString } from './list-query';
import { describeAction, employeeOptions, errorMessage, violationGroups } from './penalty-text';

const messages = mergeMessages(getBaseMessages('en'), { penalties: en, errors: enErrors } as unknown as MessageTree);
const t = createTranslator(messages);
const has = (key: string) => hasMessage(messages, key);

describe('describeAction', () => {
  it('says the days for a deduction and an investigation with days, the name otherwise', () => {
    expect(describeAction(t, 'DEDUCT_DAYS', 0.25)).toBe('Deduct 0.25 day');
    expect(describeAction(t, 'DEDUCT_DAYS', 1.5)).toBe('Deduct 1.5 days');
    expect(describeAction(t, 'INVESTIGATION', 2)).toBe('Referral to investigation, 2 days deducted');
    expect(describeAction(t, 'INVESTIGATION', null)).toBe('Referral to investigation');
    expect(describeAction(t, 'WARNING', null)).toBe('Warning');
  });
});

describe('violationGroups', () => {
  it('orders groups, drops retired violations and every violation of a retired group', () => {
    expect(violationGroups(groups, 'ar')).toEqual([
      { key: 'g-a', label: 'الجدول العام أ', options: [{ value: 'v-late', label: 'التأخر دون إخطار' }] },
      { key: 'g-b', label: 'الجدول ب', options: [{ value: 'v-phone', label: 'استخدام الهاتف في الفصل' }] },
    ]);
  });
});

describe('employeeOptions', () => {
  it('offers active employees only', () => {
    const options = employeeOptions(
      [
        { id: 'a', code: 'EMP-1', nameEn: 'A', nameAr: 'أ', status: 'ACTIVE' },
        { id: 'b', code: 'EMP-2', nameEn: 'B', nameAr: 'ب', status: 'INACTIVE' },
      ],
      'en',
    );
    expect(options).toEqual([{ value: 'a', label: 'A · EMP-1' }]);
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
      limit: 20,
    });
    const q = parsePenaltiesQuery({ month: '2026-09', status: 'PENDING', search: ' Mona ' }, '2026-11');
    expect(penaltiesQueryString(q, '2026-11')).toBe('?month=2026-09&status=PENDING&search=Mona');
  });
});
