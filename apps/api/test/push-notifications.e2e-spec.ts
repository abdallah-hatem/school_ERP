import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  ErrorCode,
  NotificationEvent,
  type AuthUser,
  type NotificationSubject,
  type NotificationTypeDefinition,
  type NotificationTypeKey,
  type PushDevices,
} from '@school-erp/shared';
import { NotificationTypes, NotificationsService } from '../src/core/notifications';
import { DatabaseService } from '../src/database/database.service';
import { AfterCommit } from '../src/database/transactions';
import { endpointHash } from '../src/core/notifications/push/push.pure';
import { http, unique } from './helpers';
import { ANONYMOUS_HEADER, createAppAsTestUser, giveRoles } from './helpers/as-test-user';
import { outboxEvents, outboxIdle } from './helpers/events';
import { historyMark } from './helpers/history';
import { startFakePushService, type FakeBrowser, type FakePushService } from './helpers/push';
import { useTestVapidKeys } from './helpers/setup-push';

/*
 * Push alerts (§11 → Push, owner 2026-11-21) against the real database and a stand-in push service
 * (`helpers/push.ts`) that decrypts what the API really sends. Subscribe / unsubscribe / list my
 * devices (audited), a push for each new notification after the commit through the outbox —
 * respecting the type's switch and required types —, nothing with device alerts off, 410 drops the
 * device, and no salary in the payload.
 *
 * The server needs VAPID keys: this suite makes a pair for its own run before the app boots.
 */
const VAPID = useTestVapidKeys();

const TYPE = 'core.e2e.push_thing' as NotificationTypeKey;
const LOCKED_TYPE = 'core.e2e.push_must_see' as NotificationTypeKey;
const ENTITY = 'e2e_push_subject';

const definition = (canTurnOff: boolean): NotificationTypeDefinition => ({
  module: 'core',
  category: canTurnOff ? 'reminder' : 'approval',
  canTurnOff,
  defaultChannels: ['in_app'],
  permission: 'hr.payroll.approve',
  dedupePrefix: 'e2e_push',
  link: (s) => ({ screen: 'payrollRun', recordId: s.entityId }),
});

describe('Push alerts (e2e)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let user: AuthUser;
  let notifications: NotificationsService;
  let afterCommit: AfterCommit;
  let push: FakePushService;
  const users: string[] = [];
  const subjects: string[] = [];

  async function as<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const me = user.id;
    user.id = id;
    try {
      return await fn();
    } finally {
      user.id = me;
    }
  }

  /** A person who may approve payroll (whole school), and nothing else in this suite. */
  const approver = async (label: string) => {
    const id = (
      await db.user.create({
        data: { email: `${unique(label)}@example.test`, name: label, passwordHash: 'x' },
        select: { id: true },
      })
    ).id;
    users.push(id);
    await giveRoles(db, id, ['hr_manager']);
    return id;
  };

  const subscribe = (userId: string, browser: FakeBrowser, locale: 'en' | 'ar' = 'en') =>
    as(userId, async () =>
      http(app)
        .post('/notifications/push-devices')
        .send({
          endpoint: browser.endpoint,
          keys: browser.keys,
          locale,
          userAgent:
            'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36',
        }),
    );

  const devicesOf = (userId: string) =>
    as(userId, async () => (await http(app).get('/notifications/push-devices').expect(200)).body.data as PushDevices);

  /** Sends one item of `type` (to every holder of the permission) and waits for the outbox. */
  const send = async (
    type: NotificationTypeKey,
    params: Record<string, unknown> = {},
  ): Promise<NotificationSubject> => {
    const subject: NotificationSubject = { entityType: ENTITY, entityId: randomUUID() };
    subjects.push(subject.entityId);
    await afterCommit.transaction(() =>
      notifications.notify({ type, subject, params, dedupeKey: `e2e_push:${subject.entityId}` }),
    );
    await outboxIdle(app);
    return subject;
  };

  const pushEventsFor = async (userId: string) =>
    outboxEvents(db, NotificationEvent.PUSH_REQUESTED, { recipientId: userId });

  beforeAll(async () => {
    push = await startFakePushService();
    ({ app, user } = await createAppAsTestUser());
    db = app.get(DatabaseService);
    notifications = app.get(NotificationsService);
    afterCommit = app.get(AfterCommit);
    const types = app.get(NotificationTypes);
    types.register(TYPE, definition(true));
    types.register(LOCKED_TYPE, definition(false));
  });

  afterAll(async () => {
    const events = await db.outboxEvent.findMany({
      where: { name: NotificationEvent.PUSH_REQUESTED },
      select: { id: true, payload: true },
    });
    const ours = events
      .filter((e) => users.includes((e.payload as { recipientId?: string }).recipientId ?? ''))
      .map((e) => e.id);
    await db.outboxDelivery.deleteMany({ where: { eventId: { in: ours } } });
    await db.outboxEvent.deleteMany({ where: { id: { in: ours } } });
    await db.notification.deleteMany({ where: { type: { in: [TYPE, LOCKED_TYPE, 'hr.payroll.ready_to_approve'] }, items: { some: { entityId: { in: subjects } } } } });
    await db.notification.deleteMany({ where: { type: { in: [TYPE, LOCKED_TYPE] } } });
    await db.notificationDefault.deleteMany({ where: { type: { in: [TYPE, LOCKED_TYPE] } } });
    // Devices and preferences go with their users (cascade).
    await db.user.deleteMany({ where: { id: { in: users } } });
    await app.close();
    await push.close();
  });

  describe('the app icons (public, versioned by the logo)', () => {
    it('a known icon with its version → a PNG kept for a year, signed out too; no version or an unknown name → 404', async () => {
      const res = await http(app)
        .get('/files/app-icon/maskable-512.png?v=anything')
        .set(ANONYMOUS_HEADER, '1')
        .expect(200);
      expect(res.headers['content-type']).toBe('image/png');
      expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
      expect((res.body as Buffer).subarray(1, 4).toString('latin1')).toBe('PNG');
      await http(app).get('/files/app-icon/maskable-512.png').set(ANONYMOUS_HEADER, '1').expect(404);
      await http(app).get('/files/app-icon/evil.png?v=1').set(ANONYMOUS_HEADER, '1').expect(404);
      // The folder is never served as an ordinary upload.
      await http(app).get('/files/app-icon/x.png').expect(404);
    });
  });

  describe('my devices', () => {
    it('lists none at first, with the server’s public key', async () => {
      const id = await approver('Fresh');
      expect(await devicesOf(id)).toEqual({ available: true, publicKey: VAPID.publicKey, devices: [] });
    });

    it('subscribe → listed with its browser and endpoint hash, audited once; again → no second entry', async () => {
      const id = await approver('Subscriber');
      const phone = push.browser('phone');
      const mark = await historyMark(db);
      const res = await subscribe(id, phone);
      expect(res.status).toBe(201);
      const list = res.body.data as PushDevices;
      expect(list.devices).toEqual([
        expect.objectContaining({ browser: 'Chrome', os: 'Android', endpointHash: endpointHash(phone.endpoint), lastUsedAt: null }),
      ]);
      // The endpoint itself (a capability URL) is never handed back.
      expect(JSON.stringify(list)).not.toContain(phone.endpoint);
      // The same browser again, in Arabic now: its language changes, no second entry.
      expect((await subscribe(id, phone, 'ar')).status).toBe(201);
      const entries = await db.auditEntry.findMany({
        where: { seq: { gt: mark }, action: 'core.push_device.add', entityId: list.devices[0]?.id },
      });
      expect(entries).toEqual([
        expect.objectContaining({ actorId: id, entityLabel: 'Chrome on Android', entityType: 'push_device' }),
      ]);
      expect(await db.pushSubscription.findUnique({ where: { endpoint: phone.endpoint } })).toMatchObject({ locale: 'ar' });
    });

    it('a bad body → 400; an endpoint that isn’t a URL → 400', async () => {
      const id = await approver('Bad');
      await as(id, () => http(app).post('/notifications/push-devices').send({ endpoint: 'x' }).expect(400));
      await as(id, () =>
        http(app)
          .post('/notifications/push-devices')
          .send({ endpoint: 'not a url', keys: { p256dh: 'a', auth: 'b' }, locale: 'en' })
          .expect(400),
      );
    });

    it('remove one of mine → gone from the list, audited; someone else’s → 404', async () => {
      const id = await approver('Remover');
      const other = await approver('Other');
      const laptop = push.browser('laptop');
      const deviceId = ((await subscribe(id, laptop)).body.data as PushDevices).devices[0]?.id ?? '';
      await as(other, () => http(app).delete(`/notifications/push-devices/${deviceId}`).expect(404));
      const mark = await historyMark(db);
      await as(id, () => http(app).delete(`/notifications/push-devices/${deviceId}`).expect(200));
      expect((await devicesOf(id)).devices).toEqual([]);
      expect(
        await db.auditEntry.count({ where: { seq: { gt: mark }, action: 'core.push_device.remove', entityId: deviceId } }),
      ).toBe(1);
    });

    it('unsubscribe (alerts off on this device) by its endpoint', async () => {
      const id = await approver('Unsub');
      const tablet = push.browser('tablet');
      await subscribe(id, tablet);
      await as(id, () =>
        http(app).post('/notifications/push-devices/unsubscribe').send({ endpoint: tablet.endpoint }).expect(200),
      );
      expect((await devicesOf(id)).devices).toEqual([]);
    });
  });

  describe('sending', () => {
    it('a new notification reaches the device after the commit: decrypted, in its language, opening the record', async () => {
      const id = await approver('Receiver');
      const phone = push.browser('receiver');
      await subscribe(id, phone, 'ar');
      const subject = await send(TYPE);
      expect(phone.received()).toHaveLength(1);
      expect(phone.received()[0]).toMatchObject({
        url: `/ar/payroll/${subject.entityId}`,
        lang: 'ar',
        dir: 'rtl',
        icon: expect.stringMatching(/^\/files\/app-icon\/icon-192\.png\?v=/),
        badge: expect.stringMatching(/^\/files\/app-icon\/badge-96\.png\?v=/),
      });
      const row = await db.notification.findFirst({
        where: { recipientId: id, type: TYPE, items: { some: { entityId: subject.entityId } } },
        include: { deliveries: true },
      });
      expect(row?.deliveries.map((d) => [d.channel, d.status]).sort()).toEqual([
        ['in_app', 'sent'],
        ['push', 'sent'],
      ]);
      expect((await devicesOf(id)).devices[0]?.lastUsedAt).not.toBeNull();
    });

    it('the payroll month’s alert carries no salary: no net, in any language', async () => {
      const id = await approver('NoSalary');
      const en = push.browser('nosalary-en');
      const ar = push.browser('nosalary-ar');
      await subscribe(id, en, 'en');
      await subscribe(id, ar, 'ar');
      const subject: NotificationSubject = { entityType: 'payroll_run', entityId: randomUUID() };
      subjects.push(subject.entityId);
      await afterCommit.transaction(() =>
        notifications.notify({
          type: 'hr.payroll.ready_to_approve',
          subject,
          params: { month: '2026-11', count: 38, net: 123_456_789 },
          dedupeKey: `payroll_ready:e2e:${subject.entityId}`,
        }),
      );
      await outboxIdle(app);
      const payloads = JSON.stringify([...en.received(), ...ar.received()]);
      expect(en.received()[0]).toMatchObject({ title: 'November 2026 payroll is ready to approve', body: '38 employees' });
      expect(payloads).not.toMatch(/123456789|1,234,567|"net"/);
      expect(payloads).not.toMatch(/EGP|ج\.م/);
    });

    it('device alerts off (no device) → no push and no outbox event', async () => {
      const id = await approver('NoDevice');
      await send(TYPE);
      expect(await pushEventsFor(id)).toEqual([]);
    });

    it('the type turned off in the app → neither the bell nor a push; a required type pushes anyway', async () => {
      const id = await approver('Picky');
      const phone = push.browser('picky');
      await subscribe(id, phone);
      await as(id, () =>
        http(app)
          .put('/notifications/preferences')
          .send({ items: [{ type: TYPE, channel: 'in_app', enabled: false }] })
          .expect(200),
      );
      await send(TYPE);
      expect(phone.received()).toHaveLength(0);
      await db.notificationDefault.create({ data: { type: LOCKED_TYPE, channel: 'in_app', enabled: false } });
      await send(LOCKED_TYPE);
      expect(phone.received()).toHaveLength(1);
    });

    it('push has no per-type switch of its own: PUT preferences with channel push → 409', async () => {
      const id = await approver('PushSwitch');
      await as(id, async () => {
        const res = await http(app)
          .put('/notifications/preferences')
          .send({ items: [{ type: TYPE, channel: 'push', enabled: false }] })
          .expect(409);
        expect(res.body.error).toBe(ErrorCode.CHANNEL_NOT_AVAILABLE);
      });
    });

    it('a device the push service says is gone (410) is dropped; the person’s other device still gets it', async () => {
      const id = await approver('TwoDevices');
      const keeps = push.browser('keeps');
      const gone = push.browser('gone');
      await subscribe(id, keeps);
      await subscribe(id, gone);
      gone.answer(410);
      await send(TYPE);
      expect(keeps.received()).toHaveLength(1);
      expect(await db.pushSubscription.findUnique({ where: { endpoint: gone.endpoint } })).toMatchObject({
        revokedAt: expect.any(Date),
        revokedReason: 'expired',
      });
      expect((await devicesOf(id)).devices.map((d) => d.endpointHash)).toEqual([endpointHash(keeps.endpoint)]);
      // Nothing is sent to it again.
      const before = push.requests.filter((r) => gone.endpoint.endsWith(r.path)).length;
      await send(TYPE);
      expect(push.requests.filter((r) => gone.endpoint.endsWith(r.path)).length).toBe(before);
    });

    it('a push service that is down → the delivery is retried later, the change itself committed', async () => {
      const id = await approver('Down');
      const phone = push.browser('down');
      await subscribe(id, phone);
      phone.answer(503);
      const subject = await send(TYPE);
      expect(
        await db.notificationItem.count({ where: { recipientId: id, entityId: subject.entityId } }),
      ).toBe(1);
      const [event] = await pushEventsFor(id);
      const delivery = await db.outboxDelivery.findFirst({ where: { eventId: event?.id } });
      expect(delivery).toMatchObject({ status: 'pending', attempts: 1, lastError: expect.stringContaining('503') });
    });
  });
});
