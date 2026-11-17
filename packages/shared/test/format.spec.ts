import { describe, expect, it } from 'vitest';
import { formatDayCount, formatDays, formatMoney, parseMoney } from '../src';

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
