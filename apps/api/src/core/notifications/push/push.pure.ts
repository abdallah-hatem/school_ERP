import { createHash } from 'node:crypto';
import {
  appIconPath,
  isMonth,
  notificationLinkPath,
  PUSH_ENDPOINT_HASH_LENGTH,
  schoolDayOf,
  type Language,
  type NotificationItem,
  type NotificationName,
  type PushMessage,
} from '@school-erp/shared';
import ar from '@school-erp/shared/locales/ar/notifications.json';
import en from '@school-erp/shared/locales/en/notifications.json';

/*
 * Pure rules of push alerts (§11 → Push, owner 2026-11-21): what a device is, what its alert says,
 * and what a push service's answer means. No database, no network.
 */

type Tree = { [key: string]: string | Tree };
const MESSAGES: Record<Language, Tree> = { en, ar };
const PLURALS: Record<Language, Intl.PluralRules> = {
  en: new Intl.PluralRules('en'),
  ar: new Intl.PluralRules('ar'),
};

/**
 * Values never put in an alert: a lock screen is not the bell. Money of any kind (the payroll
 * month's net, owner 2026-11-21: "no salaries") and free text someone typed (a return reason).
 */
export const PUSH_HIDDEN_PARAMS: ReadonlySet<string> = new Set(['net', 'reason']);

// ── devices ────────────────────────────────────────────────────────────────

/** The browser and system a user agent names, for "Chrome on Android" (null: not recognised). */
export function deviceFrom(userAgent: string | null | undefined): {
  browser: string | null;
  os: string | null;
} {
  const ua = userAgent ?? '';
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /CrOS/.test(ua)
          ? 'ChromeOS'
          : /Mac OS X|Macintosh/.test(ua)
            ? 'macOS'
            : /Windows/.test(ua)
              ? 'Windows'
              : /Linux/.test(ua)
                ? 'Linux'
                : null;
  // Order matters: Edge and Opera say "Chrome" too, Chrome says "Safari" too.
  const browser = /Edg(e|A|iOS)?\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /SamsungBrowser\//.test(ua)
        ? 'Samsung Internet'
        : /Firefox\/|FxiOS\//.test(ua)
          ? 'Firefox'
          : /Chrome\/|CriOS\/|Chromium\//.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : null;
  return { browser, os };
}

/** "Chrome on Android" — the device as the audit log names it (English, like a user's name). */
export function deviceLabel(device: { browser: string | null; os: string | null }): string {
  return `${device.browser ?? 'A browser'} on ${device.os ?? 'a device'}`;
}

/** The SHA-256 of an endpoint, hex, cut short: how the browser recognises "This device". */
export function endpointHash(endpoint: string): string {
  return createHash('sha256').update(endpoint).digest('hex').slice(0, PUSH_ENDPOINT_HASH_LENGTH);
}

/**
 * What a push service's answer means for one device (RFC 8030): 2xx accepted; 404 / 410 the
 * subscription is gone (drop the device); 429 / 5xx try again later; anything else (400, 401, 403,
 * 413) a refusal that trying again won't fix — logged, the device kept.
 */
export function pushOutcome(status: number): 'sent' | 'gone' | 'retry' | 'refused' {
  if (status >= 200 && status < 300) return 'sent';
  if (status === 404 || status === 410) return 'gone';
  if (status === 429 || status >= 500) return 'retry';
  return 'refused';
}

// ── the alert's words ──────────────────────────────────────────────────────

function lookup(locale: Language, path: string): string | Tree | undefined {
  let node: string | Tree | undefined = MESSAGES[locale];
  for (const part of path.split('.')) {
    if (node === undefined || typeof node === 'string') return undefined;
    node = node[part];
  }
  return node;
}

/** `t()` as the web app's: `{name}` slots, plural forms picked by `count`. Undefined: no such text. */
export function pushText(
  locale: Language,
  path: string,
  values: Record<string, string | number> = {},
): string | undefined {
  const node = lookup(locale, path);
  let template: string | undefined;
  if (typeof node === 'string') template = node;
  else if (node && typeof values.count === 'number') {
    const form = node[PLURALS[locale].select(values.count)] ?? node.other;
    template = typeof form === 'string' ? form : undefined;
  }
  if (template === undefined) return undefined;
  return template.replace(/\{(\w+)\}/g, (slot, key: string) =>
    key in values ? String(values[key]) : slot,
  );
}

function nameOf(value: unknown, locale: Language): string | null {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return null;
  const { en: english, ar: arabic } = value as Partial<NotificationName>;
  const mine = locale === 'ar' ? arabic : english;
  const other = locale === 'ar' ? english : arabic;
  return (typeof mine === 'string' && mine) || (typeof other === 'string' && other) || null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const tz = (locale: Language) => (locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB');

function monthText(month: string, locale: Language): string {
  return new Intl.DateTimeFormat(tz(locale), {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}-15T12:00:00Z`));
}

function dateText(date: string, locale: Language): string {
  return new Intl.DateTimeFormat(tz(locale), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
}

function daysUntil(date: string, now: Date): number {
  const ms = Date.parse(`${date}T00:00:00Z`) - Date.parse(`${schoolDayOf(now)}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}

/** A sentence's values as the bell shows them — without money or typed text (`PUSH_HIDDEN_PARAMS`). */
export function pushValues(
  params: Readonly<Record<string, unknown>>,
  locale: Language,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) {
    if (PUSH_HIDDEN_PARAMS.has(key)) continue;
    if (typeof value === 'number') out[key] = value;
    else if (typeof value === 'string') {
      if (key === 'month' && isMonth(value)) out[key] = monthText(value, locale);
      else if (ISO_DATE.test(value)) out[key] = dateText(value, locale);
      else out[key] = value;
    } else {
      const name = nameOf(value, locale);
      if (name !== null) out[key] = name;
    }
  }
  return out;
}

const typePath = (type: string) => `types.${type}`;

/** One item's line under its title — the bell's, except a payroll month never shows its net. */
function itemBody(
  type: string,
  params: Readonly<Record<string, unknown>>,
  locale: Language,
  now: Date,
): string | null {
  const values = pushValues(params, locale);
  const dateDays =
    typeof params.date === 'string' && ISO_DATE.test(params.date)
      ? daysUntil(params.date, now)
      : typeof params.days === 'number'
        ? params.days
        : null;
  switch (type) {
    case 'hr.payroll.ready_to_approve':
      return typeof params.count === 'number'
        ? (pushText(locale, `${typePath(type)}.bodyWithoutNet`, { ...values, count: params.count }) ?? null)
        : null;
    case 'hr.payroll.returned_by_accounting':
      // Its body is the typed reason: left to the bell.
      return null;
    case 'hr.contract.ending_soon':
      return dateDays === null
        ? null
        : (pushText(locale, `${typePath(type)}.body`, { ...values, count: dateDays }) ?? null);
    case 'hr.probation.ending_soon':
      return dateDays === null ? null : (pushText(locale, 'screen.inDays', { count: dateDays }) ?? null);
    default: {
      const body = lookup(locale, `${typePath(type)}.body`);
      return typeof body === 'string' ? (pushText(locale, `${typePath(type)}.body`, values) ?? null) : null;
    }
  }
}

/** Under a group's title: "Omar Khalil, Salma Nabil and 1 more", or "All on 31 May 2027". */
function groupBody(view: NotificationItem, locale: Language): string | null {
  const open = view.items.filter((i) => !i.resolved);
  const items = open.length > 0 ? open : view.items;
  const dates = new Set(items.map((i) => i.params.date));
  const [date] = dates;
  if (dates.size === 1 && typeof date === 'string' && ISO_DATE.test(date)) {
    return pushText(locale, 'screen.allOn', { date: dateText(date, locale) }) ?? null;
  }
  const names = items
    .map((i) => nameOf(i.params.employee, locale))
    .filter((n): n is string => !!n);
  if (names.length === 0) return null;
  const shown = names.slice(0, 2).join(locale === 'ar' ? '، ' : ', ');
  const rest = items.length - Math.min(names.length, 2);
  return rest > 0 ? `${shown} ${pushText(locale, 'screen.andMore', { count: rest }) ?? ''}`.trim() : shown;
}

/**
 * The alert for a notification as its reader sees it now (`NotificationInbox`, N11) in the device's
 * language: the bell's title and line (a group counts what still waits), the page it opens — the
 * bell's link, a group's opens the home page with the bell —, the school's icon. Never money or a
 * typed reason (`PUSH_HIDDEN_PARAMS`).
 */
export function pushMessageFor(
  view: NotificationItem,
  locale: Language,
  opts: { logoUrl: string | null; now: Date },
): PushMessage {
  const first = view.items[0];
  let title: string;
  let body: string | null;
  if (view.items.length > 1) {
    const values = pushValues(first?.params ?? {}, locale);
    title =
      pushText(locale, `${typePath(view.type)}.group`, { ...values, count: view.openCount }) ??
      pushText(locale, 'title') ??
      '';
    body = groupBody(view, locale);
  } else {
    const params = first?.params ?? view.params;
    title =
      pushText(locale, `${typePath(view.type)}.title`, pushValues(params, locale)) ??
      pushText(locale, 'title') ??
      '';
    body = itemBody(view.type, params, locale, opts.now);
  }
  const link = view.items.length === 1 ? (first?.link ?? view.link) : null;
  return {
    title,
    body,
    url: notificationLinkPath(link, locale) ?? `/${locale}`,
    tag: `notification-${view.id}`,
    icon: appIconPath('icon-192.png', opts.logoUrl),
    badge: appIconPath('badge-96.png', opts.logoUrl),
    lang: locale,
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    timestamp: Date.parse(view.updatedAt),
  };
}

/**
 * The push service's topic for a notification (RFC 8030 §5.4: ≤ 32 URL-safe characters): an alert
 * still waiting on the service is replaced by the next one of the same notification.
 */
export function pushTopic(notificationId: string): string {
  return notificationId.replace(/-/g, '').slice(0, 32);
}
