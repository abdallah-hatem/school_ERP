import { describe, expect, it } from 'vitest';
import { createTranslator, getBaseMessages, hasMessage, mergeMessages, type Locale } from '@/shared/lib/i18n';
import { auditMessages } from '../messages';
import { changeRows, fileChangeText, formatAuditValue, isMoneyField } from './entry-text';

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

describe('changeRows: a backdated approval’s recount entry', () => {
  // `hr.penalty.recount` (penalty-records.service): which penalty moved, its level / days, and the
  // penalty whose approval moved it. The first label names a field, like the record's own "Date",
  // never a dangling "Penalty of" (dry run 2026-11-20 b).
  const changes = [
    { field: 'penaltyDate', before: null, after: '2026-11-16' },
    { field: 'level', before: 3, after: 4 },
    { field: 'days', before: 1, after: 2 },
    { field: 'recountedAfter', before: null, after: '2026-11-05' },
  ];

  it.each([
    ['en', ['Penalty date', 'Occurrence', 'Days', 'Raised by approving the penalty dated']],
    ['ar', ['تاريخ الجزاء', 'المرة', 'الأيام', 'ارتفعت مرته باعتماد جزاء بتاريخ']],
  ] as const)('%s: labels read as fields, never "Penalty of"', (locale, labels) => {
    const d = deps(locale);
    const rows = changeRows(changes, d.t, d.has, locale, 'penalty', 'hr.penalty.recount');
    expect(rows.map((r) => r.label)).toEqual(labels);
    expect(rows.map((r) => r.label).join(' ')).not.toMatch(/Penalty of|جزاء يوم/);
  });
});

describe('stored files read in words, never their file names', () => {
  const PHOTO = '/files/employee-photos/37af9816-ca92-4608-89d2-be9666bc1289.jpg';
  const NEW_PHOTO = '/files/employee-photos/70df5c73-e190-4881-aa0b-188ba94c1e6a.jpg';
  const LOGO = '/files/school/logo-1a2b.png';

  it.each([
    ['en', null, PHOTO, 'Photo added'],
    ['en', PHOTO, NEW_PHOTO, 'Photo changed'],
    ['en', PHOTO, null, 'Photo removed'],
    ['ar', null, PHOTO, 'أُضيفت صورة'],
    ['ar', PHOTO, NEW_PHOTO, 'تغيّرت الصورة'],
    ['ar', PHOTO, '', 'حُذفت الصورة'],
  ] as const)('photo (%s): %s → %s reads "%s"', (locale, before, after, text) => {
    const { t, has } = deps(locale);
    expect(fileChangeText('photoUrl', before, after, t)).toBe(text);
    const rows = changeRows([{ field: 'photoUrl', before, after }], t, has, locale, 'employee');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.text).toBe(text);
  });

  it.each([
    ['en', null, LOGO, 'School logo added'],
    ['en', LOGO, '/files/school/logo-9z.png', 'School logo changed'],
    ['en', LOGO, null, 'School logo removed'],
    ['ar', null, LOGO, 'أُضيف شعار المدرسة'],
    ['ar', LOGO, '/files/school/logo-9z.png', 'تغيّر شعار المدرسة'],
    ['ar', LOGO, null, 'حُذف شعار المدرسة'],
  ] as const)('school logo (%s): %s → %s reads "%s"', (locale, before, after, text) => {
    const { t, has } = deps(locale);
    const rows = changeRows([{ field: 'school.logoUrl', before, after }], t, has, locale, 'school_settings');
    expect(rows.map((r) => r.text)).toEqual([text]);
  });

  it('a new employee with a photo: "Photo added" among the other lines; no file name anywhere', () => {
    const { t, has } = deps('en');
    const rows = changeRows(
      [
        { field: 'code', before: null, after: 'EMP-0001' },
        { field: 'photoUrl', before: null, after: PHOTO },
      ],
      t,
      has,
      'en',
      'employee',
    );
    expect(rows.map((r) => r.text ?? r.label)).toEqual(['Code', 'Photo added']);
    expect(formatAuditValue('photoUrl', PHOTO, t, has, 'en', 'employee')).toBe('Uploaded');
    expect(formatAuditValue('school.logoUrl', LOGO, t, has, 'en')).not.toContain('logo-1a2b');
  });

  it('no file on either side writes no line; other fields are not file fields', () => {
    const { t, has } = deps('en');
    expect(fileChangeText('photoUrl', null, '', t)).toBeNull();
    expect(fileChangeText('phone', null, '011', t)).toBeNull();
    expect(changeRows([{ field: 'photoUrl', before: null, after: null }], t, has, 'en', 'employee')).toEqual([]);
  });
});

describe('formatAuditValue: times read 12-hour with AM/PM (ص/م), never 24-hour', () => {
  it('the school work hours (stored HH:mm) and an instant (school time)', () => {
    const en = deps('en');
    const ar = deps('ar');
    expect(formatAuditValue('school.workStart', '07:30', en.t, en.has, 'en')).toBe(`7:30${NBSP}AM`);
    expect(formatAuditValue('school.workEnd', '15:00', en.t, en.has, 'en')).toBe(`3:00${NBSP}PM`);
    expect(formatAuditValue('school.workEnd', '15:00', ar.t, ar.has, 'ar')).toBe(`3:00${NBSP}م`);
    expect(formatAuditValue('transferredAt', '2026-11-20T14:07:00.000Z', en.t, en.has, 'en')).toBe(
      `20 Nov 2026, 4:07${NBSP}PM`,
    );
  });
});
