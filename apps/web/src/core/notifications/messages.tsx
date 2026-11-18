import ar from '@school-erp/shared/locales/ar/notifications.json';
import arErrors from '@school-erp/shared/locales/ar/errors.json';
import en from '@school-erp/shared/locales/en/notifications.json';
import enErrors from '@school-erp/shared/locales/en/errors.json';
import type { ReactNode } from 'react';
import type { Locale, MessageTree } from '@/shared/lib/i18n';
import { I18nProvider } from '@/shared/providers/i18n-provider';

const MESSAGES: Record<Locale, MessageTree> = {
  en: { notifications: en, errors: enErrors } as unknown as MessageTree,
  ar: { notifications: ar, errors: arErrors } as unknown as MessageTree,
};

/** The `notifications` namespace: each type's texts (N3) and the bell's and preferences' copy. */
export function notificationMessages(locale: Locale): MessageTree {
  return MESSAGES[locale];
}

/** Wraps the bell, a preferences list or the Settings section so `t('notifications.…')` resolves. */
export function NotificationsI18n({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <I18nProvider messages={MESSAGES[locale]}>{children}</I18nProvider>;
}
