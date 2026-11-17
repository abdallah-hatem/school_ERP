import { LANGUAGES, type Language } from '@school-erp/shared';
import ar from '@school-erp/shared/locales/ar/common.json';
import en from '@school-erp/shared/locales/en/common.json';

export type Locale = Language;
export const LOCALES: readonly Locale[] = LANGUAGES;
/** Arabic is the default for this deployment (spec); the school setting overrides it later (T4). */
export const DEFAULT_LOCALE: Locale = 'ar';

export type CommonMessages = typeof en;

const COMMON: Record<Locale, CommonMessages> = { en, ar };

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export function dirFor(locale: Locale): 'rtl' | 'ltr' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

/** The shared `common` namespace for a locale. Modules add their own namespaces (T3+). */
export function getCommonMessages(locale: Locale): CommonMessages {
  return COMMON[locale];
}
