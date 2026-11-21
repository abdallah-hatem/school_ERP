import { appIconPath, type NotificationItem, type NotificationItemEntry } from '@school-erp/shared';
import {
  deviceFrom,
  deviceLabel,
  endpointHash,
  pushMessageFor,
  pushOutcome,
  pushText,
  pushTopic,
} from './push.pure';

/*
 * Push alerts' pure rules (§11 → Push, owner 2026-11-21): what a device is called, what an alert
 * says — the bell's sentence in the device's language, never money or typed text — and what the
 * push service's answer means.
 */

const LOGO = '/files/logo/logo-1.png';
const NOW = new Date('2026-11-21T08:00:00Z');

const item = (params: Record<string, unknown>, extra: Partial<NotificationItemEntry> = {}): NotificationItemEntry => ({
  id: `i-${Math.random()}`,
  params,
  link: null,
  resolved: null,
  ...extra,
});

const view = (type: string, items: NotificationItemEntry[], extra: Partial<NotificationItem> = {}): NotificationItem => ({
  id: '0b7a6800-1111-2222-3333-444455556666',
  type,
  module: 'hr',
  category: 'approval',
  params: { ...(items[0]?.params ?? {}), count: items.length },
  link: items.length === 1 ? (items[0]?.link ?? null) : null,
  items,
  openCount: items.filter((i) => !i.resolved).length,
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
  readAt: null,
  resolved: null,
  ...extra,
});

const omar = { en: 'Omar Khalil', ar: 'عمر خليل' };
const salma = { en: 'Salma Nabil', ar: 'سلمى نبيل' };
const late = { en: 'Late arrival', ar: 'تأخر' };

describe('deviceFrom / deviceLabel', () => {
  it.each([
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36', 'Chrome', 'Android'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1', 'Safari', 'iPhone'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 Edg/131.0', 'Edge', 'macOS'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0', 'Firefox', 'Windows'],
    ['Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36', 'Samsung Internet', 'Android'],
  ])('%s → %s on %s', (ua, browser, os) => {
    expect(deviceFrom(ua)).toEqual({ browser, os });
  });

  it('an unknown or missing user agent reads as "A browser on a device"', () => {
    expect(deviceFrom(undefined)).toEqual({ browser: null, os: null });
    expect(deviceLabel(deviceFrom('curl/8.0'))).toBe('A browser on a device');
    expect(deviceLabel({ browser: 'Chrome', os: 'Android' })).toBe('Chrome on Android');
  });
});

describe('endpointHash / pushTopic', () => {
  it('a 32-character hex hash, the same for the same endpoint', () => {
    const a = endpointHash('https://push.example/abc');
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(endpointHash('https://push.example/abc')).toBe(a);
    expect(endpointHash('https://push.example/abd')).not.toBe(a);
  });

  it('the topic is the notification id without dashes (≤ 32 URL-safe characters)', () => {
    expect(pushTopic('0b7a6800-1111-2222-3333-444455556666')).toBe('0b7a6800111122223333444455556666');
  });
});

describe('pushOutcome (RFC 8030)', () => {
  it.each([
    [201, 'sent'],
    [202, 'sent'],
    [404, 'gone'],
    [410, 'gone'],
    [429, 'retry'],
    [500, 'retry'],
    [503, 'retry'],
    [400, 'refused'],
    [403, 'refused'],
    [413, 'refused'],
  ])('%i → %s', (status, outcome) => {
    expect(pushOutcome(status)).toBe(outcome);
  });
});

describe('pushText', () => {
  it('fills slots and picks the plural form by the language (Arabic two / few / many)', () => {
    const group = 'types.hr.penalty.awaiting_approval.group';
    expect(pushText('en', group, { count: 3 })).toBe('3 penalties waiting for your approval');
    expect(pushText('ar', group, { count: 2 })).toContain('جزاءان');
    expect(pushText('en', 'nope.nothing')).toBeUndefined();
  });
});

describe('pushMessageFor', () => {
  it('one penalty: the bell’s title and line, in English, opening the penalty', () => {
    const m = pushMessageFor(
      view('hr.penalty.awaiting_approval', [
        item({ employee: omar, violation: late, level: 2 }, { link: { screen: 'penalties', query: { penalty: 'p-1' } } }),
      ]),
      'en',
      { logoUrl: LOGO, now: NOW },
    );
    expect(m).toEqual({
      title: 'Penalty waiting for your approval',
      body: 'Omar Khalil · Late arrival, level 2',
      url: '/en/penalties?penalty=p-1',
      tag: 'notification-0b7a6800-1111-2222-3333-444455556666',
      icon: appIconPath('icon-192.png', LOGO),
      badge: appIconPath('badge-96.png', LOGO),
      lang: 'en',
      dir: 'ltr',
      timestamp: NOW.getTime(),
    });
  });

  it('the same in Arabic, right to left, with the Arabic names', () => {
    const m = pushMessageFor(
      view('hr.penalty.awaiting_approval', [
        item({ employee: omar, violation: late, level: 2 }, { link: { screen: 'penalties', query: { penalty: 'p-1' } } }),
      ]),
      'ar',
      { logoUrl: null, now: NOW },
    );
    expect(m.title).toBe('جزاء في انتظار اعتمادك');
    expect(m.body).toContain('عمر خليل');
    expect(m.body).toContain('تأخر');
    expect(m.url).toBe('/ar/penalties?penalty=p-1');
    expect(m.dir).toBe('rtl');
    expect(m.icon).toBe('/files/app-icon/icon-192.png?v=default');
  });

  it('a group counts what still waits and names the first two; it opens the home page (its items are in the bell)', () => {
    const m = pushMessageFor(
      view('hr.penalty.awaiting_approval', [
        item({ employee: omar, violation: late, level: 1 }),
        item({ employee: salma, violation: late, level: 1 }),
        item({ employee: { en: 'Hana Adel', ar: 'هناء عادل' }, violation: late, level: 1 }),
        item({ employee: { en: 'Done Person', ar: 'منتهي' }, violation: late, level: 1 }, {
          resolved: { at: NOW.toISOString(), by: null, resolution: 'approved' },
        }),
      ]),
      'en',
      { logoUrl: LOGO, now: NOW },
    );
    expect(m.title).toBe('3 penalties waiting for your approval');
    expect(m.body).toBe('Omar Khalil, Salma Nabil and 1 more');
    expect(m.url).toBe('/en');
  });

  it('a payroll month never shows its net — not on a lock screen (owner: no salaries)', () => {
    for (const locale of ['en', 'ar'] as const) {
      const m = pushMessageFor(
        view('hr.payroll.ready_to_approve', [
          item({ month: '2026-11', count: 38, net: 123_456_789 }, { link: { screen: 'payrollRun', recordId: 'r-1' } }),
        ]),
        locale,
        { logoUrl: LOGO, now: NOW },
      );
      const text = JSON.stringify(m);
      expect(text).not.toMatch(/1,?234,?567|123456789|EGP|ج\.م/);
      expect(text).not.toContain('{net}');
      expect(m.title).toBe(locale === 'en' ? 'November 2026 payroll is ready to approve' : 'رواتب نوفمبر 2026 جاهزة للاعتماد');
      expect(m.body).toBe(locale === 'en' ? '38 employees' : '38 موظفًا');
    }
  });

  it('a month returned by Accounting leaves its typed reason in the bell', () => {
    const m = pushMessageFor(
      view('hr.payroll.returned_by_accounting', [item({ month: '2026-10', reason: 'Wrong bank file for Omar' })]),
      'en',
      { logoUrl: LOGO, now: NOW },
    );
    expect(JSON.stringify(m)).not.toContain('Wrong bank file');
    expect(m.body).toBeNull();
  });

  it('a contract ending soon counts the days from the school’s today', () => {
    const m = pushMessageFor(
      view('hr.contract.ending_soon', [item({ employee: omar, date: '2026-11-28' })], { category: 'reminder' }),
      'en',
      { logoUrl: LOGO, now: NOW },
    );
    expect(m.title).toBe("Omar Khalil's contract ends 28 November 2026");
    expect(m.body).toBe('in 7 days');
  });
});
