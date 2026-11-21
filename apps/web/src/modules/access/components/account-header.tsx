'use client';

import { usePathname } from 'next/navigation';
import { PageHeader } from '@/shared/components/layout/page-header';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { AccountTabs } from './account-tabs';

/**
 * My account's header and tabs, drawn once by the account layout: switching Profile ↔
 * Notifications renders only the tab (its own `loading.tsx`); the header and the tab bar stay the
 * same nodes. The description follows the open tab.
 */
export function AccountHeader() {
  const { t, locale } = useTranslation();
  const notifications = (usePathname() ?? '').startsWith(`/${locale}/account/notifications`);
  return (
    <>
      <PageHeader
        title={t('access.account.title')}
        description={t(notifications ? 'access.account.notificationsDescription' : 'access.account.description')}
      />
      <AccountTabs />
    </>
  );
}
