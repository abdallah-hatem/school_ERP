import { detectImageType, diffValues, isWorkHoursOrdered, resolveValues } from './settings.pure';

describe('resolveValues', () => {
  it('fills keys with no row from the §7 defaults', () => {
    const out = resolveValues(
      ['school.defaultLanguage', 'school.workStart', 'school.workEnd', 'school.workingDays'],
      [],
    );
    expect(out).toEqual({
      'school.defaultLanguage': 'en',
      'school.workStart': '07:30',
      'school.workEnd': '15:00',
      'school.workingDays': ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY'],
    });
  });

  it('a stored row wins over the default, including a stored null', () => {
    const out = resolveValues(
      ['school.workStart', 'school.logoUrl'],
      [
        { key: 'school.workStart', value: '08:00' },
        { key: 'school.logoUrl', value: null },
      ],
    );
    expect(out).toEqual({ 'school.workStart': '08:00', 'school.logoUrl': null });
  });
});

describe('diffValues', () => {
  it('returns only keys whose value changes, with old and new', () => {
    const diff = diffValues(
      { 'school.workStart': '07:30', 'school.defaultLanguage': 'ar' },
      { 'school.workStart': '08:00', 'school.defaultLanguage': 'ar' },
    );
    expect(diff).toEqual([{ key: 'school.workStart', oldValue: '07:30', newValue: '08:00' }]);
  });

  it('compares objects deeply, ignoring key order', () => {
    const diff = diffValues(
      { 'hr.payroll.partTime': { PART_TIME_4: 80, PART_TIME_3: 60, PART_TIME_2: 40 } },
      { 'hr.payroll.partTime': { PART_TIME_2: 40, PART_TIME_3: 60, PART_TIME_4: 80 } },
    );
    expect(diff).toEqual([]);
  });
});

describe('isWorkHoursOrdered', () => {
  it.each([
    ['07:30', '15:00', true],
    ['15:00', '07:30', false],
    ['08:00', '08:00', false],
    ['09:59', '10:00', true],
  ])('%s → %s is %s', (start, end, ok) => {
    expect(isWorkHoursOrdered(start, end)).toBe(ok);
  });
});

describe('detectImageType', () => {
  it('recognises png, jpg and svg by their bytes', () => {
    expect(detectImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe(
      'png',
    );
    expect(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe('jpg');
    expect(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe('svg');
    expect(
      detectImageType(
        Buffer.from('\uFEFF<?xml version="1.0"?>\n<!-- logo -->\n<svg viewBox="0 0 1 1"></svg>'),
      ),
    ).toBe('svg');
  });

  it('refuses anything else, including HTML pretending to be an image', () => {
    expect(detectImageType(Buffer.from('hello'))).toBeNull();
    expect(detectImageType(Buffer.from('<html><svg></svg></html>'))).toBeNull();
    expect(detectImageType(Buffer.from('GIF89a'))).toBeNull();
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
  });
});
