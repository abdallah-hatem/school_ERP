import { LANGUAGES, SETTING_DEFAULTS, type ErrorParams, type Language } from '@school-erp/shared';
import ar from '@school-erp/shared/locales/ar/errors.json';
import en from '@school-erp/shared/locales/en/errors.json';

/**
 * Server-side messages. The error `message` in the envelope is translated from
 * `packages/shared/locales/<lang>/errors.json` by the stable code, so the same code reads in
 * Arabic or English depending on `Accept-Language`. Pure: no request, no injection.
 */
/** A message, or its plural forms (`zero`, `one`, `two`, `few`, `many`, `other`) picked by `count`. */
type Message = string | Readonly<Record<string, string>>;

const ERROR_MESSAGES: Record<Language, Record<string, Message>> = { en, ar };

const PLURAL_RULES: Record<Language, Intl.PluralRules> = {
  en: new Intl.PluralRules('en'),
  ar: new Intl.PluralRules('ar'),
};

export const FALLBACK_LANGUAGE: Language = SETTING_DEFAULTS['school.defaultLanguage'];

/**
 * The first supported language in an `Accept-Language` header, by q-weight, e.g.
 * `en-US,en;q=0.9` → `en`, `ar-EG` → `ar`. Falls back to the school's default (Arabic).
 */
export function resolveLanguage(header: string | string[] | undefined): Language {
  const raw = Array.isArray(header) ? header.join(',') : header;
  if (!raw) return FALLBACK_LANGUAGE;

  const ranked = raw
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const weight = q ? Number(q.slice(2)) : 1;
      return { lang: tag.trim().toLowerCase().split('-')[0] ?? '', weight, index };
    })
    .filter((x) => x.lang && Number.isFinite(x.weight) && x.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);

  const match = ranked.find((x) => (LANGUAGES as readonly string[]).includes(x.lang));
  return match ? (match.lang as Language) : FALLBACK_LANGUAGE;
}

/**
 * The translated message for an error code, or `undefined` when the code has none. `params` fill
 * its `{name}` slots; a message with plural forms picks the form for `params.count` by the
 * language's plural rules (Arabic: "دقيقتين", "3 دقائق", "15 دقيقة"), like the web app's `t()`.
 */
export function translateError(
  code: string,
  lang: Language,
  params?: ErrorParams,
): string | undefined {
  const message = ERROR_MESSAGES[lang][code];
  if (message === undefined) return undefined;
  let template: string | undefined;
  if (typeof message === 'string') template = message;
  else {
    const count = typeof params?.count === 'number' ? params.count : Number(params?.count);
    const form = Number.isFinite(count) ? PLURAL_RULES[lang].select(count) : 'other';
    template = message[form] ?? message.other;
  }
  if (template === undefined) return undefined;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (slot, name: string) =>
    name in params ? paramText(params[name], lang) : slot,
  );
}

/** Same as the web app's `formatDate`: `19 Nov 2026` / `19 نوفمبر 2026` (Latin digits). */
const DATE_FORMAT: Record<Language, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }),
  ar: new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }),
};

/** Same as the web app's `formatMonth`: `November 2026` / `نوفمبر 2026` (Latin digits). */
const MONTH_FORMAT: Record<Language, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
  ar: new Intl.DateTimeFormat('ar-EG-u-nu-latn', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
};

/**
 * A param as the message shows it: an ISO date (`2026-11-19`) as a date in `lang`, a month
 * (`2026-11`) as the month's name and year, else as is.
 */
function paramText(value: string | number, lang: Language): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return DATE_FORMAT[lang].format(new Date(`${value}T00:00:00Z`));
  }
  if (typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    return MONTH_FORMAT[lang].format(new Date(`${value}-01T00:00:00Z`));
  }
  return String(value);
}
