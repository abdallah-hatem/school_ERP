'use client';

import type { PushDevice, PushDevices } from '@school-erp/shared';
import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import { schoolDay } from '@/core/audit/lib/time';
import { callApi } from '@/lib/callApi';
import { Button } from '@/shared/components/ui/button';
import {
  ComputerDeviceIcon,
  DeviceAlertsIcon,
  InfoIcon,
  PhoneDeviceIcon,
  RemoveIcon,
  WarningIcon,
} from '@/shared/components/ui/icons';
import { Switch } from '@/shared/components/ui/switch';
import { formatDate } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { ADD_PUSH_DEVICE, REMOVE_PUSH_DEVICE, REMOVE_THIS_PUSH_DEVICE } from '../apis';
import {
  alertsSupport,
  browserEnv,
  currentSubscription,
  endpointHash,
  subscribeThisBrowser,
  subscriptionBody,
  type AlertsSupport,
  type BrowserEnv,
} from '../browser';
import { IosInstallSteps } from './install-app';

/**
 * Where the switch stands: `checking` until the browser has been asked (the server render and the
 * first paint), then the browser's support (`AlertsSupport`), or `not-configured` when the server
 * has no VAPID keys.
 */
export type DeviceAlertsState = 'checking' | 'not-configured' | AlertsSupport;

const MOBILE = /Android|iPhone|iPad/;

/** The browser's abilities don't change while the page is open (a refusal is tracked in state). */
const noChanges = () => () => undefined;

/**
 * My account → Notifications → "Alerts on this device" (owner, 2026-11-21): one switch for this
 * browser — on asks the browser's permission (on the tap, never on its own) and subscribes it;
 * off unsubscribes it — with why it can't be used when it can't (blocked, an iPhone not on the Home
 * Screen yet, an old browser, not set up on the server), and My devices, each removable. The alerts
 * follow the type switches below; required types always come.
 *
 * `env` stands in for the browser in tests.
 */
export function DeviceAlerts({ initial, env }: { initial: PushDevices; env?: BrowserEnv }) {
  const { t, locale } = useTranslation();
  const id = useId();
  const [server, setServer] = useState(initial);
  // What the browser can do, read on the client only (the server render says "checking").
  const found = useSyncExternalStore(
    noChanges,
    () => alertsSupport(env ?? browserEnv()),
    () => 'checking' as const,
  );
  const [deniedNow, setDeniedNow] = useState(false);
  const support: DeviceAlertsState = deniedNow
    ? 'denied'
    : found === 'ready' && !server.available
      ? 'not-configured'
      : found;
  const [thisHash, setThisHash] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const e = env ?? browserEnv();
    if (alertsSupport(e) === 'ready') {
      void currentSubscription(e).then(async (sub) => {
        if (!sub) return;
        const hash = await endpointHash(sub.endpoint);
        setThisHash(hash);
        // Already on here, in another language: bring its alerts' language up to date (no entry).
        const body = subscriptionBody(sub);
        if (initial.available && body && initial.devices.some((d) => d.endpointHash === hash)) {
          const res = await ADD_PUSH_DEVICE({ ...body, locale });
          if (res.success && res.data) setServer(res.data);
        }
      });
    }
    // Once per page: the language is part of the URL, so a switch re-runs it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const on = thisHash !== null && server.devices.some((d) => d.endpointHash === thisHash);
  const usable = support === 'ready';

  async function turnOn() {
    if (!server.publicKey) return;
    const e = env ?? browserEnv();
    const sub = await subscribeThisBrowser(server.publicKey, e);
    if (sub === 'denied') {
      setDeniedNow(true);
      return;
    }
    const body = sub === 'failed' ? null : subscriptionBody(sub);
    if (!body || sub === 'failed') {
      setFailed(true);
      return;
    }
    const res = await callApi(ADD_PUSH_DEVICE({ ...body, locale }));
    if (!res.success || !res.data) {
      setFailed(true);
      return;
    }
    setServer(res.data);
    setThisHash(await endpointHash(body.endpoint));
    // A first alert from the device itself, so the person sees what they turned on.
    const registration = await e.navigator.serviceWorker?.getRegistration();
    await registration
      ?.showNotification(t('notifications.devices.test.title'), {
        body: t('notifications.devices.test.body'),
        icon: undefined,
        tag: 'alerts-on',
        lang: locale,
        dir: locale === 'ar' ? 'rtl' : 'ltr',
      })
      .catch(() => undefined);
  }

  async function turnOff() {
    const e = env ?? browserEnv();
    const sub = await currentSubscription(e);
    if (sub) {
      const res = await callApi(REMOVE_THIS_PUSH_DEVICE(sub.endpoint));
      if (!res.success || !res.data) return;
      setServer(res.data);
      await sub.unsubscribe().catch(() => false);
    }
    setThisHash(null);
  }

  async function flip(next: boolean) {
    if (pending) return;
    setPending(true);
    setFailed(false);
    try {
      if (next) await turnOn();
      else await turnOff();
    } finally {
      setPending(false);
    }
  }

  async function remove(device: PushDevice) {
    const res = await callApi(REMOVE_PUSH_DEVICE(device.id), {
      showSuccessToast: true,
      successMessage: t('notifications.devices.list.removed'),
    });
    if (!res.success || !res.data) return;
    setServer(res.data);
    if (device.endpointHash === thisHash) {
      const sub = await currentSubscription(env ?? browserEnv());
      await sub?.unsubscribe().catch(() => false);
      setThisHash(null);
    }
  }

  const deviceName = (d: Pick<PushDevice, 'browser' | 'os'>) =>
    t('notifications.devices.label', {
      browser: d.browser ?? t('notifications.devices.unknownBrowser'),
      os: d.os ?? t('notifications.devices.unknownOs'),
    });
  const day = (at: string) => formatDate(schoolDay(at), locale);

  return (
    <section
      data-skeleton-block="device-alerts"
      data-skeleton-measure="width"
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-4 rounded-3xl bg-card p-5 shadow-card md:p-6"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-lg text-primary"
        >
          <DeviceAlertsIcon />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label id={`${id}-title`} htmlFor={id} className="font-display text-base font-extrabold">
            {t('notifications.devices.title')}
          </label>
          <p id={`${id}-desc`} className="text-sm text-muted-foreground">
            {t('notifications.devices.description')}
          </p>
        </div>
        <Switch
          id={id}
          checked={usable && on}
          disabled={!usable}
          pending={pending}
          aria-describedby={`${id}-desc ${id}-state`}
          onCheckedChange={(next) => void flip(next)}
          className="mt-1"
        />
      </div>

      <StateLine id={`${id}-state`} state={support} on={on} failed={failed} />
      {support === 'ios-install' ? <IosInstallSteps /> : null}

      {server.devices.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <h3 className="text-xs font-extrabold text-muted-foreground">{t('notifications.devices.list.title')}</h3>
          <ul className="flex flex-col gap-2">
            {server.devices.map((d) => {
              const Icon = MOBILE.test(d.os ?? '') ? PhoneDeviceIcon : ComputerDeviceIcon;
              const name = deviceName(d);
              return (
                <li key={d.id} data-skeleton-each className="flex items-center gap-3 rounded-2xl bg-muted px-3 py-2.5">
                  <Icon className="size-5 shrink-0 text-muted-foreground" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold">
                      <bdi>{name}</bdi>
                      {d.endpointHash === thisHash ? (
                        <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[0.71875rem] font-bold text-primary">
                          {t('notifications.devices.list.thisDevice')}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t('notifications.devices.list.added', { date: day(d.createdAt) })}
                      {' · '}
                      {d.lastUsedAt
                        ? t('notifications.devices.list.lastUsed', { date: day(d.lastUsedAt) })
                        : t('notifications.devices.list.neverUsed')}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t('notifications.devices.list.removeLabel', { device: name })}
                    onClick={() => void remove(d)}
                    className="tap-target shrink-0"
                  >
                    <RemoveIcon />
                    <span className="max-sm:sr-only">{t('notifications.devices.list.remove')}</span>
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/** The line under the switch: on / off, or why it can't be used here. */
function StateLine({ id, state, on, failed }: { id: string; state: DeviceAlertsState; on: boolean; failed: boolean }) {
  const { t } = useTranslation();
  const message =
    state === 'ready'
      ? failed
        ? t('notifications.devices.states.failed')
        : on
          ? t('notifications.devices.on')
          : t('notifications.devices.off')
      : t(
          {
            checking: 'notifications.devices.states.checking',
            'not-configured': 'notifications.devices.states.notConfigured',
            insecure: 'notifications.devices.states.insecure',
            'ios-install': 'notifications.devices.states.iosInstall',
            unsupported: 'notifications.devices.states.unsupported',
            denied: 'notifications.devices.states.denied',
          }[state],
        );
  const warn = state === 'denied' || failed;
  const info = state !== 'ready' && state !== 'checking' && !warn;
  const Icon = warn ? WarningIcon : InfoIcon;
  return (
    <p
      id={id}
      role="status"
      data-state={state}
      className={cn(
        'flex items-start gap-2 rounded-2xl px-3 py-2.5 text-sm',
        warn ? 'bg-warning-soft text-warning-ink' : info ? 'bg-info-soft text-info-ink' : 'bg-muted text-muted-foreground',
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </p>
  );
}
