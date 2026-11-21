import type { NotificationItem } from '@school-erp/shared';
import type { SettingsService } from '../../settings';
import type { NotificationInbox } from '../notification-inbox.service';
import type {
  PushDevicesRepository,
  StoredPushDevice,
} from '../repositories/push-devices.repository';
import type { PushSender } from './push-sender';
import { PushNotDeliveredError, PushNotificationListener } from './push.listener';

/*
 * Sending a notification's alert to its reader's devices (outbox listener, §11 → Push): each device
 * in its language, 404 / 410 drops the device, retried only when no device took it, nothing for a
 * notification already read, handled or no longer visible — and never a salary in the payload.
 */

const EVENT = { notificationId: 'n-1', recipientId: 'u-1', at: '2026-11-21T08:00:00.000Z' };

const device = (id: string, locale = 'en'): StoredPushDevice => ({
  id,
  userId: 'u-1',
  endpoint: `https://push.example/${id}`,
  endpointHash: 'h',
  p256dh: 'p',
  auth: 'a',
  browser: 'Chrome',
  os: 'Android',
  locale,
  createdAt: new Date(),
  lastUsedAt: null,
  revokedAt: null,
});

const payrollView = (extra: Partial<NotificationItem> = {}): NotificationItem => ({
  id: 'n-1',
  type: 'hr.payroll.ready_to_approve',
  module: 'hr',
  category: 'approval',
  params: { month: '2026-11', count: 38, net: 123_456_789 },
  link: { screen: 'payrollRun', recordId: 'r-1' },
  items: [
    {
      id: 'i-1',
      params: { month: '2026-11', count: 38, net: 123_456_789 },
      link: { screen: 'payrollRun', recordId: 'r-1' },
      resolved: null,
    },
  ],
  openCount: 1,
  createdAt: EVENT.at,
  updatedAt: EVENT.at,
  readAt: null,
  resolved: null,
  ...extra,
});

function make(opts: {
  devices?: StoredPushDevice[];
  view?: NotificationItem | null;
  statuses?: Record<string, number | Error>;
  exists?: boolean;
}) {
  const repo = {
    notificationExists: jest.fn(() => Promise.resolve(opts.exists ?? true)),
    activeOf: jest.fn(() => Promise.resolve(opts.devices ?? [device('d-1')])),
    markUsed: jest.fn(() => Promise.resolve()),
    revoke: jest.fn(() => Promise.resolve()),
    recordDelivery: jest.fn(() => Promise.resolve()),
  };
  const inbox = {
    findVisible: jest.fn(() => Promise.resolve(opts.view === undefined ? payrollView() : opts.view)),
  };
  const settings = {
    getPublicSchoolSettings: jest.fn(() => Promise.resolve({ logoUrl: '/files/logo/logo-1.png' })),
  };
  const sent: { endpoint: string; payload: Record<string, unknown>; topic: string; urgency: string }[] = [];
  const sender = {
    send: jest.fn((target: { endpoint: string }, payload: string, o: { topic: string; urgency: string }) => {
      sent.push({ endpoint: target.endpoint, payload: JSON.parse(payload), topic: o.topic, urgency: o.urgency });
      const id = target.endpoint.split('/').pop() ?? '';
      const r = opts.statuses?.[id] ?? 201;
      return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
    }),
  };
  const listener = new PushNotificationListener(
    repo as unknown as PushDevicesRepository,
    inbox as unknown as NotificationInbox,
    settings as unknown as SettingsService,
    sender as unknown as PushSender,
  );
  return { listener, repo, inbox, sender, sent };
}

describe('PushNotificationListener', () => {
  it('sends each device the bell’s sentence in its own language, without the net; marks them used', async () => {
    const { listener, repo, sent } = make({ devices: [device('d-en', 'en'), device('d-ar', 'ar')] });
    await listener.handle(EVENT);
    expect(sent).toHaveLength(2);
    const en = sent.find((s) => s.endpoint.endsWith('d-en'));
    const ar = sent.find((s) => s.endpoint.endsWith('d-ar'));
    expect(en?.payload).toMatchObject({
      title: 'November 2026 payroll is ready to approve',
      body: '38 employees',
      url: '/en/payroll/r-1',
      lang: 'en',
    });
    expect(ar?.payload).toMatchObject({ lang: 'ar', dir: 'rtl', url: '/ar/payroll/r-1' });
    // No salary data at all (owner, 2026-11-21).
    expect(JSON.stringify(sent)).not.toMatch(/123456789|1,234,567|net/i);
    expect(en?.topic).toBe('n1');
    expect(en?.urgency).toBe('high');
    expect(repo.markUsed).toHaveBeenCalledWith(['d-en', 'd-ar'], expect.any(Date));
    expect(repo.recordDelivery).toHaveBeenCalledWith('n-1', expect.objectContaining({ status: 'sent', error: null }));
  });

  it('a device the push service says is gone (404 / 410) is dropped; the others still get it', async () => {
    const { listener, repo } = make({
      devices: [device('d-ok'), device('d-410'), device('d-404')],
      statuses: { 'd-410': 410, 'd-404': 404 },
    });
    await listener.handle(EVENT);
    expect(repo.revoke).toHaveBeenCalledWith(['d-410', 'd-404'], 'expired', expect.any(Date));
    expect(repo.markUsed).toHaveBeenCalledWith(['d-ok'], expect.any(Date));
  });

  it('no device took it and one may later (5xx, timeout) → throws, so the outbox retries', async () => {
    const { listener } = make({
      devices: [device('d-1'), device('d-2')],
      statuses: { 'd-1': 503, 'd-2': new Error('timeout') },
    });
    await expect(listener.handle(EVENT)).rejects.toBeInstanceOf(PushNotDeliveredError);
  });

  it('one device took it, another failed → not retried (no second copy), the failure recorded', async () => {
    const { listener, repo } = make({ devices: [device('d-1'), device('d-2')], statuses: { 'd-2': 500 } });
    await listener.handle(EVENT);
    expect(repo.recordDelivery).toHaveBeenCalledWith(
      'n-1',
      expect.objectContaining({ status: 'sent', error: 'HTTP 500' }),
    );
  });

  it('a refusal (400) is not retried: it would fail the same way', async () => {
    const { listener, repo } = make({ statuses: { 'd-1': 400 } });
    await listener.handle(EVENT);
    expect(repo.recordDelivery).toHaveBeenCalledWith('n-1', expect.objectContaining({ status: 'failed' }));
  });

  it.each([
    ['read already', payrollView({ readAt: EVENT.at })],
    ['handled already', payrollView({ openCount: 0 })],
    ['no longer visible to the reader (N11)', null],
  ])('%s → nothing sent', async (_label, v) => {
    const { listener, sender, repo } = make({ view: v });
    await listener.handle(EVENT);
    expect(sender.send).not.toHaveBeenCalled();
    expect(repo.recordDelivery).toHaveBeenCalledWith('n-1', expect.objectContaining({ status: 'skipped' }));
  });

  it('every device removed meanwhile (alerts off) → nothing sent', async () => {
    const { listener, sender } = make({ devices: [] });
    await listener.handle(EVENT);
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('a notification purged before the alert went → nothing at all', async () => {
    const { listener, sender, repo } = make({ exists: false });
    await listener.handle(EVENT);
    expect(sender.send).not.toHaveBeenCalled();
    expect(repo.recordDelivery).not.toHaveBeenCalled();
  });
});
