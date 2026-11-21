import { HttpStatus, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { ErrorCode, PUSH_DEVICES_MAX } from '@school-erp/shared';
import type { AuditService } from '../../audit';
import { InAppChannel, NotificationChannels, PushChannel } from '../channels';
import type {
  PushDevicesRepository,
  StoredPushDevice,
} from '../repositories/push-devices.repository';
import { PushDevicesService } from './push-devices.service';
import { endpointHash } from './push.pure';

/*
 * My account → "Alerts on this device" and My devices (§11 → Push). Adding and removing a device are
 * audited (they decide where the school's notifications are shown); turning alerts on again on a
 * device that already gets them writes no entry. Another person's device is a 404.
 */

const ME = { id: 'u-1' };
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36';
const KEYS = { p256dh: 'BPk', auth: 'au' };

const stored = (over: Partial<StoredPushDevice> = {}): StoredPushDevice => ({
  id: 'd-1',
  userId: 'u-1',
  endpoint: 'https://push.example/1',
  endpointHash: endpointHash('https://push.example/1'),
  p256dh: 'BPk',
  auth: 'au',
  browser: 'Chrome',
  os: 'Android',
  locale: 'en',
  createdAt: new Date('2026-11-01T00:00:00Z'),
  lastUsedAt: null,
  revokedAt: null,
  ...over,
});

function make(opts: { push?: boolean; existing?: StoredPushDevice | null; active?: StoredPushDevice[]; env?: string } = {}) {
  const push = opts.push ?? true;
  const config = {
    get: jest.fn((key: string) =>
      key === 'push'
        ? push
          ? { publicKey: 'BPUBLIC', privateKey: 'k', subject: 'mailto:it@example.test' }
          : null
        : key === 'nodeEnv'
          ? (opts.env ?? 'development')
          : undefined,
    ),
  } as unknown as ConfigService;
  const repo = {
    activeOf: jest.fn(() => Promise.resolve(opts.active ?? [])),
    findByEndpoint: jest.fn(() => Promise.resolve(opts.existing ?? null)),
    findOwn: jest.fn((userId: string, id: string) =>
      Promise.resolve((opts.active ?? []).find((d) => d.id === id && d.userId === userId) ?? null),
    ),
    upsert: jest.fn((input: Omit<StoredPushDevice, 'id' | 'createdAt' | 'lastUsedAt' | 'revokedAt'>) =>
      Promise.resolve(stored({ ...input, id: opts.existing?.id ?? 'd-new' })),
    ),
    revoke: jest.fn(() => Promise.resolve()),
  };
  const audit = { record: jest.fn(() => Promise.resolve()) };
  const service = new PushDevicesService(
    config,
    repo as unknown as PushDevicesRepository,
    new NotificationChannels(new InAppChannel(), new PushChannel(config)),
    audit as unknown as AuditService,
  );
  return { service, repo, audit };
}

const add = (service: PushDevicesService, endpoint = 'https://push.example/1', locale: 'en' | 'ar' = 'en') =>
  service.add(ME, { endpoint, keys: KEYS, locale, userAgent: ANDROID_CHROME });

describe('PushDevicesService', () => {
  it('lists my devices with the server’s public key; no keys → not available, no key', async () => {
    const on = make({ active: [stored()] });
    expect(await on.service.list(ME)).toEqual({
      available: true,
      publicKey: 'BPUBLIC',
      devices: [
        {
          id: 'd-1',
          browser: 'Chrome',
          os: 'Android',
          createdAt: '2026-11-01T00:00:00.000Z',
          lastUsedAt: null,
          endpointHash: endpointHash('https://push.example/1'),
        },
      ],
    });
    const off = make({ push: false });
    expect(await off.service.list(ME)).toMatchObject({ available: false, publicKey: null });
  });

  it('a new device: stored with its browser, system, language and endpoint hash; one audit entry', async () => {
    const { service, repo, audit } = make();
    await add(service, 'https://push.example/1', 'ar');
    expect(repo.upsert).toHaveBeenCalledWith({
      userId: 'u-1',
      endpoint: 'https://push.example/1',
      endpointHash: endpointHash('https://push.example/1'),
      p256dh: 'BPk',
      auth: 'au',
      browser: 'Chrome',
      os: 'Android',
      locale: 'ar',
    });
    expect(audit.record).toHaveBeenCalledWith({
      action: 'core.push_device.add',
      entity: { type: 'push_device', id: 'd-new', label: 'Chrome on Android' },
    });
  });

  it('turning alerts on again on my own active device (a new language) writes no entry', async () => {
    const { service, audit } = make({ existing: stored() });
    await add(service, 'https://push.example/1', 'ar');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ changes: [] }));
  });

  it.each([
    ['removed before', stored({ revokedAt: new Date() })],
    ['another account’s (a shared computer)', stored({ userId: 'u-2' })],
  ])('a device %s comes back as mine: audited', async (_label, existing) => {
    const { service, audit } = make({ existing });
    await add(service);
    expect(audit.record).toHaveBeenCalledWith(
      expect.not.objectContaining({ changes: expect.anything() }),
    );
  });

  it('no VAPID keys → 409 CHANNEL_NOT_AVAILABLE, nothing stored', async () => {
    const { service, repo } = make({ push: false });
    await expect(add(service)).rejects.toMatchObject({
      code: ErrorCode.CHANNEL_NOT_AVAILABLE,
      status: HttpStatus.CONFLICT,
    });
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it('production takes only https:// endpoints (the push services’ own)', async () => {
    const { service } = make({ env: 'production' });
    await expect(add(service, 'http://10.0.0.5/push')).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_FAILED,
    });
  });

  it(`more than ${PUSH_DEVICES_MAX} devices → the one unused longest stops getting alerts`, async () => {
    const active = Array.from({ length: PUSH_DEVICES_MAX + 1 }, (_, i) =>
      stored({ id: `d-${i}`, createdAt: new Date(2026, 0, i + 1), lastUsedAt: i === 0 ? new Date(2026, 10, 1) : null }),
    );
    const { service, repo } = make({ active });
    await add(service);
    expect(repo.revoke).toHaveBeenCalledWith(['d-1'], 'replaced', expect.any(Date));
  });

  it('removing one of my devices revokes it and records it; someone else’s is a 404', async () => {
    const { service, repo, audit } = make({ active: [stored()] });
    await service.remove(ME, 'd-1');
    expect(repo.revoke).toHaveBeenCalledWith(['d-1'], 'removed', expect.any(Date));
    expect(audit.record).toHaveBeenCalledWith({
      action: 'core.push_device.remove',
      entity: { type: 'push_device', id: 'd-1', label: 'Chrome on Android' },
    });
    await expect(service.remove({ id: 'u-2' }, 'd-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('turning alerts off on this device: revoked and recorded; already off → nothing recorded', async () => {
    const on = make({ existing: stored() });
    await on.service.removeByEndpoint(ME, 'https://push.example/1');
    expect(on.repo.revoke).toHaveBeenCalledWith(['d-1'], 'removed', expect.any(Date));
    expect(on.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'core.push_device.remove', entity: expect.objectContaining({ id: 'd-1' }) }),
    );
    const off = make({ existing: null });
    await off.service.removeByEndpoint(ME, 'https://push.example/9');
    expect(off.repo.revoke).not.toHaveBeenCalled();
    expect(off.audit.record).toHaveBeenCalledWith(expect.objectContaining({ changes: [] }));
  });
});
