import arErrors from '@school-erp/shared/locales/ar/errors.json';
import arLateness from '@school-erp/shared/locales/ar/lateness.json';
import ar from '@school-erp/shared/locales/ar/payroll.json';
import enErrors from '@school-erp/shared/locales/en/errors.json';
import enLateness from '@school-erp/shared/locales/en/lateness.json';
import en from '@school-erp/shared/locales/en/payroll.json';
import type { ReactNode } from 'react';
import type { Locale, MessageTree } from '@/shared/lib/i18n';
import { I18nProvider } from '@/shared/providers/i18n-provider';

/** `payroll`, plus `lateness` (the rule text in the rules panel) and the API `errors`. */
const MESSAGES: Record<Locale, MessageTree> = {
  en: {
    payroll: en,
    lateness: enLateness,
    errors: enErrors,
  } as unknown as MessageTree,
  ar: {
    payroll: ar,
    lateness: arLateness,
    errors: arErrors,
  } as unknown as MessageTree,
};

export function payrollMessages(locale: Locale): MessageTree {
  return MESSAGES[locale];
}

/** Wraps a payroll screen (or the profile's payroll tab) so `t('payroll.…')` resolves. */
export function PayrollI18n({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <I18nProvider messages={payrollMessages(locale)}>{children}</I18nProvider>;
}
