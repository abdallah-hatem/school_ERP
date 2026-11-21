import type { Language } from './enums';
import { SCHOOL_TIME_ZONE } from './settings';
import type { Days, Piastres, TimeOfDay } from './types/common';

/*
 * Pure display formatters shared by the screens (and any future PDF/export on the API).
 * Integer arithmetic only: money is integer piastres (§6), so a float never touches the digits.
 * Digits are always Latin and grouped with commas, in both languages, so a figure reads the same
 * on the payslip, the table and the edit field.
 */

const PIASTRES_PER_POUND = 100;

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Integer piastres → `"14,000.00"` (no currency label; the UI adds it per language).
 * A non-integer input is rounded to the nearest piastre first, so drift can never show.
 */
export function formatMoney(piastres: Piastres): string {
  const whole = Math.round(piastres);
  const negative = whole < 0;
  const abs = Math.abs(whole);
  const pounds = Math.floor(abs / PIASTRES_PER_POUND);
  const rest = abs % PIASTRES_PER_POUND;
  const text = `${groupThousands(String(pounds))}.${String(rest).padStart(2, '0')}`;
  return negative ? `-${text}` : text;
}

/**
 * Text typed into a money field (`"14,000.5"`, `"1400"`) → integer piastres, or `null` when it
 * isn't a valid amount (letters, more than two decimals, empty). Parsed as text, never as a float.
 */
export function parseMoney(input: string): Piastres | null {
  const cleaned = input.replace(/[,\s]/g, '');
  const match = /^(-)?(\d+)(?:\.(\d{0,2}))?$/.exec(cleaned);
  if (!match) return null;
  const [, sign, pounds = '0', fraction = ''] = match;
  const value = Number(pounds) * PIASTRES_PER_POUND + Number(fraction.padEnd(2, '0'));
  return sign ? -value : value;
}

/** Day counts come in steps of 0.25 (§5): `1.25` → `"1.25"`, `0.5` → `"0.5"`, `2` → `"2"`. */
export function formatDays(days: Days): string {
  // Work in hundredths so 0.1 + 0.2 style float noise can't reach the output.
  const hundredths = Math.round(days * 100);
  const negative = hundredths < 0;
  const abs = Math.abs(hundredths);
  const whole = Math.floor(abs / 100);
  const fraction = String(abs % 100)
    .padStart(2, '0')
    .replace(/0+$/, '');
  const text = fraction ? `${groupThousands(String(whole))}.${fraction}` : groupThousands(String(whole));
  return negative ? `-${text}` : text;
}

/**
 * A day count with its noun, agreeing with the number (Western digits in both languages):
 * - English: `"1 day"`, `"0.5 day"`, `"2 days"`, `"1.25 days"`.
 * - Arabic: 1 → `"يوم واحد"`, 2 → `"يومان"`, 3–10 → `"3 أيام"`, 11–99 → `"11 يومًا"`, a fraction →
 *   `"0.5 يوم"`; from 100 the last two digits decide (`"100 يوم"`, `"103 أيام"`, `"111 يومًا"`).
 *
 * `case`: `'nominative'` (default) for a count that stands alone — a total, a column, "المدة: يومان";
 * `'oblique'` where it follows a verb or verbal noun such as خصم — "خصم يومين". Only the dual changes.
 */
export type DayCountCase = 'nominative' | 'oblique';

export function formatDayCount(
  days: Days,
  lang: Language,
  options: { case?: DayCountCase } = {},
): string {
  const number = formatDays(days);
  const abs = Math.abs(days);
  if (lang === 'en') return `${number} ${abs > 0 && abs <= 1 ? 'day' : 'days'}`;
  if (!Number.isInteger(abs)) return `${number} يوم`;
  if (abs === 1) return 'يوم واحد';
  if (abs === 2) return options.case === 'oblique' ? 'يومين' : 'يومان';
  const rest = abs >= 100 ? abs % 100 : abs;
  if (rest >= 3 && rest <= 10) return `${number} أيام`;
  if (rest >= 11) return `${number} يومًا`;
  return `${number} يوم`;
}

/*
 * Times of day — always 12-hour with the period: `4:07 PM` / `4:07 م`, `9:30 AM` / `9:30 ص`.
 * Never 24-hour on screen (owner, 2026-11-21); stored values (`HH:mm`, ISO instants) don't change.
 * Latin digits in both languages. The time and its period are joined by a no-break space so a
 * wrapping line never leaves "PM" on its own. The text is built here, not taken from the engine,
 * so it reads the same in Node and every browser (engines differ: "pm", a narrow space…).
 */

const NBSP = ' ';
const DATE_LOCALE: Record<Language, string> = { en: 'en-GB', ar: 'ar-EG-u-nu-latn' };
/** A date and its time, joined as each language lists: `17 Nov 2026, 4:07 PM` / `17 نوفمبر 2026، 4:07 م`. */
const DATE_TIME_JOIN: Record<Language, string> = { en: ', ', ar: '، ' };

const clockFormatters = new Map<string, Intl.DateTimeFormat>();

/** The 24-hour hour and minute of an instant on a zone's clock. */
function clockOf(at: Date, timeZone: string): { hour: number; minute: number } {
  let formatter = clockFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    clockFormatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { hour: get('hour') % 24, minute: get('minute') };
}

/** 24-hour `13`, `7` → `1:07 PM` / `1:07 م`; `0` → `12:… AM`, `12` → `12:… PM`. */
function twelveHour(hour24: number, minute: number, lang: Language): string {
  const hour = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const pm = hour24 >= 12;
  const period = lang === 'ar' ? (pm ? 'م' : 'ص') : pm ? 'PM' : 'AM';
  return `${hour}:${String(minute).padStart(2, '0')}${NBSP}${period}`;
}

/**
 * An instant's time of day on the school's clock (`SCHOOL_TIME_ZONE`, unless told otherwise):
 * `2026-11-20T14:07:00Z` → `4:07 PM` / `4:07 م` (Cairo, UTC+2).
 */
export function formatClockTime(at: Date | string, lang: Language, timeZone: string = SCHOOL_TIME_ZONE): string {
  const { hour, minute } = clockOf(new Date(at), timeZone);
  return twelveHour(hour, minute, lang);
}

/**
 * A date with its time on the school's clock (unless told otherwise): `17 Nov 2026, 4:07 PM` /
 * `17 نوفمبر 2026، 4:07 م`. `year: false` drops the year (`14 Nov, 10:30 AM`).
 */
export function formatClockDateTime(
  at: Date | string,
  lang: Language,
  options: { year?: boolean; timeZone?: string } = {},
): string {
  const timeZone = options.timeZone ?? SCHOOL_TIME_ZONE;
  const date = new Intl.DateTimeFormat(DATE_LOCALE[lang], {
    timeZone,
    day: 'numeric',
    month: 'short',
    year: options.year === false ? undefined : 'numeric',
  }).format(new Date(at));
  return `${date}${DATE_TIME_JOIN[lang]}${formatClockTime(at, lang, timeZone)}`;
}

/** A stored `HH:mm` time of day (no zone): `07:30` → `7:30 AM` / `7:30 ص`; `00:00` → `12:00 AM`. */
export function formatTimeOfDayText(time: TimeOfDay, lang: Language): string {
  const [h = 0, m = 0] = time.split(':').map(Number);
  return twelveHour(h % 24, m, lang);
}
