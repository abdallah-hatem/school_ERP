import { LANGUAGES, SETTING_DEFAULTS, type Language } from '@school-erp/shared';
import ar from '@school-erp/shared/locales/ar/errors.json';
import en from '@school-erp/shared/locales/en/errors.json';

/**
 * Server-side messages. The error `message` in the envelope is translated from
 * `packages/shared/locales/<lang>/errors.json` by the stable code, so the same code reads in
 * Arabic or English depending on `Accept-Language`. Pure: no request, no injection.
 */
const ERROR_MESSAGES: Record<Language, Record<string, string>> = { en, ar };

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

/** The translated message for an error code, or `undefined` when the code has none. */
export function translateError(code: string, lang: Language): string | undefined {
  return ERROR_MESSAGES[lang][code];
}
