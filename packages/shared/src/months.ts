import { SCHOOL_TIME_ZONE } from './settings';
import type { IsoDate, Month } from './types/common';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** True for a calendar month written `YYYY-MM` (`2026-11`; rejects `2026-13`, `2026-1`). */
export function isMonth(value: unknown): value is Month {
  return typeof value === 'string' && MONTH.test(value);
}

/**
 * The `YYYY-MM` month of a day. A `YYYY-MM-DD` string gives the month it is written in (a day's
 * payroll month); a `Date` gives its month in the local calendar (the screens' "this month").
 */
export function monthOf(date: Date | IsoDate): Month {
  if (typeof date === 'string') return date.slice(0, 7);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** `2026-11` + 2 → `2027-01`; `2026-01` − 1 → `2025-12`. */
export function shiftMonth(month: Month, delta: number): Month {
  const [y = 0, m = 1] = month.split('-').map(Number);
  const index = y * 12 + (m - 1) + delta;
  const year = Math.floor(index / 12);
  return `${year}-${String(index - year * 12 + 1).padStart(2, '0')}`;
}

const SCHOOL_DAY_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: SCHOOL_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * The school's calendar day of an instant: `YYYY-MM-DD` on the school's clock (`SCHOOL_TIME_ZONE`).
 * 22:30 UTC on 30 November is already 1 December in Cairo. Jobs and notifications use it as "today".
 */
export function schoolDayOf(at: Date): IsoDate {
  return SCHOOL_DAY_FORMAT.format(at);
}
