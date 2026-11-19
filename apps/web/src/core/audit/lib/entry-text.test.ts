import { describe, expect, it } from 'vitest';
import { createTranslator, getBaseMessages, hasMessage, mergeMessages, type Locale } from '@/shared/lib/i18n';
import { auditMessages } from '../messages';
import { changeRows, formatAuditValue, isMoneyField } from './entry-text';

const NBSP = ' ';

function deps(locale: Locale) {
  const messages = mergeMessages(getBaseMessages(locale), auditMessages(locale));
  return { t: createTranslator(messages, locale), has: (k: string) => hasMessage(messages, k), locale };
}

/** A value of an employee's entry as the timeline reads it in `locale`. */
function employeeValue(field: string, value: unknown, locale: Locale): string {
  const { t, has } = deps(locale);
  return formatAuditValue(field, value, t, has, locale, 'employee');
}

describe('formatAuditValue: employee fields read as the record shows them, never raw', () => {
  it('insurance status reads as its label, not the enum', () => {
    expect(employeeValue('insuranceStatus', 'NOT_INSURED', 'en')).toBe('Not insured');
    expect(employeeValue('insuranceStatus', 'INSURED', 'en')).toBe('Insured');
    expect(employeeValue('insuranceStatus', 'NOT_INSURED', 'ar')).toBe('غير مؤمَّن عليه');
    expect(employeeValue('insuranceStatus', 'INSURED', 'ar')).toBe('مؤمَّن عليه');
  });

  it('insured salary reads as money, not piastres', () => {
    expect(isMoneyField('insuredSalary')).toBe(true);
    expect(employeeValue('insuredSalary', 650000, 'en')).toBe(`EGP${NBSP}6,500.00`);
    expect(employeeValue('insuredSalary', 650000, 'ar')).toBe(`6,500.00${NBSP}ج.م`);
    // Not insured: no insured salary.
    expect(employeeValue('insuredSalary', null, 'en')).toBe('—');
  });

  it('basic salary as text reads as money too', () => {
    expect(employeeValue('basicSalary', 1300000, 'en')).toBe(`EGP${NBSP}13,000.00`);
  });

  it('highest degree reads as its label, not the enum', () => {
    expect(employeeValue('highestDegree', 'BACHELOR', 'en')).toBe("Bachelor's degree");
    expect(employeeValue('highestDegree', 'MASTER', 'ar')).toBe('ماجستير');
    expect(employeeValue('highestDegree', null, 'en')).toBe('—');
  });

  it('the insurance registration date reads as a date', () => {
    expect(employeeValue('insuranceRegistrationDate', '2026-11-01', 'en')).toBe('1 Nov 2026');
  });

  it('the rest of the record: enums, a yes/no, a stage by name', () => {
    expect(employeeValue('gender', 'FEMALE', 'en')).toBe('Female');
    expect(employeeValue('workSystem', 'FULL_TIME', 'en')).toBe('Full-time');
    expect(employeeValue('status', 'INACTIVE', 'en')).toBe('Inactive');
    expect(employeeValue('usesBus', true, 'en')).toBe('Yes');
    expect(employeeValue('stageId', { nameEn: 'Primary', nameAr: 'الابتدائية' }, 'ar')).toBe('الابتدائية');
  });
});

describe('changeRows: an insurance edit', () => {
  it('keeps one line per changed field, labelled in the screen language', () => {
    const changes = [
      { field: 'insuranceStatus', before: 'NOT_INSURED', after: 'INSURED' },
      { field: 'insuredSalary', before: null, after: 650000 },
    ];
    const en = deps('en');
    expect(changeRows(changes, en.t, en.has, 'en', 'employee').map((r) => r.label)).toEqual([
      'Insurance status',
      'Insured salary',
    ]);
    const ar = deps('ar');
    expect(changeRows(changes, ar.t, ar.has, 'ar', 'employee').map((r) => r.label)).toEqual([
      'حالة التأمين',
      'الأجر التأميني',
    ]);
  });
});
