import {
  fromIsoDate,
  isIsoDate,
  isMonth,
  monthDateRange,
  monthOf,
  todayIsoDate,
  toIsoDate,
} from './dates.util';

describe('dates.util', () => {
  it('isIsoDate accepts real YYYY-MM-DD days only', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('2026-1-01')).toBe(false);
    expect(isIsoDate('2026-01-01T00:00:00Z')).toBe(false);
    expect(isIsoDate(20260101)).toBe(false);
  });

  it('isMonth accepts YYYY-MM months only', () => {
    expect(isMonth('2026-11')).toBe(true);
    expect(isMonth('2026-01')).toBe(true);
    expect(isMonth('2026-13')).toBe(false);
    expect(isMonth('2026-00')).toBe(false);
    expect(isMonth('2026-1')).toBe(false);
    expect(isMonth('2026-11-01')).toBe(false);
    expect(isMonth(202611)).toBe(false);
  });

  it('monthOf gives the day’s month; monthDateRange spans it (December rolls the year)', () => {
    expect(monthOf('2026-11-17')).toBe('2026-11');
    expect(monthDateRange('2026-12')).toEqual({
      gte: new Date('2026-12-01T00:00:00.000Z'),
      lt: new Date('2027-01-01T00:00:00.000Z'),
    });
  });

  it('round-trips through a UTC-midnight Date', () => {
    expect(toIsoDate(fromIsoDate('2026-06-01'))).toBe('2026-06-01');
  });

  it('todayIsoDate formats the given local date', () => {
    expect(todayIsoDate(new Date(2026, 10, 7, 23, 59))).toBe('2026-11-07');
  });
});
