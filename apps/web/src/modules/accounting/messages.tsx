import ar from '@school-erp/shared/locales/ar/accounting.json';
import arErrors from '@school-erp/shared/locales/ar/errors.json';
import en from '@school-erp/shared/locales/en/accounting.json';
import enErrors from '@school-erp/shared/locales/en/errors.json';
import type { ReactNode } from 'react';
import type { Locale, MessageTree } from '@/shared/lib/i18n';
import { I18nProvider } from '@/shared/providers/i18n-provider';

/** `accounting`, plus the API `errors`. */
const MESSAGES: Record<Locale, MessageTree> = {
  en: { accounting: en, errors: enErrors } as unknown as MessageTree,
  ar: { accounting: ar, errors: arErrors } as unknown as MessageTree,
};

export function accountingMessages(locale: Locale): MessageTree {
  return MESSAGES[locale];
}

/** Wraps an accounting screen (or its skeleton) so `t('accounting.…')` resolves. */
export function AccountingI18n({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <I18nProvider messages={accountingMessages(locale)}>{children}</I18nProvider>;
}
