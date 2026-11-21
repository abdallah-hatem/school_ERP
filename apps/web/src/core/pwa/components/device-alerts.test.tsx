// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PushDevices } from '@school-erp/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  ADD_PUSH_DEVICE: vi.fn(),
  REMOVE_PUSH_DEVICE: vi.fn(),
  REMOVE_THIS_PUSH_DEVICE: vi.fn(),
  GET_APP_ICON: vi.fn(),
  GET_PUSH_DEVICES: vi.fn(),
}));
vi.mock('../apis', () => api);
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { NotificationsI18n } from '@/core/notifications/messages';
import { renderWithI18n } from '@/test/render';
import { endpointHash, type BrowserEnv } from '../browser';
import { DeviceAlerts } from './device-alerts';

/*
 * My account → Notifications → "Alerts on this device" (owner, 2026-11-21): the switch in every
 * state a browser can be in — ready (permission not asked / granted), blocked, an old browser, an
 * iPhone not yet on the Home Screen, a server without keys — in English and Arabic, and turning it
 * on (permission on the tap, then subscribe) and off, and My devices.
 */

const CHROME_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const ENDPOINT = 'https://push.example/this-browser';

function fakeSubscription(endpoint = ENDPOINT) {
  return {
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: 'BP256', auth: 'AUTH' } }),
    unsubscribe: vi.fn(() => Promise.resolve(true)),
  };
}

function env(opts: {
  ua?: string;
  permission?: NotificationPermission;
  answer?: NotificationPermission;
  secure?: boolean;
  standalone?: boolean;
  noPush?: boolean;
  subscribed?: ReturnType<typeof fakeSubscription> | null;
} = {}) {
  let current = opts.subscribed ?? null;
  const showNotification = vi.fn(() => Promise.resolve());
  const pushManager = {
    getSubscription: vi.fn(() => Promise.resolve(current)),
    subscribe: vi.fn(() => {
      current = fakeSubscription();
      return Promise.resolve(current);
    }),
  };
  const registration = { pushManager, showNotification };
  const notification = {
    permission: opts.permission ?? 'default',
    requestPermission: vi.fn(() => Promise.resolve(opts.answer ?? 'granted')),
  };
  const e: BrowserEnv = {
    navigator: {
      userAgent: opts.ua ?? CHROME_MAC,
      maxTouchPoints: 0,
      standalone: opts.standalone,
      serviceWorker: {
        getRegistration: vi.fn(() => Promise.resolve(registration)),
        register: vi.fn(() => Promise.resolve(registration)),
        ready: Promise.resolve(registration),
      } as unknown as ServiceWorkerContainer,
    },
    isSecureContext: opts.secure ?? true,
    matchMedia: () => ({ matches: opts.standalone === true }),
    Notification: notification,
    PushManager: opts.noPush ? undefined : function PushManager() {},
  };
  return { env: e, pushManager, notification, showNotification, current: () => current };
}

const SERVER: PushDevices = { available: true, publicKey: 'BPUBLICKEY_abc-123', devices: [] };

async function deviceFor(endpoint: string, extra: Partial<PushDevices['devices'][number]> = {}) {
  return {
    id: '00000000-0000-4000-8000-00000000d001',
    browser: 'Chrome',
    os: 'macOS',
    createdAt: '2026-11-21T08:00:00.000Z',
    lastUsedAt: null,
    endpointHash: await endpointHash(endpoint),
    ...extra,
  };
}

function render(initial: PushDevices, e: BrowserEnv, locale: 'en' | 'ar' = 'en') {
  return renderWithI18n(
    <NotificationsI18n locale={locale}>
      <DeviceAlerts initial={initial} env={e} />
    </NotificationsI18n>,
    { locale },
  );
}

const theSwitch = () => screen.getByRole('switch') as HTMLButtonElement;
const stateLine = () => screen.getByRole('status');

describe('Alerts on this device', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('ready, not asked yet: off, usable, and nothing is asked before the tap', () => {
    const b = env();
    render(SERVER, b.env);
    expect(theSwitch().getAttribute('aria-checked')).toBe('false');
    expect(theSwitch().disabled).toBe(false);
    expect(stateLine().textContent).toBe('Off. Notifications stay in the bell.');
    expect(b.notification.requestPermission).not.toHaveBeenCalled();
  });

  it('turning it on asks permission, subscribes with the server key, saves the device in this language, shows a first alert', async () => {
    const user = userEvent.setup();
    const b = env();
    const saved = { ...SERVER, devices: [await deviceFor(ENDPOINT)] };
    api.ADD_PUSH_DEVICE.mockResolvedValue({ success: true, status: 201, data: saved });
    render(SERVER, b.env, 'ar');
    await user.click(theSwitch());
    await waitFor(() => expect(theSwitch().getAttribute('aria-checked')).toBe('true'));
    expect(b.notification.requestPermission).toHaveBeenCalledTimes(1);
    expect(b.pushManager.subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
    expect(api.ADD_PUSH_DEVICE).toHaveBeenCalledWith({
      endpoint: ENDPOINT,
      keys: { p256dh: 'BP256', auth: 'AUTH' },
      locale: 'ar',
    });
    expect(stateLine().textContent).toBe('مفعّلة. ما يصل إلى الجرس يصل هنا أيضًا.');
    expect(b.showNotification).toHaveBeenCalledWith('التنبيهات مفعّلة', expect.objectContaining({ dir: 'rtl' }));
    // My devices lists it as this device.
    expect(screen.getByText('هذا الجهاز')).toBeTruthy();
    expect(screen.getByText('Chrome على macOS')).toBeTruthy();
  });

  it('already on here (granted): shows on, This device, and brings the language up to date', async () => {
    const sub = fakeSubscription();
    const b = env({ permission: 'granted', subscribed: sub });
    const initial = { ...SERVER, devices: [await deviceFor(ENDPOINT, { lastUsedAt: '2026-11-21T09:00:00.000Z' })] };
    api.ADD_PUSH_DEVICE.mockResolvedValue({ success: true, status: 201, data: initial });
    render(initial, b.env);
    await waitFor(() => expect(theSwitch().getAttribute('aria-checked')).toBe('true'));
    expect(screen.getByText('This device')).toBeTruthy();
    expect(screen.getByText(/Last alert 21 Nov 2026/)).toBeTruthy();
    expect(api.ADD_PUSH_DEVICE).toHaveBeenCalledWith(expect.objectContaining({ locale: 'en' }));
  });

  it('turning it off removes this device on the server and unsubscribes the browser', async () => {
    const user = userEvent.setup();
    const sub = fakeSubscription();
    const b = env({ permission: 'granted', subscribed: sub });
    const initial = { ...SERVER, devices: [await deviceFor(ENDPOINT)] };
    api.ADD_PUSH_DEVICE.mockResolvedValue({ success: true, status: 201, data: initial });
    api.REMOVE_THIS_PUSH_DEVICE.mockResolvedValue({ success: true, status: 200, data: SERVER });
    render(initial, b.env);
    await waitFor(() => expect(theSwitch().getAttribute('aria-checked')).toBe('true'));
    await user.click(theSwitch());
    await waitFor(() => expect(theSwitch().getAttribute('aria-checked')).toBe('false'));
    expect(api.REMOVE_THIS_PUSH_DEVICE).toHaveBeenCalledWith(ENDPOINT);
    expect(sub.unsubscribe).toHaveBeenCalled();
  });

  it.each([
    ['en', 'Alerts are blocked for this site. Allow notifications in your browser\'s site settings, then come back.'],
    ['ar', 'التنبيهات محظورة لهذا الموقع. اسمح بالإشعارات من إعدادات الموقع في المتصفح ثم عُد إلى هنا.'],
  ] as const)('denied (%s): locked off with how to allow them', (locale, text) => {
    render(SERVER, env({ permission: 'denied' }).env, locale);
    expect(theSwitch().disabled).toBe(true);
    expect(stateLine().textContent).toBe(text);
    expect(stateLine().dataset.state).toBe('denied');
  });

  it('refused at the prompt → shows denied, saves nothing', async () => {
    const user = userEvent.setup();
    render(SERVER, env({ answer: 'denied' }).env);
    await user.click(theSwitch());
    await waitFor(() => expect(stateLine().dataset.state).toBe('denied'));
    expect(api.ADD_PUSH_DEVICE).not.toHaveBeenCalled();
  });

  it.each([
    ['en', "This browser can't show alerts. Try a recent Chrome, Edge, Firefox or Safari."],
    ['ar', 'لا يستطيع هذا المتصفح عرض التنبيهات. جرّب إصدارًا حديثًا من Chrome أو Edge أو Firefox أو Safari.'],
  ] as const)('unsupported (%s): no Push API → locked off', (locale, text) => {
    render(SERVER, env({ noPush: true }).env, locale);
    expect(theSwitch().disabled).toBe(true);
    expect(stateLine().textContent).toBe(text);
  });

  it.each(['en', 'ar'] as const)('iPhone in Safari, not on the Home Screen (%s): add it first, with the steps', (locale) => {
    render(SERVER, env({ ua: IPHONE_SAFARI }).env, locale);
    expect(theSwitch().disabled).toBe(true);
    expect(stateLine().dataset.state).toBe('ios-install');
    expect(stateLine().textContent).toMatch(locale === 'en' ? /add the app to your Home Screen first/ : /أضِف التطبيق إلى الشاشة الرئيسية أولًا/);
    expect(screen.getByTestId('ios-install-steps').querySelectorAll('li')).toHaveLength(3);
  });

  it('the same iPhone opened from the Home Screen: usable', () => {
    render(SERVER, env({ ua: IPHONE_SAFARI, standalone: true }).env);
    expect(theSwitch().disabled).toBe(false);
  });

  it('not https: locked off, says why', () => {
    render(SERVER, env({ secure: false }).env);
    expect(stateLine().dataset.state).toBe('insecure');
    expect(theSwitch().disabled).toBe(true);
  });

  it('a server without VAPID keys: locked off, "not set up on this server yet"', () => {
    render({ available: false, publicKey: null, devices: [] }, env().env);
    expect(theSwitch().disabled).toBe(true);
    expect(stateLine().textContent).toBe("Alerts aren't set up on this server yet.");
  });

  it('My devices: another device is listed without "This device" and can be removed', async () => {
    const user = userEvent.setup();
    const other = await deviceFor('https://push.example/phone', { browser: 'Chrome', os: 'Android' });
    api.REMOVE_PUSH_DEVICE.mockResolvedValue({ success: true, status: 200, data: SERVER });
    render({ ...SERVER, devices: [other] }, env().env);
    expect(screen.queryByText('This device')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Remove Chrome on Android' }));
    expect(api.REMOVE_PUSH_DEVICE).toHaveBeenCalledWith(other.id);
    await waitFor(() => expect(screen.queryByText('Chrome on Android')).toBeNull());
  });
});
