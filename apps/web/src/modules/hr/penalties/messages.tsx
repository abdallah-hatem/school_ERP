import ar from '@school-erp/shared/locales/ar/penalties.json';
import arErrors from '@school-erp/shared/locales/ar/errors.json';
import en from '@school-erp/shared/locales/en/penalties.json';
import enErrors from '@school-erp/shared/locales/en/errors.json';
import type { ReactNode } from 'react';
import type { Locale, MessageTree } from '@/shared/lib/i18n';
import { I18nProvider } from '@/shared/providers/i18n-provider';

const MESSAGES: Record<Locale, MessageTree> = {
  en: { penalties: en, errors: enErrors },
  ar: { penalties: ar, errors: arErrors },
};

/** The `penalties` namespace plus the shared `errors` (API codes → their translated message). */
export function penaltiesMessages(locale: Locale): MessageTree {
  return MESSAGES[locale];
}

/** Wraps a penalties screen so `t('penalties.…')` and `t('errors.…')` resolve. */
export function PenaltiesI18n({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <I18nProvider messages={penaltiesMessages(locale)}>{children}</I18nProvider>;
}
