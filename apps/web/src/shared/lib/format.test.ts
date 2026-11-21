import { describe, expect, it } from 'vitest';
import { formatDateTime, formatMoneyText, formatTime, formatTimeOfDay } from './format';

const NBSP = ' ';

describe('formatMoneyText (money inside a sentence)', () => {
  it('the label left of the figure in both languages, joined so a wrap never splits them', () => {
    expect(formatMoneyText(2_147_483_647, 'en', 'EGP')).toBe(`EGP${NBSP}21,474,836.47`);
    // Logical order figure-then-label: an Arabic line draws the label on the left.
    expect(formatMoneyText(2_147_483_647, 'ar', 'ج.م')).toBe(`21,474,836.47${NBSP}ج.م`);
    expect(formatMoneyText(99_999_999_999, 'en', 'EGP')).not.toContain(' ');
  });

  it('zero and a piastre; a hidden amount is a dash with no label', () => {
    expect(formatMoneyText(0, 'en', 'EGP')).toBe(`EGP${NBSP}0.00`);
    expect(formatMoneyText(1, 'ar', 'ج.م')).toBe(`0.01${NBSP}ج.م`);
    expect(formatMoneyText(undefined, 'en', 'EGP')).toBe('—');
  });
});

describe('times — 12-hour with AM/PM (ص/م), on the school clock (Africa/Cairo)', () => {
  it('a time of day: 4:07 PM / 4:07 م; midnight 12:00 AM, noon 12:00 PM; no leading zero', () => {
    expect(formatTime('2026-11-20T14:07:00Z', 'en')).toBe(`4:07${NBSP}PM`);
    expect(formatTime('2026-11-20T14:07:00Z', 'ar')).toBe(`4:07${NBSP}م`);
    expect(formatTime('2026-11-20T07:30:00Z', 'ar')).toBe(`9:30${NBSP}ص`);
    expect(formatTime('2026-11-20T22:00:00Z', 'en')).toBe(`12:00${NBSP}AM`);
    expect(formatTime('2026-11-20T10:00:00Z', 'en')).toBe(`12:00${NBSP}PM`);
  });

  it('a date with its time, in Cairo whatever the device zone', () => {
    expect(formatDateTime('2026-11-17T09:05:00Z', 'en')).toBe(`17 Nov 2026, 11:05${NBSP}AM`);
    expect(formatDateTime('2026-11-17T09:05:00Z', 'ar')).toBe(`17 نوفمبر 2026، 11:05${NBSP}ص`);
    expect(formatDateTime('2026-11-14T15:30:00Z', 'en', { year: false })).toBe(`14 Nov, 5:30${NBSP}PM`);
  });

  it('a stored work time (HH:mm) as the picker lists it', () => {
    expect(formatTimeOfDay('07:30', 'en')).toBe(`7:30${NBSP}AM`);
    expect(formatTimeOfDay('15:00', 'ar')).toBe(`3:00${NBSP}م`);
    expect(formatTimeOfDay('00:00', 'ar')).toBe(`12:00${NBSP}ص`);
  });
});
