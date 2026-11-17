import { describe, expect, it } from 'vitest';
import { isMonth, monthOf, shiftMonth } from '../src';

describe('month helpers', () => {
  it('accepts only YYYY-MM months', () => {
    expect(isMonth('2026-11')).toBe(true);
    expect(isMonth('2026-13')).toBe(false);
    expect(isMonth('2026-1')).toBe(false);
    expect(isMonth(undefined)).toBe(false);
  });

  it('shifts across year boundaries and formats a date as its month', () => {
    expect(shiftMonth('2026-11', 2)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-05', 0)).toBe('2026-05');
    expect(monthOf(new Date(2026, 10, 17))).toBe('2026-11');
  });
});
