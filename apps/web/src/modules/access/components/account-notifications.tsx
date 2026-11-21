'use client';

import type { NotificationPreferences, PushDevices } from '@school-erp/shared';
import { NotificationPreferencesView } from '@/core/notifications';
import { DeviceAlerts } from '@/core/pwa';

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
  return (
    <div className="flex flex-col gap-6">
      <DeviceAlerts initial={devices} />
      <NotificationPreferencesView initial={preferences} />
    </div>
  );
}
