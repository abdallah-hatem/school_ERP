import ar from '@school-erp/shared/locales/ar/audit.json';
import en from '@school-erp/shared/locales/en/audit.json';
import type { ReactNode } from 'react';
import type { Locale, MessageTree } from '@/shared/lib/i18n';
import { I18nProvider } from '@/shared/providers/i18n-provider';

const MESSAGES: Record<Locale, MessageTree> = {
  en: { audit: en as unknown as MessageTree },
  ar: { audit: ar as unknown as MessageTree },
};

/** The `audit` namespace: action sentences, field labels and the timeline's copy (D5). */
export function auditMessages(locale: Locale): MessageTree {
  return MESSAGES[locale];
}

/** Wraps an activity screen (or a record's History tab) so `t('audit.…')` resolves. */
export function AuditI18n({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <I18nProvider messages={auditMessages(locale)}>{children}</I18nProvider>;
}
