import { LANGUAGES, type Language } from '@school-erp/shared';
import ar from '@school-erp/shared/locales/ar/common.json';
import arUi from '@school-erp/shared/locales/ar/ui.json';
import en from '@school-erp/shared/locales/en/common.json';
import enUi from '@school-erp/shared/locales/en/ui.json';

export type Locale = Language;
export const LOCALES: readonly Locale[] = LANGUAGES;
/** Arabic is the default for this deployment (spec); the school setting overrides it later (T4). */
export const DEFAULT_LOCALE: Locale = 'en';
/** The language switch writes it; the proxy uses it to pick a locale for paths without one. */
export const LOCALE_COOKIE = 'lang';

export type CommonMessages = typeof en;
export type UiMessages = typeof enUi;

const COMMON: Record<Locale, CommonMessages> = { en, ar };
const UI: Record<Locale, UiMessages> = { en: enUi, ar: arUi };

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/** The name of a record in the screen's language (`nameAr` in Arabic), falling back to the other. */
export function nameIn(names: { nameEn: string; nameAr: string }, locale: Locale): string {
  return locale === 'ar' ? names.nameAr || names.nameEn : names.nameEn || names.nameAr;
}

export function dirFor(locale: Locale): 'rtl' | 'ltr' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

/** The name of a record (`{ nameEn, nameAr }`) in the screen's language. */
export function localName(names: { nameEn: string; nameAr: string }, locale: Locale): string {
  return locale === 'ar' ? names.nameAr : names.nameEn;
}

/** The name in the other language — shown quietly under the main one. */
export function otherName(names: { nameEn: string; nameAr: string }, locale: Locale): string {
  return locale === 'ar' ? names.nameEn : names.nameAr;
}

/** The shared `common` namespace for a locale. Modules add their own namespaces (T3+). */
export function getCommonMessages(locale: Locale): CommonMessages {
  return COMMON[locale];
}

/** A tree of translated strings, keyed by namespace at the top (`common`, `ui`, `hr`…). */
export interface MessageTree {
  [key: string]: string | MessageTree;
}

/** The namespaces every screen gets: `common` and the shell/UI kit's `ui`. */
export function getBaseMessages(locale: Locale): MessageTree {
  return { common: COMMON[locale], ui: UI[locale] } as unknown as MessageTree;
}

export type TranslateValues = Record<string, string | number>;
export type Translate = (key: string, values?: TranslateValues) => string;

function node(tree: MessageTree, key: string): string | MessageTree | undefined {
  let current: string | MessageTree | undefined = tree;
  for (const part of key.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = current[part];
  }
  return current;
}

/** A message with plural forms: `{ one, other }` and, for Arabic, `zero`, `two`, `few`, `many`. */
function isPlural(value: string | MessageTree | undefined): value is MessageTree & { other: string } {
  return typeof value === 'object' && value !== null && typeof value.other === 'string';
}

/** Whether `key` names a message (a string, or plural forms) in `messages`. */
export function hasMessage(messages: MessageTree, key: string): boolean {
  const found = node(messages, key);
  return typeof found === 'string' || isPlural(found);
}

const PLURAL_RULES: Record<Locale, Intl.PluralRules> = {
  en: new Intl.PluralRules('en'),
  ar: new Intl.PluralRules('ar'),
};

/** `count` as a number, also when the caller passed it grouped for display (`"1,284"`). */
function countOf(value: string | number | undefined): number | null {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;
  const n = Number(value.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * `t('ui.table.showing', { from: 1, to: 10, total: 14 })`. A message with plural forms
 * (`{ "one": "{count} entry", "other": "{count} entries" }`, plus `zero` / `two` / `few` / `many`
 * for Arabic) picks the form for `values.count` by the locale's plural rules. A missing key renders
 * the key itself, so a gap is visible on screen instead of silently blank.
 */
export function createTranslator(messages: MessageTree, locale: Locale = 'en'): Translate {
  return (key, values) => {
    const found = node(messages, key);
    let template = key;
    if (typeof found === 'string') template = found;
    else if (isPlural(found)) {
      const count = countOf(values?.count);
      const chosen = count === null ? undefined : found[PLURAL_RULES[locale].select(count)];
      template = typeof chosen === 'string' ? chosen : found.other;
    }
    if (!values) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in values ? String(values[name]) : match,
    );
  };
}

/** Deep merge for nested providers (a module adds its namespace on top of the base ones). */
export function mergeMessages(base: MessageTree, extra: MessageTree): MessageTree {
  const out: MessageTree = { ...base };
  for (const [k, v] of Object.entries(extra)) {
    const prev = out[k];
    out[k] =
      typeof v === 'object' && typeof prev === 'object' ? mergeMessages(prev, v) : v;
  }
  return out;
}

/** Same path in the other language: `/ar/payroll?month=2026-11` → `/en/payroll?month=2026-11`. */
export function swapLocaleInPath(pathname: string, locale: Locale): string {
  const parts = pathname.split('/');
  if (parts[1] && isLocale(parts[1])) parts[1] = locale;
  else parts.splice(1, 0, locale);
  const joined = parts.join('/');
  return joined.endsWith('/') && joined.length > 1 ? joined.slice(0, -1) : joined;
}

/** The locale segment of a path or URL (`/en/payroll` → `en`), or `null` when there is none. */
export function localeFromPath(pathOrUrl: string | null | undefined): Locale | null {
  if (!pathOrUrl) return null;
  let pathname = pathOrUrl;
  if (/^https?:\/\//i.test(pathOrUrl)) {
    try {
      pathname = new URL(pathOrUrl).pathname;
    } catch {
      return null;
    }
  }
  const first = pathname.split(/[/?#]/)[1] ?? '';
  return isLocale(first) ? first : null;
}

/**
 * The language a server request runs under — the page's `[locale]` segment, so API messages match
 * the screen even when the `lang` cookie says otherwise (another tab switched it). Order: the page
 * path the proxy forwards (`x-pathname`, set for renders and Server Actions), the referer, then the
 * cookie, then the default.
 */
export function requestLocale(source: {
  pathname?: string | null;
  referer?: string | null;
  cookie?: string | null;
}): Locale {
  return (
    localeFromPath(source.pathname) ??
    localeFromPath(source.referer) ??
    (source.cookie && isLocale(source.cookie) ? source.cookie : DEFAULT_LOCALE)
  );
}
