import { describe, expect, it } from 'vitest';
import {
  formatClockDateTime,
  formatClockTime,
  formatDayCount,
  formatDays,
  formatMoney,
  formatTimeOfDayText,
  parseMoney,
} from '../src';

describe('Money and Days formatters (§6)', () => {
  it('Money(1400000) = "14,000.00", Money(1) = "0.01", Money(100) = "1.00", Money(1000001) = "10,000.01"; no float drift; Days(1.25) = "1.25"', () => {
    expect(formatMoney(1400000)).toBe('14,000.00');
    expect(formatMoney(1)).toBe('0.01');
    expect(formatMoney(100)).toBe('1.00');
    expect(formatMoney(1000001)).toBe('10,000.01');
    // 0.1 + 0.2 pounds is 30.000000000000004 piastres — still prints as 0.30.
    expect(formatMoney((0.1 + 0.2) * 100)).toBe('0.30');
    expect(formatMoney(999999999999)).toBe('9,999,999,999.99');
    expect(formatDays(1.25)).toBe('1.25');
    expect(formatDays(0.1 + 0.2)).toBe('0.3');
  });

  it('formats zero and negative amounts and day counts', () => {
    expect(formatMoney(0)).toBe('0.00');
    expect(formatMoney(-150)).toBe('-1.50');
    expect(formatDays(0)).toBe('0');
    expect(formatDays(2)).toBe('2');
    expect(formatDays(0.5)).toBe('0.5');
    expect(formatDays(0.75)).toBe('0.75');
  });

  it('parses typed money as text into integer piastres', () => {
    expect(parseMoney('14,000.00')).toBe(1400000);
    expect(parseMoney('14000.5')).toBe(1400050);
    expect(parseMoney('0.01')).toBe(1);
    expect(parseMoney('1400')).toBe(140000);
    expect(parseMoney('1.234')).toBeNull();
    expect(parseMoney('abc')).toBeNull();
    expect(parseMoney('')).toBeNull();
    expect(parseMoney(formatMoney(1000001))).toBe(1000001);
  });
});

describe('formatDayCount: the noun agrees with the number', () => {
  it.each([
    [1, 'يوم واحد'],
    [2, 'يومان'],
    [3, '3 أيام'],
    [10, '10 أيام'],
    [11, '11 يومًا'],
    [30, '30 يومًا'],
    [0.25, '0.25 يوم'],
    [0.5, '0.5 يوم'],
    [0.75, '0.75 يوم'],
    [1.25, '1.25 يوم'],
    [2.5, '2.5 يوم'],
    [0, '0 يوم'],
    [100, '100 يوم'],
    [102, '102 يوم'],
    [103, '103 أيام'],
    [111, '111 يومًا'],
  ])('Arabic %s → %s (Western digits)', (days, text) => {
    expect(formatDayCount(days, 'ar')).toBe(text);
  });

  it.each([
    [1, 'يوم واحد'],
    [2, 'يومين'],
    [3, '3 أيام'],
    [11, '11 يومًا'],
    [0.5, '0.5 يوم'],
  ])('Arabic after a verbal noun (oblique, "خصم …") %s → %s', (days, text) => {
    expect(formatDayCount(days, 'ar', { case: 'oblique' })).toBe(text);
  });

  it('English ignores the case', () => {
    expect(formatDayCount(2, 'en', { case: 'oblique' })).toBe('2 days');
  });

  it.each([
    [1, '1 day'],
    [0.5, '0.5 day'],
    [0.25, '0.25 day'],
    [2, '2 days'],
    [1.25, '1.25 days'],
    [0, '0 days'],
    [11, '11 days'],
  ])('English %s → %s', (days, text) => {
    expect(formatDayCount(days, 'en')).toBe(text);
  });
});

describe('times of day — always 12-hour with AM/PM (ص/م), on the school clock (Cairo)', () => {
  const NBSP = ' ';

  it('an afternoon instant reads 4:07 PM / 4:07 م (UTC+2 in November)', () => {
    expect(formatClockTime('2026-11-20T14:07:00Z', 'en')).toBe(`4:07${NBSP}PM`);
    expect(formatClockTime('2026-11-20T14:07:00Z', 'ar')).toBe(`4:07${NBSP}م`);
  });

  it('midnight is 12:00 AM and noon is 12:00 PM, in both languages', () => {
    expect(formatClockTime('2026-11-20T22:00:00Z', 'en')).toBe(`12:00${NBSP}AM`);
    expect(formatClockTime('2026-11-20T22:00:00Z', 'ar')).toBe(`12:00${NBSP}ص`);
    expect(formatClockTime('2026-11-20T10:00:00Z', 'en')).toBe(`12:00${NBSP}PM`);
    expect(formatClockTime('2026-11-20T10:00:00Z', 'ar')).toBe(`12:00${NBSP}م`);
    expect(formatClockTime('2026-11-20T22:01:00Z', 'en')).toBe(`12:01${NBSP}AM`);
  });

  it('single-digit hours have no leading zero; minutes always two digits', () => {
    expect(formatClockTime('2026-11-20T07:05:00Z', 'en')).toBe(`9:05${NBSP}AM`);
    expect(formatClockTime('2026-11-20T07:05:00Z', 'ar')).toBe(`9:05${NBSP}ص`);
    expect(formatClockTime('2026-11-20T21:59:00Z', 'en')).toBe(`11:59${NBSP}PM`);
  });

  it('reads Cairo’s clock, summer time included (UTC+3 in July); another zone on request', () => {
    expect(formatClockTime('2026-07-01T13:30:00Z', 'en')).toBe(`4:30${NBSP}PM`);
    expect(formatClockTime(new Date('2026-11-20T14:07:00Z'), 'en', 'UTC')).toBe(`2:07${NBSP}PM`);
  });

  it('a date with its time, with or without the year; the Cairo day, not the UTC day', () => {
    expect(formatClockDateTime('2026-11-17T09:05:00Z', 'en')).toBe(`17 Nov 2026, 11:05${NBSP}AM`);
    expect(formatClockDateTime('2026-11-17T09:05:00Z', 'ar')).toBe(`17 نوفمبر 2026، 11:05${NBSP}ص`);
    expect(formatClockDateTime('2026-11-14T08:30:00Z', 'en', { year: false })).toBe(`14 Nov, 10:30${NBSP}AM`);
    // 22:30 UTC on 30 November is 12:30 AM on 1 December in Cairo.
    expect(formatClockDateTime('2026-11-30T22:30:00Z', 'en')).toBe(`1 Dec 2026, 12:30${NBSP}AM`);
  });

  it('a stored HH:mm time of day (no zone)', () => {
    expect(formatTimeOfDayText('07:30', 'en')).toBe(`7:30${NBSP}AM`);
    expect(formatTimeOfDayText('07:30', 'ar')).toBe(`7:30${NBSP}ص`);
    expect(formatTimeOfDayText('14:30', 'en')).toBe(`2:30${NBSP}PM`);
    expect(formatTimeOfDayText('14:30', 'ar')).toBe(`2:30${NBSP}م`);
    expect(formatTimeOfDayText('00:00', 'en')).toBe(`12:00${NBSP}AM`);
    expect(formatTimeOfDayText('12:00', 'en')).toBe(`12:00${NBSP}PM`);
    expect(formatTimeOfDayText('12:00', 'ar')).toBe(`12:00${NBSP}م`);
  });

  it('never prints a 24-hour time', () => {
    for (let h = 0; h < 24; h += 1) {
      const hour = Number(formatTimeOfDayText(`${String(h).padStart(2, '0')}:00`, 'en').split(':')[0]);
      expect(hour).toBeGreaterThanOrEqual(1);
      expect(hour).toBeLessThanOrEqual(12);
    }
  });
});
