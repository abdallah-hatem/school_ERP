import { schoolDayOf } from '@school-erp/shared';
import type { IsoDate, Month } from '@school-erp/shared';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Month helpers have one home, `@school-erp/shared`; re-exported so api callers keep one import. */
export { isMonth, monthOf } from '@school-erp/shared';

/** A `YYYY-MM` month as a `@db.Date` range: `{ gte: 1st of month, lt: 1st of next month }`. */
export function monthDateRange(month: Month): { gte: Date; lt: Date } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) };
}

/** True for a real calendar day written `YYYY-MM-DD` (rejects `2026-02-30`). */
export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string') return false;
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** `YYYY-MM-DD` → a Date at UTC midnight (what Prisma stores in a `@db.Date` column). */
export function fromIsoDate(value: IsoDate): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** A `@db.Date` value (UTC midnight) → `YYYY-MM-DD`. */
export function toIsoDate(value: Date): IsoDate {
  return value.toISOString().slice(0, 10);
}

/**
 * Today's calendar date **at the school** (`SCHOOL_TIME_ZONE`, Cairo), `YYYY-MM-DD` — never the
 * server's own clock: a server on UTC is still on yesterday between midnight and 02:00 in Cairo,
 * and "not in the future" would refuse the school's today (§3 hire date, §4 penalty date). The
 * same day jobs, notifications and the web app use (`schoolDayOf`).
 */
export function todayIsoDate(now: Date = new Date()): IsoDate {
  return schoolDayOf(now);
}
