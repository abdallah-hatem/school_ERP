import ar from '@school-erp/shared/locales/ar/contracts.json';
import arTemplates from '@school-erp/shared/locales/ar/contract-templates.json';
import arErrors from '@school-erp/shared/locales/ar/errors.json';
import en from '@school-erp/shared/locales/en/contracts.json';
import enTemplates from '@school-erp/shared/locales/en/contract-templates.json';
import enErrors from '@school-erp/shared/locales/en/errors.json';
import type { ReactNode } from 'react';
import type { Locale, MessageTree } from '@/shared/lib/i18n';
import { I18nProvider } from '@/shared/providers/i18n-provider';

const MESSAGES: Record<Locale, MessageTree> = {
  // The print dialog and the printed copies read the contract templates' words too.
  en: { contracts: en, contractTemplates: enTemplates, errors: enErrors },
  ar: { contracts: ar, contractTemplates: arTemplates, errors: arErrors },
};

/** The `contracts` namespace plus the shared `errors` (API codes → their translated message). */
export function contractsMessages(locale: Locale): MessageTree {
  return MESSAGES[locale];
}

/** Wraps a contracts screen so `t('contracts.…')` and `t('errors.…')` resolve. */
export function ContractsI18n({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <I18nProvider messages={contractsMessages(locale)}>{children}</I18nProvider>;
}
