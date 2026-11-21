'use client';

import type { NotificationPreferences, PushDevices } from '@school-erp/shared';
import { NotificationPreferencesView } from '@/core/notifications';
import { DeviceAlerts } from '@/core/pwa';
import { PageHeader } from '@/shared/components/layout/page-header';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { AccountTabs } from './account-tabs';

/**
 * My account → Notifications (§11, option A): "Alerts on this device" and my devices (push,
 * 2026-11-21), then one switch per kind of notification the person gets.
 */
export function AccountNotificationsView({
  preferences,
  devices,
}: {
  preferences: NotificationPreferences;
  devices: PushDevices;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('access.account.title')} description={t('access.account.notificationsDescription')} />
      <AccountTabs />
      <DeviceAlerts initial={devices} />
      <NotificationPreferencesView initial={preferences} />
    </div>
  );
}
