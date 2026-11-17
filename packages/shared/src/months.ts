import type { Month } from './types/common';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** True for a calendar month written `YYYY-MM` (`2026-11`; rejects `2026-13`, `2026-1`). */
export function isMonth(value: unknown): value is Month {
  return typeof value === 'string' && MONTH.test(value);
}

/** `YYYY-MM` of a date in its local calendar (the screens' "this month"). */
export function monthOf(date: Date): Month {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** `2026-11` + 2 → `2027-01`; `2026-01` − 1 → `2025-12`. */
export function shiftMonth(month: Month, delta: number): Month {
  const [y = 0, m = 1] = month.split('-').map(Number);
  const index = y * 12 + (m - 1) + delta;
  const year = Math.floor(index / 12);
  return `${year}-${String(index - year * 12 + 1).padStart(2, '0')}`;
}
