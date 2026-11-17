import ar from '@school-erp/shared/locales/ar/auth.json';
import en from '@school-erp/shared/locales/en/auth.json';
import type { Locale } from '@/shared/lib/i18n';

export type AuthMessages = typeof en;

const AUTH: Record<Locale, AuthMessages> = { en, ar };

/** The `auth` namespace (sign-in page) for a locale. */
export function getAuthMessages(locale: Locale): AuthMessages {
  return AUTH[locale];
}
