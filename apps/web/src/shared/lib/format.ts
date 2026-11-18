import { formatMoney as formatPiastres, type IsoDate, type IsoDateTime, type Month, type Piastres, type TimeOfDay } from '@school-erp/shared';
import type { Locale } from './i18n';

/** Money and day counts are pure and shared with the API: one implementation, in packages/shared. */
export { formatDayCount, formatDays, parseMoney } from '@school-erp/shared';

/**
 * `14,000.00`. `undefined` — an amount the API left out because the viewer may not see it (R7,
 * salary) — is a dash.
 */
export function formatMoney(value: Piastres | undefined): string {
  return value === undefined ? '—' : formatPiastres(value);
}

/**
 * Money inside a sentence, drawn as `<Money>` draws it — the label left of the figure in both
 * languages: `EGP 14,000.00` / `14,000.00 ج.م` (logical order; an Arabic line shows the label on
 * the left). The label and figure are joined by a no-break space, so a wrapping sentence never
 * leaves "EGP" at a line's end and the figure on the next. For amounts that are never negative
 * (totals, a net); a signed figure in Arabic text needs `<Money>`. `undefined` (hidden, R7) is a dash.
 */
export function formatMoneyText(value: Piastres | undefined, locale: Locale, currencyLabel: string): string {
  if (value === undefined) return formatMoney(value);
  const figure = formatPiastres(value);
  return locale === 'ar' ? `${figure} ${currencyLabel}` : `${currencyLabel} ${figure}`;
}

/** The sum of amounts, or `undefined` when any of them is hidden (R7). */
export function sumMoney(...values: (Piastres | undefined)[]): Piastres | undefined {
  return values.some((v) => v === undefined) ? undefined : values.reduce<number>((a, v) => a + (v as number), 0);
}

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

/** `2026-11` → `November` / `نوفمبر` (the year shown elsewhere, e.g. a year board's heading). */
export function formatMonthName(month: Month, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { month: 'long', timeZone: 'UTC' }).format(
    parseIsoDate(`${month}-01`),
  );
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

/** `07:30` → `7:30 am` / `7:30 ص` — a time of day in the viewer's language (no time zone). */
export function formatTimeOfDay(time: TimeOfDay, locale: Locale): string {
  const [h = 0, m = 0] = time.split(':').map(Number);
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(2000, 0, 1, h, m)));
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
