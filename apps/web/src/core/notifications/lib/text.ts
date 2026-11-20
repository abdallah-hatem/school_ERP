import {
  isMonth,
  SCREENS,
  type IsoDate,
  type IsoDateTime,
  type NotificationItem,
  type NotificationItemEntry,
  type NotificationLink,
  type NotificationName,
} from '@school-erp/shared';
import { addDays, formatSchoolTime, formatShortDay, schoolDay } from '@/core/audit/lib/time';
import { formatMoney, formatMoneyText, formatMonth } from '@/shared/lib/format';
import type { Locale, Translate, TranslateValues } from '@/shared/lib/i18n';

/*
 * A notification as words (spec N3): the API sends the type key and the values, never a sentence.
 * The sentence is drawn here in the reader's language from `notifications.types.<type>` — a single
 * item reads as itself (title + body), two or more as their group (N17). Names come as `{ en, ar }`
 * snapshots, months as `YYYY-MM`, dates as `YYYY-MM-DD`, money in piastres.
 */

type Params = Readonly<Record<string, unknown>>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A `{ en, ar }` name in the reader's language (the other one when it is empty). */
export function nameOf(value: unknown, locale: Locale): string | null {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return null;
  const { en, ar } = value as Partial<NotificationName>;
  const mine = locale === 'ar' ? ar : en;
  const other = locale === 'ar' ? en : ar;
  return (typeof mine === 'string' && mine) || (typeof other === 'string' && other) || null;
}

const LONG_DATE: Record<Locale, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }),
  ar: new Intl.DateTimeFormat('ar-EG-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }),
};

/** `2026-12-31` → `31 December 2026` / `31 ديسمبر 2026` — a date inside a sentence. */
export function sentenceDate(date: IsoDate, locale: Locale): string {
  return LONG_DATE[locale].format(new Date(`${date}T12:00:00Z`));
}

/** Money in a sentence with its label on the left, as `<Money>` draws it: `EGP 14,000.00` / `14,000.00 ج.م`. */
function sentenceMoney(piastres: number, locale: Locale, t?: Translate): string {
  return t ? formatMoneyText(piastres, locale, t('ui.units.currency')) : formatMoney(piastres);
}

/** Params holding text someone typed, isolated (FSI … PDI) inside the sentence. */
const FREE_TEXT_PARAMS = new Set(['reason']);

/** The values a sentence fills in, each shown the way the screens show it. */
export function sentenceValues(params: Params, locale: Locale, t?: Translate): TranslateValues {
  const out: TranslateValues = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'number') out[key] = key === 'net' ? sentenceMoney(value, locale, t) : value;
    else if (typeof value === 'string') {
      if (key === 'month' && isMonth(value)) out[key] = formatMonth(value, locale);
      else if (ISO_DATE.test(value)) out[key] = sentenceDate(value, locale);
      // Free text someone typed (a return reason) keeps its own direction inside the sentence:
      // a Latin reason in an Arabic line, or the reverse, never drags the punctuation around it.
      else if (FREE_TEXT_PARAMS.has(key)) out[key] = `\u2068${value}\u2069`;
      else out[key] = value;
    } else {
      const name = nameOf(value, locale);
      if (name !== null) out[key] = name;
    }
  }
  return out;
}

const typePath = (type: string) => `notifications.types.${type}`;

/** Days from the school's today to `date` (`YYYY-MM-DD`); 0 on the day itself. */
export function daysUntil(date: IsoDate, now: IsoDateTime): number {
  const today = schoolDay(now);
  const ms = Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** "in 7 days" for an item with a date (contract, probation): the values' `date`, else `days`. */
function daysLeft(params: Params, now: IsoDateTime): number | null {
  if (typeof params.date === 'string' && ISO_DATE.test(params.date)) return Math.max(0, daysUntil(params.date, now));
  return typeof params.days === 'number' ? params.days : null;
}

interface TextDeps {
  t: Translate;
  has: (key: string) => boolean;
  locale: Locale;
  /** The moment the list was drawn (school time): "in 7 days" counts from it. */
  now: IsoDateTime;
}

/** One item's own line under its title: the type's body, filled in. */
export function itemBody(type: string, params: Params, { t, has, locale, now }: TextDeps): string | null {
  const values = sentenceValues(params, locale, t);
  switch (type) {
    case 'hr.payroll.ready_to_approve': {
      if (typeof params.count !== 'number') return null;
      // The net only reaches a reader who may see the run's totals (N2): without it, no net.
      const key = typeof params.net === 'number' ? 'body' : 'bodyWithoutNet';
      return t(`${typePath(type)}.${key}`, { ...values, count: params.count });
    }
    case 'hr.contract.ending_soon': {
      const days = daysLeft(params, now);
      return days === null ? null : t(`${typePath(type)}.body`, { ...values, count: days });
    }
    case 'hr.probation.ending_soon': {
      const days = daysLeft(params, now);
      return days === null ? null : t('notifications.screen.inDays', { count: days });
    }
    default:
      return has(`${typePath(type)}.body`) ? t(`${typePath(type)}.body`, values) : null;
  }
}

/** One item's title (also a group's item line when it isn't about one employee). */
export function itemTitle(type: string, params: Params, { t, has, locale }: TextDeps): string {
  return has(`${typePath(type)}.title`) ? t(`${typePath(type)}.title`, sentenceValues(params, locale, t)) : t('notifications.title');
}

/**
 * The line under a group's title: "All on 31 December 2026" when every item shares one date,
 * else the first names and "and 1 more" ("Omar Khalil, Salma Nabil and 1 more").
 */
function groupBody(items: readonly NotificationItemEntry[], { t, locale }: TextDeps): string | null {
  const dates = new Set(items.map((i) => i.params.date));
  const [date] = dates;
  if (dates.size === 1 && typeof date === 'string' && ISO_DATE.test(date)) {
    return t('notifications.screen.allOn', { date: sentenceDate(date, locale) });
  }
  const names = items.map((i) => nameOf(i.params.employee, locale)).filter((n): n is string => !!n);
  if (names.length === 0) return null;
  const shown = names.slice(0, 2).join(locale === 'ar' ? '، ' : ', ');
  const rest = items.length - Math.min(names.length, 2);
  return rest > 0 ? `${shown} ${t('notifications.screen.andMore', { count: rest })}` : shown;
}

/**
 * The notification as it reads in the bell: its title and the line under it. A group counts what
 * still waits (`openCount`: "2 penalties waiting for your approval" once one of three is approved),
 * names those, and lists the handled ones struck through when opened; with nothing left it reads
 * "3 penalties — all handled".
 */
export function notificationText(n: NotificationItem, deps: TextDeps): { title: string; body: string | null } {
  const first = n.items[0];
  if (n.items.length > 1) {
    const open = n.items.filter((i) => !i.resolved);
    const values = sentenceValues(first?.params ?? {}, deps.locale, deps.t);
    const waiting = n.openCount > 0;
    const key = waiting ? 'group' : 'groupDone';
    const title = deps.has(`${typePath(n.type)}.${key}`)
      ? deps.t(`${typePath(n.type)}.${key}`, { ...values, count: waiting ? n.openCount : n.items.length })
      : deps.t('notifications.title');
    return { title, body: groupBody(waiting && open.length > 0 ? open : n.items, deps) };
  }
  // A single item: its own values (the notification's carry the group's `count`).
  const params = first?.params ?? n.params;
  return { title: itemTitle(n.type, params, deps), body: itemBody(n.type, params, deps) };
}

/** One item inside an open group: who it is about (or its title) and its detail. */
export function groupItemText(type: string, item: NotificationItemEntry, deps: TextDeps): { main: string; detail: string | null } {
  const { params } = item;
  const employee = nameOf(params.employee, deps.locale);
  if (!employee) return { main: itemTitle(type, params, deps), detail: null };
  const violation = nameOf(params.violation, deps.locale);
  if (violation) {
    return { main: employee, detail: deps.t('notifications.screen.violationLevel', { violation, level: String(params.level ?? '') }) };
  }
  if (typeof params.date === 'string' && ISO_DATE.test(params.date)) {
    return { main: employee, detail: formatShortDay(params.date, deps.locale) };
  }
  return { main: employee, detail: itemBody(type, params, deps) };
}

/**
 * "Approved by Laila Hassan", "Cancelled by …", "Done" — how an item or a notification ended. A
 * group (its `items`) reads like one item when one person handled every item the same way
 * ("Approved by Laila Hassan"), else "All done".
 */
export function resolvedText(
  resolved: NonNullable<NotificationItem['resolved']>,
  { t, locale }: Pick<TextDeps, 't' | 'locale'>,
  items?: readonly NotificationItemEntry[],
): string {
  if (items) {
    const [one, ...rest] = items.map((i) => i.resolved);
    const by = one?.resolution !== 'done' ? one?.by : null;
    const same = !!by && rest.every((e) => e?.resolution === one?.resolution && e?.by?.en === by.en && e?.by?.ar === by.ar);
    const name = same && by ? nameOf(by, locale) : null;
    return name && one ? t(`notifications.resolved.group.${one.resolution}`, { name }) : t('notifications.resolved.allDone');
  }
  const name = resolved.by ? nameOf(resolved.by, locale) : null;
  if (resolved.resolution === 'done' || !name) return t('notifications.resolved.done');
  return t(`notifications.resolved.${resolved.resolution}`, { name });
}

/**
 * When it happened, the way the bell says it (school time zone): "3 min ago", "1 h ago",
 * "Today, 07:00", "Yesterday, 07:00", "16 Nov, 10:42".
 */
export function whenText(at: IsoDateTime, now: IsoDateTime, { t, locale }: Pick<TextDeps, 't' | 'locale'>): string {
  const minutes = Math.floor((Date.parse(now) - Date.parse(at)) / 60_000);
  if (minutes >= 0 && minutes < 1) return t('notifications.screen.time.justNow');
  if (minutes >= 1 && minutes < 60) return t('notifications.screen.time.minutesAgo', { count: minutes });
  if (minutes >= 60 && minutes < 6 * 60) return t('notifications.screen.time.hoursAgo', { count: Math.floor(minutes / 60) });
  const day = schoolDay(at);
  const today = schoolDay(now);
  const time = formatSchoolTime(at, locale);
  if (day === today) return t('notifications.screen.time.today', { time });
  if (day === addDays(today, -1)) return t('notifications.screen.time.yesterday', { time });
  return t('notifications.screen.time.earlier', { date: formatShortDay(day, locale), time });
}

/**
 * The page a link opens (`SCREENS` path with the record's id and the query), in the screen's
 * language; null when the screen needs a record the link doesn't name.
 */
export function linkHref(link: NotificationLink | null, locale: Locale): string | null {
  if (!link) return null;
  const screen = (SCREENS as Record<string, { path: string } | undefined>)[link.screen];
  if (!screen) return null;
  let path = screen.path;
  if (path.includes(':id')) {
    if (!link.recordId) return null;
    path = path.replace(':id', encodeURIComponent(link.recordId));
  }
  if (path.includes(':')) return null;
  const query = new URLSearchParams(link.query ?? {}).toString();
  return `/${locale}${path}${query ? `?${query}` : ''}`;
}

/** "99+" past `max`, the number itself below it. */
export function badgeText(count: number, max: number): string {
  return count > max ? `${max}+` : String(count);
}
