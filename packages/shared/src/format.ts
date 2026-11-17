import type { Language } from './enums';
import type { Days, Piastres } from './types/common';

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
