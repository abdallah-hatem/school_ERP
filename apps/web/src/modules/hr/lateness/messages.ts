import ar from '@school-erp/shared/locales/ar/lateness.json';
import en from '@school-erp/shared/locales/en/lateness.json';
import type { Locale, MessageTree } from '@/shared/lib/i18n';

const MESSAGES: Record<Locale, MessageTree> = {
  en: { lateness: en } as unknown as MessageTree,
  ar: { lateness: ar } as unknown as MessageTree,
};

/** The lateness namespace for a locale (screens and tests nest it over the base messages). */
export function latenessMessages(locale: Locale): MessageTree {
  return MESSAGES[locale];
}
