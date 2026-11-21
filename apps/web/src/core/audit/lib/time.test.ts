import { describe, expect, it } from 'vitest';
import { formatTime } from '@/shared/lib/format';
import { addDays, formatDayHeading, formatFilterRange, schoolDay, schoolDayRange, schoolDayStart } from './time';

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
    expect(formatTime('2026-11-17T12:24:00Z', 'en')).toBe('2:24\u00a0PM');
    expect(formatTime('2026-11-17T12:24:00Z', 'ar')).toBe('2:24\u00a0م');
    expect(formatDayHeading('2026-11-17', 'en')).toBe('Tuesday 17 Nov 2026');
    expect(formatDayHeading('2026-11-17', 'ar')).toBe('الثلاثاء 17 نوفمبر 2026');
  });

  it('a chosen range is as short as it reads (finding 5: nothing cut off in the filters panel)', () => {
    expect(formatFilterRange('2026-11-17', '2026-11-17', 'en')).toBe('17 Nov 2026');
    expect(formatFilterRange('2026-11-01', '2026-11-17', 'en')).toBe('1–17 Nov 2026');
    expect(formatFilterRange('2026-09-30', '2026-10-10', 'en')).toBe('30 Sept – 10 Oct 2026');
    expect(formatFilterRange('2025-12-28', '2026-01-03', 'en')).toBe('28 Dec 2025 – 3 Jan 2026');
    expect(formatFilterRange('2026-09-30', '2026-10-10', 'ar')).toBe('30 سبتمبر – 10 أكتوبر 2026');
  });
});
