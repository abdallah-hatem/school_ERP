'use client';

import {
  NOTIFICATION_TYPE_KEYS,
  NOTIFICATION_TYPES,
  type NotificationChannel,
  type NotificationPreferences,
} from '@school-erp/shared';
import { useRef, useState } from 'react';
import { useCan } from '@/core/auth';
import { callApi } from '@/lib/callApi';
import { EmptyState } from '@/shared/components/layout/empty-state';
import { NotificationsIcon } from '@/shared/components/ui/icons';
import { SkeletonMask } from '@/shared/components/ui/skeleton';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { UPDATE_NOTIFICATION_PREFERENCES } from '../apis';
import { TypeSwitchList, type TypeSwitchRow } from './type-switch-list';

const IN_APP: NotificationChannel = 'in_app';

type TypeEntry = NotificationPreferences['types'][number];
type ChannelEntry = TypeEntry['channels'][number];

const inApp = (entry: TypeEntry): ChannelEntry | undefined => entry.channels.find((c) => c.channel === IN_APP);

/**
 * My account → Notifications (option A): the types the person can receive, one switch each (in the
 * app). Each change saves at once — shown straight away, put back with the error if the save
 * fails. A switch that differs from the school's default says so and offers "Reset to school
 * default" (`enabled: null`).
 */
export function NotificationPreferencesView({ initial }: { initial: NotificationPreferences }) {
  const { t } = useTranslation();
  const [prefs, setPrefs] = useState(initial);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const inFlight = useRef(new Set<string>());

  async function choose(type: string, enabled: boolean | null) {
    if (inFlight.current.has(type)) return;
    inFlight.current.add(type);
    setPending(new Set(inFlight.current));
    const before = prefs;
    // On screen at once: the new value, or the school's when resetting.
    setPrefs((p) => ({
      ...p,
      types: p.types.map((e) =>
        e.type !== type
          ? e
          : {
              ...e,
              channels: e.channels.map((c) =>
                c.channel !== IN_APP ? c : { ...c, personal: enabled, enabled: enabled ?? c.schoolDefault },
              ),
            },
      ),
    }));
    try {
      const res = await callApi(UPDATE_NOTIFICATION_PREFERENCES([{ type, channel: IN_APP, enabled }]));
      if (res.success && res.data) setPrefs(res.data);
      else if (!res.unauthorized) setPrefs(before);
    } finally {
      inFlight.current.delete(type);
      setPending(new Set(inFlight.current));
    }
  }

  const rows: TypeSwitchRow[] = prefs.types.flatMap((entry) => {
    const channel = inApp(entry);
    if (!channel) return [];
    const changed = !channel.locked && channel.personal !== null && channel.personal !== channel.schoolDefault;
    return [
      {
        type: entry.type,
        module: entry.module,
        category: entry.category,
        checked: channel.enabled,
        locked: channel.locked,
        disabled: pending.has(entry.type),
        changed,
        note: changed ? (
          <button
            type="button"
            disabled={pending.has(entry.type)}
            onClick={() => void choose(entry.type, null)}
            className="cursor-pointer font-bold text-primary hover:underline disabled:cursor-not-allowed"
          >
            {t('notifications.preferences.reset')}
          </button>
        ) : (
          t('notifications.preferences.schoolDefault')
        ),
        onChange: (next: boolean) => void choose(entry.type, next),
      },
    ];
  });

  if (rows.length === 0) {
    return (
      <div className="rounded-3xl bg-card shadow-card">
        <EmptyState
          icon={NotificationsIcon}
          title={t('notifications.preferences.noTypes.title')}
          description={t('notifications.preferences.noTypes.body')}
        />
      </div>
    );
  }
  return <TypeSwitchList rows={rows} columnLabel={t('notifications.preferences.tellMe')} />;
}

/**
 * While it loads: the list itself, drawn from the types the signed-in person's permissions let
 * them receive (the API answers the same set), every switch at the type's default.
 */
export function NotificationPreferencesSkeleton() {
  const can = useCan();
  const placeholder: NotificationPreferences = {
    channels: [{ channel: IN_APP, available: true }],
    types: NOTIFICATION_TYPE_KEYS.filter((key) => can(NOTIFICATION_TYPES[key].permission)).map((key) => {
      const def = NOTIFICATION_TYPES[key];
      return {
        type: key,
        module: def.module,
        category: def.category,
        canTurnOff: def.canTurnOff,
        channels: [{ channel: IN_APP, enabled: true, schoolDefault: true, personal: null, locked: !def.canTurnOff }],
      };
    }),
  };
  return (
    <SkeletonMask>
      <NotificationPreferencesView initial={placeholder} />
    </SkeletonMask>
  );
}
