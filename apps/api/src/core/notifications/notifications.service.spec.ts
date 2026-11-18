import type { TransactionHost } from '@nestjs-cls/transactional';
import type { NotificationTypeDefinition, NotificationTypeKey } from '@school-erp/shared';
import type { DbAdapter } from '../../database/transactions';
import type { PermissionsService, UserScope } from '../permissions';
import { InAppChannel, NotificationChannels } from './channels';
import { NotificationAccess } from './notification-access.service';
import { NoNotificationScopeResolverError, NotificationScopes } from './notification-scope';
import { NotificationTypes, UnknownNotificationTypeError } from './notification-types';
import { NotificationOutsideTransactionError, NotificationsService } from './notifications.service';
import type { StoredNotification } from './notifications.pure';
import type { NotificationPreferencesRepository } from './repositories/notification-preferences.repository';
import type { NotificationsRepository } from './repositories/notifications.repository';
import type { RecipientsRepository } from './repositories/recipients.repository';

/*
 * core/notifications' send path with every collaborator mocked: who receives (N5), preferences
 * (N13), dedupe (N9), grouping (N17), resolve (N10). The database behaviour (unique index, locks,
 * rollback) is covered by test/notifications.e2e-spec.ts.
 */

const TEST_TYPE = 'core.test.thing_waiting' as NotificationTypeKey;
const TEST_DEFINITION: NotificationTypeDefinition = {
  module: 'core',
  category: 'reminder',
  canTurnOff: true,
  defaultChannels: ['in_app'],
  permission: 'hr.penalties.approve',
  dedupePrefix: 'test',
  link: (s) => ({ screen: 'employee', recordId: s.entityId }),
};
const SUBJECT = { entityType: 'test_subject', entityId: 's-1', employeeId: 'e-1' };

const all = (): UserScope => ({ scope: 'all', employeeId: null, stageId: null });
const stage = (employeeId: string | null): UserScope => ({
  scope: 'own_stage',
  employeeId,
  stageId: 'st-1',
});

function make(
  opts: {
    inTransaction?: boolean;
    holders?: string[];
    scopes?: Record<string, UserScope | null>;
    defaults?: { type: string; channel: string; enabled: boolean }[];
    choices?: { userId: string; type: string; channel: string; enabled: boolean }[];
    existing?: Set<string>;
    openGroup?: string | null;
    insertOk?: boolean;
  } = {},
) {
  const txHost = { isTransactionActive: jest.fn(() => opts.inTransaction ?? true) };
  const types = new NotificationTypes();
  types.register(TEST_TYPE, TEST_DEFINITION);
  const scopes = new NotificationScopes();
  const permissions = {
    scopeFor: jest.fn(({ id }: { id: string }): Promise<UserScope | null> =>
      Promise.resolve(opts.scopes && id in opts.scopes ? (opts.scopes[id] ?? null) : all()),
    ),
  };
  const recipients = {
    holdersOf: jest.fn(() => Promise.resolve(opts.holders ?? ['u-1', 'u-2'])),
    nameOf: jest.fn(() => Promise.resolve({ en: 'Laila Hassan', ar: 'ليلى حسن' })),
  };
  let n = 0;
  const notifications = {
    lock: jest.fn(() => Promise.resolve()),
    itemExists: jest.fn((to: { id: string }) =>
      Promise.resolve(opts.existing?.has(to.id) ?? false),
    ),
    findOpenGroup: jest.fn(() => Promise.resolve(opts.openGroup ?? null)),
    createNotification: jest.fn(() => Promise.resolve(`n-${++n}`)),
    insertItem: jest.fn(() => Promise.resolve(opts.insertOk ?? true)),
    touch: jest.fn(() => Promise.resolve()),
    deleteNotification: jest.fn(() => Promise.resolve()),
    resolve: jest.fn(() => Promise.resolve(3)),
  };
  const preferences = {
    defaults: jest.fn(() => Promise.resolve(opts.defaults ?? [])),
    choicesOf: jest.fn(() => Promise.resolve(opts.choices ?? [])),
  };
  const access = new NotificationAccess(
    permissions as unknown as PermissionsService,
    scopes,
    types,
    recipients as unknown as RecipientsRepository,
  );
  const service = new NotificationsService(
    txHost as unknown as TransactionHost<DbAdapter>,
    types,
    access,
    scopes,
    new NotificationChannels(new InAppChannel()),
    notifications as unknown as NotificationsRepository,
    preferences as unknown as NotificationPreferencesRepository,
    recipients as unknown as RecipientsRepository,
  );
  return { service, access, notifications, recipients, permissions, scopes, types };
}

const notify = (
  service: NotificationsService,
  extra: Partial<Parameters<NotificationsService['notify']>[0]> = {},
) =>
  service.notify({
    type: TEST_TYPE,
    subject: SUBJECT,
    dedupeKey: 'test:s-1',
    params: { n: 1 },
    ...extra,
  });

describe('NotificationsService.notify', () => {
  it('throws outside a transaction — never silently (edge case 2)', async () => {
    const { service, notifications } = make({ inTransaction: false });
    await expect(notify(service)).rejects.toBeInstanceOf(NotificationOutsideTransactionError);
    await expect(
      service.resolve({ type: TEST_TYPE, subject: SUBJECT, resolution: 'done' }),
    ).rejects.toBeInstanceOf(NotificationOutsideTransactionError);
    expect(notifications.createNotification).not.toHaveBeenCalled();
  });

  it('an unknown type is a programming error', async () => {
    const { service } = make();
    await expect(
      notify(service, { type: 'hr.nope.nothing' as NotificationTypeKey }),
    ).rejects.toBeInstanceOf(UnknownNotificationTypeError);
  });

  it('one item per holder; a new notification gets an in-app delivery marked sent (N8)', async () => {
    const { service, notifications } = make();
    expect(await notify(service, { groupKey: '2026-11-18' })).toEqual({ created: 2 });
    expect(notifications.createNotification).toHaveBeenCalledTimes(2);
    expect(notifications.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        to: { kind: 'user', id: 'u-1' },
        type: TEST_TYPE,
        groupKey: '2026-11-18',
        deliveries: [{ channel: 'in_app', status: 'sent' }],
      }),
    );
    expect(notifications.lock).toHaveBeenCalledWith(
      `notification:user:u-1:${TEST_TYPE}:2026-11-18`,
    );
  });

  it('the group key defaults to the school day: 22:30 UTC on 30 November is 1 December', async () => {
    const { service, notifications } = make({ holders: ['u-1'] });
    await notify(service, { now: new Date('2026-11-30T22:30:00Z') });
    expect(notifications.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ groupKey: '2026-12-01' }),
    );
  });

  it('the person who caused it is not told (edge case 8)', async () => {
    const { service, notifications } = make();
    expect(await notify(service, { actorId: 'u-1' })).toEqual({ created: 1 });
    expect(notifications.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ to: { kind: 'user', id: 'u-2' }, actorId: 'u-1' }),
    );
  });

  it('nobody holds the permission → nothing written, no error (edge case 9)', async () => {
    const { service, notifications } = make({ holders: [] });
    expect(await notify(service)).toEqual({ created: 0 });
    expect(notifications.lock).not.toHaveBeenCalled();
  });

  it('a repeat for a person (same dedupe key) writes nothing for them (edge case 3)', async () => {
    const { service, notifications } = make({ existing: new Set(['u-1']) });
    expect(await notify(service)).toEqual({ created: 1 });
    expect(notifications.createNotification).toHaveBeenCalledTimes(1);
  });

  it('joins the open, unread group instead of a new notification (edge case 26)', async () => {
    const { service, notifications } = make({ holders: ['u-1'], openGroup: 'n-open' });
    expect(await notify(service)).toEqual({ created: 1 });
    expect(notifications.createNotification).not.toHaveBeenCalled();
    expect(notifications.insertItem).toHaveBeenCalledWith(
      'n-open',
      { kind: 'user', id: 'u-1' },
      expect.objectContaining({ dedupeKey: 'test:s-1', employeeId: 'e-1' }),
      expect.any(Date),
    );
    expect(notifications.touch).toHaveBeenCalledWith('n-open', expect.any(Date));
  });

  it('lost the race for the dedupe key → the empty notification it made is dropped (edge case 4)', async () => {
    const { service, notifications } = make({ holders: ['u-1'], insertOk: false });
    expect(await notify(service)).toEqual({ created: 0 });
    expect(notifications.deleteNotification).toHaveBeenCalledWith('n-1');
  });

  it('a person who turned the type off in the app gets no notification; the school default applies to the rest (edges 18, 19)', async () => {
    const { service, notifications } = make({
      holders: ['u-1', 'u-2', 'u-3'],
      defaults: [{ type: TEST_TYPE, channel: 'in_app', enabled: false }],
      choices: [{ userId: 'u-3', type: TEST_TYPE, channel: 'in_app', enabled: true }],
    });
    expect(await notify(service)).toEqual({ created: 1 });
    expect(notifications.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ to: { kind: 'user', id: 'u-3' } }),
    );
  });

  it('scopes: all covers; a scoped holder is asked of the resolver; an unlinked one gets nothing (edges 5, 6)', async () => {
    const { service, notifications, scopes } = make({
      holders: ['u-all', 'u-in', 'u-out', 'u-unlinked'],
      scopes: { 'u-in': stage('e-in'), 'u-out': stage('e-out'), 'u-unlinked': stage(null) },
    });
    const resolver = jest.fn((scope: UserScope, subjects: readonly unknown[]) =>
      Promise.resolve(subjects.map(() => scope.employeeId === 'e-in')),
    );
    scopes.register('test_subject', resolver);
    expect(await notify(service)).toEqual({ created: 2 });
    const to = notifications.createNotification.mock.calls.map(
      (c) => (c as unknown as [{ to: { id: string } }])[0].to.id,
    );
    expect(to).toEqual(['u-all', 'u-in']);
    // Never asked for the unlinked user (R5) nor for the `all` one.
    expect(resolver).toHaveBeenCalledTimes(2);
  });

  it('a scoped holder and no resolver for the subject → throws, never "send to everyone" (edge case 10)', async () => {
    const { service, notifications } = make({ holders: ['u-1'], scopes: { 'u-1': stage('e-1') } });
    await expect(notify(service)).rejects.toBeInstanceOf(NoNotificationScopeResolverError);
    expect(notifications.createNotification).not.toHaveBeenCalled();
  });
});

describe('NotificationsService.resolve', () => {
  it('resolves every open item of the subject with who did it, as their name is now (edge case 13)', async () => {
    const { service, notifications, recipients } = make();
    const now = new Date('2026-11-18T09:00:00Z');
    expect(
      await service.resolve({
        type: TEST_TYPE,
        subject: SUBJECT,
        resolution: 'approved',
        byUserId: 'u-9',
        now,
      }),
    ).toEqual({ resolved: 3 });
    expect(recipients.nameOf).toHaveBeenCalledWith('u-9');
    expect(notifications.resolve).toHaveBeenCalledWith({
      type: TEST_TYPE,
      entityType: 'test_subject',
      entityId: 's-1',
      resolution: 'approved',
      byName: { en: 'Laila Hassan', ar: 'ليلى حسن' },
      now,
    });
  });

  it('no person → no name', async () => {
    const { service, notifications, recipients } = make();
    await service.resolve({ type: TEST_TYPE, subject: SUBJECT, resolution: 'done' });
    expect(recipients.nameOf).not.toHaveBeenCalled();
    expect(notifications.resolve).toHaveBeenCalledWith(expect.objectContaining({ byName: null }));
  });
});

describe('NotificationAccess.visibleItems (N11)', () => {
  const stored = (
    items: { id: string; type: string; entityType?: string }[],
  ): StoredNotification[] => [
    {
      id: 'n-1',
      type: TEST_TYPE,
      createdAt: new Date(),
      updatedAt: new Date(),
      readAt: null,
      resolvedAt: null,
      items: items.map((i) => ({
        id: i.id,
        type: i.type,
        entityType: i.entityType ?? 'test_subject',
        entityId: `s-${i.id}`,
        employeeId: `e-${i.id}`,
        params: {},
        createdAt: new Date(),
        resolvedAt: null,
        resolvedByName: null,
        resolution: null,
      })),
    },
  ];

  it('a reader who lost the permission sees none of it (edge case 11)', async () => {
    const { access } = make({ scopes: { 'u-1': null } });
    expect(
      await access.visibleItems({ id: 'u-1' }, stored([{ id: 'a', type: TEST_TYPE }])),
    ).toEqual(new Set());
  });

  it('a scoped reader sees only the items their scope still covers (edge case 12)', async () => {
    const { access, scopes } = make({ scopes: { 'u-1': stage('e-me') } });
    scopes.register('test_subject', (_scope, subjects) =>
      Promise.resolve(subjects.map((s) => s.employeeId === 'e-b')),
    );
    const visible = await access.visibleItems(
      { id: 'u-1' },
      stored([
        { id: 'a', type: TEST_TYPE },
        { id: 'b', type: TEST_TYPE },
      ]),
    );
    expect(visible).toEqual(new Set(['b']));
  });

  it('fails closed: no resolver, or a type the code no longer knows → hidden, not an error', async () => {
    const { access } = make({ scopes: { 'u-1': stage('e-me') } });
    expect(
      await access.visibleItems(
        { id: 'u-1' },
        stored([
          { id: 'a', type: TEST_TYPE },
          { id: 'b', type: 'hr.gone.away' },
        ]),
      ),
    ).toEqual(new Set());
  });
});
