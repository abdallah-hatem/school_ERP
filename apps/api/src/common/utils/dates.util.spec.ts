import { fromIsoDate, isIsoDate, todayIsoDate, toIsoDate } from './dates.util';

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

  it('round-trips through a UTC-midnight Date', () => {
    expect(toIsoDate(fromIsoDate('2026-06-01'))).toBe('2026-06-01');
  });

  it('todayIsoDate formats the given local date', () => {
    expect(todayIsoDate(new Date(2026, 10, 7, 23, 59))).toBe('2026-11-07');
  });
});
