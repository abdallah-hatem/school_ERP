import ar from '@school-erp/shared/locales/ar/contract-templates.json';
import arErrors from '@school-erp/shared/locales/ar/errors.json';
import en from '@school-erp/shared/locales/en/contract-templates.json';
import enErrors from '@school-erp/shared/locales/en/errors.json';
import type { ReactNode } from 'react';
import type { Locale, MessageTree } from '@/shared/lib/i18n';
import { I18nProvider } from '@/shared/providers/i18n-provider';

const MESSAGES: Record<Locale, MessageTree> = {
  en: { contractTemplates: en, errors: enErrors },
  ar: { contractTemplates: ar, errors: arErrors },
};

/** The `contractTemplates` namespace plus the shared `errors`. */
export function contractTemplatesMessages(locale: Locale): MessageTree {
  return MESSAGES[locale];
}

/** Wraps a contract-templates screen so `t('contractTemplates.…')` and `t('errors.…')` resolve. */
export function ContractTemplatesI18n({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <I18nProvider messages={MESSAGES[locale]}>{children}</I18nProvider>;
}

/** The field names in a given language, whatever the screen's (a document's chips and samples). */
export const FIELD_NAMES = { AR: ar.fields, EN: en.fields } as const;
