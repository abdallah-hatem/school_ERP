'use client';

import type { NotificationPreferences } from '@school-erp/shared';
import { NotificationPreferencesView } from '@/core/notifications';
import { PageHeader } from '@/shared/components/layout/page-header';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { AccountTabs } from './account-tabs';

/** My account → Notifications (§11, option A): one switch per kind of notification the person gets. */
export function AccountNotificationsView({ preferences }: { preferences: NotificationPreferences }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('access.account.title')} description={t('access.account.notificationsDescription')} />
      <AccountTabs />
      <NotificationPreferencesView initial={preferences} />
    </div>
  );
}
