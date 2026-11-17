import { describe, expect, it } from 'vitest';
import { addDays, formatDayHeading, formatSchoolTime, schoolDay, schoolDayRange, schoolDayStart } from './time';

describe('school time zone (Africa/Cairo)', () => {
  it('an instant falls on the school-calendar day, whatever the viewer’s zone', () => {
    // 23:30 UTC on the 16th is 01:30 on the 17th in Cairo (UTC+2 in November).
    expect(schoolDay('2026-11-16T23:30:00Z')).toBe('2026-11-17');
    expect(schoolDay('2026-11-16T21:59:00Z')).toBe('2026-11-16');
  });

  it('a day starts at midnight in Cairo, summer time included', () => {
    expect(schoolDayStart('2026-11-17').toISOString()).toBe('2026-11-16T22:00:00.000Z');
    // Egypt's summer time (UTC+3) — July.
    expect(schoolDayStart('2026-07-01').toISOString()).toBe('2026-06-30T21:00:00.000Z');
  });

  it('a range ends after its last day (to exclusive), across month edges', () => {
    expect(schoolDayRange('2026-11-01', '2026-11-30')).toEqual({
      from: '2026-10-31T22:00:00.000Z',
      to: '2026-11-30T22:00:00.000Z',
    });
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('times and headers use Latin digits in both languages', () => {
    expect(formatSchoolTime('2026-11-17T12:24:00Z', 'en')).toBe('14:24');
    expect(formatSchoolTime('2026-11-17T12:24:00Z', 'ar')).toBe('14:24');
    expect(formatDayHeading('2026-11-17', 'en')).toBe('Tuesday 17 Nov 2026');
    expect(formatDayHeading('2026-11-17', 'ar')).toBe('الثلاثاء 17 نوفمبر 2026');
  });
});
