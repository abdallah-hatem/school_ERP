import type { IsoDate, IsoDateTime, Month } from '@school-erp/shared';
import type { Locale } from './i18n';

/** Money and day counts are pure and shared with the API: one implementation, in packages/shared. */
export { formatDayCount, formatDays, formatMoney, parseMoney } from '@school-erp/shared';

/** Arabic month and day names, Latin digits — figures stay typable and match the tables. */
const INTL_LOCALE: Record<Locale, string> = { en: 'en-GB', ar: 'ar-EG-u-nu-latn' };

/** Grouped integer for counts (`1,284`), Latin digits in both languages. */
export function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

function parseIsoDate(date: IsoDate): Date {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** `2026-11-05` → `5 Nov 2026` / `5 نوفمبر 2026`. Calendar dates, so read in UTC (no TZ shift). */
export function formatDate(date: IsoDate, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parseIsoDate(date));
}

/** `2026-11` → `November 2026` / `نوفمبر 2026`. */
export function formatMonth(month: Month, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parseIsoDate(`${month}-01`));
}

/** A JS Date (from a picker) → `YYYY-MM-DD` of the day the person picked, in their local calendar. */
export function toIsoDate(date: Date): IsoDate {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** `2026-11-17T09:05:00Z` → `17 Nov 2026, 11:05` / `17 نوفمبر 2026، 11:05` in the viewer's time zone. */
export function formatDateTime(value: IsoDateTime, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

/** Today as `YYYY-MM-DD` in the person's calendar — the `max` of a date that can't be in the future. */
export function todayIso(): IsoDate {
  return toIsoDate(new Date());
}

/** `YYYY-MM-DD` → a local Date at midnight, for a picker's `selected`. */
export function fromIsoDate(date: IsoDate): Date {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}
