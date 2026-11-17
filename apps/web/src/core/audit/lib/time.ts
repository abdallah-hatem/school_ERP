import type { IsoDate, IsoDateTime, Month } from '@school-erp/shared';
import type { Locale } from '@/shared/lib/i18n';

/*
 * When things happened, read in the school's time zone (audit spec → Screens): day headers, times
 * and the date-range filter all use the school's calendar, so the server render, the browser and
 * the API agree whatever zone the viewer's device is set to. Latin digits in both languages.
 */

/**
 * The school's zone. Every school runs in Egypt today (EGP, Egyptian phones), so it is the
 * product's default; it becomes a school setting when a school elsewhere signs up.
 */
export const SCHOOL_TIME_ZONE = 'Africa/Cairo';

const INTL_LOCALE: Record<Locale, string> = { en: 'en-GB', ar: 'ar-EG-u-nu-latn' };

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: SCHOOL_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function zonedParts(instant: Date): ZonedParts {
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(partsFormatter.formatToParts(instant).find((p) => p.type === type)?.value ?? 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** The school-calendar day an instant falls on (`2026-11-17`). */
export function schoolDay(at: IsoDateTime | Date): IsoDate {
  const p = zonedParts(new Date(at));
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** The school-calendar month an instant falls in (`2026-11`). */
export function schoolMonth(at: IsoDateTime | Date): Month {
  return schoolDay(at).slice(0, 7) as Month;
}

/** `day` plus `n` days (calendar arithmetic, no zone involved). */
export function addDays(day: IsoDate, n: number): IsoDate {
  const [y = 0, m = 1, d = 1] = day.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + n));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/** How far the school's clock is ahead of UTC at `instant`, in ms. */
function offsetAt(instant: Date): number {
  const p = zonedParts(instant);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The instant the school's `day` starts (midnight there), for the API's `from` / `to`. */
export function schoolDayStart(day: IsoDate): Date {
  const [y = 0, m = 1, d = 1] = day.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  // Twice: the offset at the guess can differ from the offset at the answer across a DST change.
  const first = guess - offsetAt(new Date(guess));
  return new Date(guess - offsetAt(new Date(first)));
}

/** `[start of from, start of the day after to)` as ISO instants — `to` is the last day included. */
export function schoolDayRange(from: IsoDate, to: IsoDate): { from: IsoDateTime; to: IsoDateTime } {
  return { from: schoolDayStart(from).toISOString(), to: schoolDayStart(addDays(to, 1)).toISOString() };
}

const timeFormatters: Record<Locale, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat(INTL_LOCALE.en, { timeZone: SCHOOL_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
  ar: new Intl.DateTimeFormat(INTL_LOCALE.ar, { timeZone: SCHOOL_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
};

/** `14:24` — the time of day at the school. */
export function formatSchoolTime(at: IsoDateTime, locale: Locale): string {
  return timeFormatters[locale].format(new Date(at));
}

/** `17 Nov 2026, 14:24` — the exact moment, for a tooltip. */
export function formatSchoolDateTime(at: IsoDateTime, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    timeZone: SCHOOL_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(at));
}

/** Calendar values are read at noon UTC so no zone can move them to another day. */
const noon = (day: IsoDate) => {
  const [y = 0, m = 1, d = 1] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
};

/** `Tuesday 17 Nov 2026` / `الثلاثاء 17 نوفمبر 2026` — a day header. */
export function formatDayHeading(day: IsoDate, locale: Locale): string {
  const weekday = new Intl.DateTimeFormat(INTL_LOCALE[locale], { timeZone: 'UTC', weekday: 'long' }).format(noon(day));
  return `${weekday} ${formatFilterDay(day, locale)}`;
}

/** `17 Nov` — a day inside a month group. */
export function formatShortDay(day: IsoDate, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(noon(day));
}

/** `17 Nov 2026` — a range edge in the date filter. */
export function formatFilterDay(day: IsoDate, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(noon(day));
}

/**
 * A chosen range for the date filter, as short as it can be read: one day `17 Nov 2026`; the same
 * month `1–17 Nov 2026`; the same year once `30 Sept – 10 Oct 2026`; across years both in full.
 */
export function formatFilterRange(from: IsoDate, to: IsoDate, locale: Locale): string {
  if (from === to) return formatFilterDay(from, locale);
  if (from.slice(0, 7) === to.slice(0, 7)) return `${Number(from.slice(8))}–${formatFilterDay(to, locale)}`;
  const dash = ' – ';
  if (from.slice(0, 4) !== to.slice(0, 4)) return formatFilterDay(from, locale) + dash + formatFilterDay(to, locale);
  const short = new Intl.DateTimeFormat(INTL_LOCALE[locale], { timeZone: 'UTC', day: 'numeric', month: 'short' });
  return short.format(noon(from)) + dash + formatFilterDay(to, locale);
}

/** `November 2026` — a month header. */
export function formatMonthHeading(month: Month, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(
    noon(`${month}-01`),
  );
}

/**
 * How long ago, for entries of the last few hours (`12 min ago`); `null` beyond that — the time
 * and the day header say it then. `now` comes from the server render so both sides agree.
 */
export function relativeAgo(
  at: IsoDateTime,
  now: IsoDateTime,
  t: (key: string, values?: Record<string, string | number>) => string,
): string | null {
  const minutes = Math.floor((new Date(now).getTime() - new Date(at).getTime()) / 60_000);
  if (minutes < 0) return null;
  if (minutes < 1) return t('audit.timeline.justNow');
  if (minutes < 60) return t('audit.timeline.minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  return hours < 6 ? t('audit.timeline.hoursAgo', { count: hours }) : null;
}
