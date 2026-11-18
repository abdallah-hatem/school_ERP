import { cleanChanges, diffChanges, hideSalaryValues, isSecretField, readLabel, toStoredValue } from './audit.pure';

describe('diffChanges (D7)', () => {
  it('keeps only the changed fields, each with before and after', () => {
    const before = { nameEn: 'Mona', phone: '010', basicSalary: 1400000, usesBus: false };
    const after = { nameEn: 'Mona', phone: '011', basicSalary: 1500000, usesBus: false };
    expect(diffChanges(before, after)).toEqual([
      { field: 'phone', before: '010', after: '011' },
      { field: 'basicSalary', before: 1400000, after: 1500000 },
    ]);
  });

  it('money stays in piastres: integers pass through untouched', () => {
    expect(diffChanges({ amount: 1 }, { amount: 1000001 })).toEqual([
      { field: 'amount', before: 1, after: 1000001 },
    ]);
  });

  it('a diff of equal values is empty (edge case 3) — whatever the key order', () => {
    const a = { levels: [{ level: 1, days: 0.5 }], meta: { x: 1, y: 2 } };
    const b = { meta: { y: 2, x: 1 }, levels: [{ days: 0.5, level: 1 }] };
    expect(diffChanges(a, b)).toEqual([]);
    expect(diffChanges(null, null)).toEqual([]);
  });

  it('secrets are never stored: password hashes and tokens are dropped, at any depth', () => {
    const changes = diffChanges(
      { email: 'a@x.test', passwordHash: 'h1', user: { tokenHash: 't1', name: 'A' } },
      {
        email: 'b@x.test',
        passwordHash: 'h2',
        user: { tokenHash: 't2', name: 'B' },
        refreshToken: 'r',
      },
    );
    expect(changes).toEqual([
      { field: 'email', before: 'a@x.test', after: 'b@x.test' },
      { field: 'user', before: { name: 'A' }, after: { name: 'B' } },
    ]);
    expect(JSON.stringify(changes)).not.toMatch(/h1|h2|t1|t2|"r"/);
  });

  it('a create (no before) lists every field from null; bookkeeping fields are skipped', () => {
    expect(
      diffChanges(undefined, {
        id: 'x',
        nameEn: 'Science',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ).toEqual([{ field: 'nameEn', before: null, after: 'Science' }]);
  });

  it('dates and decimals are stored as their JSON form; undefined becomes null', () => {
    const d = new Date('2026-11-01T00:00:00.000Z');
    const decimal = { toJSON: () => '1.25' };
    expect(
      diffChanges({ hireDate: null, days: undefined }, { hireDate: d, days: decimal }),
    ).toEqual([
      { field: 'hireDate', before: null, after: '2026-11-01T00:00:00.000Z' },
      { field: 'days', before: null, after: '1.25' },
    ]);
  });
});

describe('cleanChanges', () => {
  it('drops unchanged entries and secret fields, normalises values', () => {
    expect(
      cleanChanges([
        { field: 'school.workStart', before: '07:30', after: '08:00' },
        { field: 'school.workEnd', before: '15:00', after: '15:00' },
        { field: 'password', before: 'a', after: 'b' },
        { field: 'hr.payroll.partTime', before: { b: 1, a: 2 }, after: { a: 2, b: 1 } },
      ]),
    ).toEqual([{ field: 'school.workStart', before: '07:30', after: '08:00' }]);
  });

  it('keeps the subject a line is about (one employee of a lateness month, spec 7), names only', () => {
    const subject = { en: 'Mona Khalil', ar: 'منى خليل' };
    expect(
      cleanChanges([
        { field: 'minutes', before: 60, after: 0, subject: { ...subject, extra: 1 } as typeof subject },
        { field: 'minutes', before: 30, after: 30, subject },
      ]),
    ).toEqual([{ field: 'minutes', before: 60, after: 0, subject }]);
  });

  it('a hidden salary line keeps its subject but loses its values', () => {
    const subject = { en: 'Mona Khalil', ar: 'منى خليل' };
    expect(hideSalaryValues([{ field: 'net', before: 1, after: 2, subject }])).toEqual([
      { field: 'net', hidden: true, subject },
    ]);
  });
});

describe('isSecretField / toStoredValue', () => {
  it.each([
    'passwordHash',
    'password',
    'tokenHash',
    'refreshToken',
    'accessToken',
    'apiKey',
    'clientSecret',
  ])('%s is a secret', (f) => expect(isSecretField(f)).toBe(true));
  it.each(['nameEn', 'email', 'basicSalary', 'school.logoUrl', 'hr.violations'])('%s is not', (f) =>
    expect(isSecretField(f)).toBe(false),
  );
  it('non-finite numbers and invalid dates become null; bigint becomes text', () => {
    expect(toStoredValue(Number.NaN)).toBeNull();
    expect(toStoredValue(new Date('nope'))).toBeNull();
    expect(toStoredValue(BigInt(12))).toBe('12');
  });
});

describe('readLabel (dry run 2026-11-18: older entries in Arabic)', () => {
  const violation = { id: 'v1', nameEn: 'Late to class', nameAr: 'التأخر عن الحصة' };
  const entry = (over: Partial<Parameters<typeof readLabel>[0]> = {}) => ({
    entityLabel: 'Late to class',
    entityLabelAr: null,
    changes: [{ field: 'hr.violations', before: violation, after: { ...violation, isActive: false } }],
    ...over,
  });
  const plain = (label: string) => ({ en: label, ar: label });

  it('a stored Arabic label wins', () => {
    expect(readLabel(entry({ entityLabelAr: 'مخزّن' }))).toEqual({ en: 'Late to class', ar: 'مخزّن' });
  });

  it('an older list / catalogue edit takes the Arabic name from its own snapshot', () => {
    expect(readLabel(entry())).toEqual({ en: 'Late to class', ar: 'التأخر عن الحصة' });
  });

  it('a create (no before) reads the new value; a rename reads the name it was given then', () => {
    const created = [{ field: 'hr.violations', before: null, after: violation }];
    expect(readLabel(entry({ changes: created }))).toEqual({ en: 'Late to class', ar: 'التأخر عن الحصة' });
    const renamed = { ...violation, nameEn: 'Late', nameAr: 'متأخر' };
    const changes = [{ field: 'hr.violations', before: violation, after: renamed }];
    expect(readLabel(entry({ entityLabel: 'Late', changes }))).toEqual({ en: 'Late', ar: 'متأخر' });
  });

  it('a snapshot of another item (its English name is not the label) is not used', () => {
    expect(readLabel(entry({ entityLabel: 'Something else' }))).toEqual(plain('Something else'));
  });

  it('per-field or several changes, no label, no Arabic name: the one label in both', () => {
    const phone = [{ field: 'phone', before: '010', after: '011' }];
    expect(readLabel(entry({ entityLabel: 'Mona Khalil', changes: phone }))).toEqual(plain('Mona Khalil'));
    const two = [
      { field: 'hr.violations', before: violation, after: violation },
      { field: 'b', before: 1, after: 2 },
    ];
    expect(readLabel(entry({ changes: two }))).toEqual(plain('Late to class'));
    const settings = [{ field: 'x', before: null, after: { nameAr: 'س' } }];
    expect(readLabel(entry({ entityLabel: '', changes: settings }))).toEqual(plain(''));
    const noArabic = [{ field: 'hr.violations', before: null, after: { nameEn: 'Late to class' } }];
    expect(readLabel(entry({ changes: noArabic }))).toEqual(plain('Late to class'));
    expect(readLabel(entry({ changes: null }))).toEqual(plain('Late to class'));
  });
});
