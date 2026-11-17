import { dirFor, LOCALE_COOKIE, type Locale } from './i18n';

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Browser only. Flips `lang` and `dir` on <html> at once (before the router re-renders) and stores
 * the choice in the `lang` cookie that `apiFetch` sends as `Accept-Language`.
 */
export function applyDocumentLocale(locale: Locale): void {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
  document.documentElement.lang = locale;
  document.documentElement.dir = dirFor(locale);
}
