import ar from '@school-erp/shared/locales/ar/access.json';
import arAuth from '@school-erp/shared/locales/ar/auth.json';
import arErrors from '@school-erp/shared/locales/ar/errors.json';
import arPermissions from '@school-erp/shared/locales/ar/permissions.json';
import en from '@school-erp/shared/locales/en/access.json';
import enAuth from '@school-erp/shared/locales/en/auth.json';
import enErrors from '@school-erp/shared/locales/en/errors.json';
import enPermissions from '@school-erp/shared/locales/en/permissions.json';
import type { ReactNode } from 'react';
import type { Locale, MessageTree } from '@/shared/lib/i18n';
import { I18nProvider } from '@/shared/providers/i18n-provider';

const MESSAGES: Record<Locale, MessageTree> = {
  en: { access: en, auth: enAuth, errors: enErrors, permissions: enPermissions } as unknown as MessageTree,
  ar: { access: ar, auth: arAuth, errors: arErrors, permissions: arPermissions } as unknown as MessageTree,
};

/**
 * Users, Roles and My account: the `access` namespace, plus `permissions` (each key's label and
 * description, the scopes), `auth` (the password fields) and the shared `errors` (API error codes),
 * merged on top of `common` and `ui`.
 */
export function AccessI18n({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <I18nProvider messages={MESSAGES[locale]}>{children}</I18nProvider>;
}
