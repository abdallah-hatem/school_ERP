import ar from '@school-erp/shared/locales/ar/employees.json';
import arErrors from '@school-erp/shared/locales/ar/errors.json';
import en from '@school-erp/shared/locales/en/employees.json';
import enErrors from '@school-erp/shared/locales/en/errors.json';
import type { ReactNode } from 'react';
import type { Locale, MessageTree } from '@/shared/lib/i18n';
import { I18nProvider } from '@/shared/providers/i18n-provider';

const MESSAGES: Record<Locale, MessageTree> = {
  en: { employees: en, errors: enErrors },
  ar: { employees: ar, errors: arErrors },
};

/**
 * The `employees` namespace for `locale`, plus the shared `errors` (API error codes, so a server
 * rule error shows under its field in the screen's language), merged on top of `common` and `ui`.
 */
export function employeesMessages(locale: Locale): MessageTree {
  return MESSAGES[locale];
}

/** Wraps an employees screen so `t('employees.…')` resolves. */
export function EmployeesI18n({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <I18nProvider messages={employeesMessages(locale)}>{children}</I18nProvider>;
}
