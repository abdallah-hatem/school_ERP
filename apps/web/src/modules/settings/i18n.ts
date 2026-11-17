import ar from '@school-erp/shared/locales/ar/settings.json';
import en from '@school-erp/shared/locales/en/settings.json';
import type { Locale } from '@/shared/lib/i18n';

export type SettingsMessages = typeof en;

const SETTINGS: Record<Locale, SettingsMessages> = { en, ar };

/** The `settings` namespace (the Settings screen) for a locale. */
export function getSettingsMessages(locale: Locale): SettingsMessages {
  return SETTINGS[locale];
}
