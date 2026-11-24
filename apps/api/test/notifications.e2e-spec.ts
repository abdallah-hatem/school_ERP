import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  ErrorCode,
  type AuditChange,
  type AuthUser,
  type NotificationItem,
  type NotificationPreferences,
  type NotificationSettings,
  type NotificationSubject,
  type NotificationTypeDefinition,
  type NotificationTypeKey,
} from '@school-erp/shared';
import { JobRunner } from '../src/core/jobs';
import {
  NOTIFICATIONS_PURGE_JOB,
  NoNotificationScopeResolverError,
  NotificationOutsideTransactionError,
  NotificationTypes,
  NotificationsService,
  type NotifyInput,
} from '../src/core/notifications';
import { DatabaseService } from '../src/database/database.service';
import { AfterCommit } from '../src/database/transactions';
import { http, unique } from './helpers';
import { createAppAsTestUser, giveRoles } from './helpers/as-test-user';
import { historyMark } from './helpers/history';
import { deleteEmployees } from './helpers/employees';

/*
 * core/notifications (N1, plan docs/plans/2026-11-18-notifications-plan.md → N1 edge cases). No
 * module sends yet (N2 / N3), so a test-only type exercises the mechanism: recipients by permission
 * and scope, dedupe, grouping, resolve, the access re-check on read, preferences and school
 * defaults, read state, retention — against the real database.
 *
 * The test type needs `hr.penalties.approve` (a row-scoped key) and is about `e2e_subject` records,
 * whose scope resolver is the `covers` map below. Other suites' users who hold the key (System
 * admins) receive it too, so counts are checked per user of this suite.
 */

const TYPE = 'core.e2e.thing_waiting' as NotificationTypeKey;
const LOCKED_TYPE = 'core.e2e.must_see' as NotificationTypeKey;
const ENTITY = 'e2e_subject';

const definition = (canTurnOff: boolean): NotificationTypeDefinition => ({
  module: 'core',
  category: canTurnOff ? 'reminder' : 'approval',
  canTurnOff,
  defaultChannels: ['in_app'],
  permission: 'hr.penalties.approve',
  dedupePrefix: 'e2e',
  link: (s) => ({ screen: 'employee', recordId: s.entityId }),
});

/** Which subject employees a scoped approver (by their linked employee) covers. */
const covers = new Map<string, Set<string>>();

describe('Notifications — core mechanism (e2e)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let user: AuthUser;
  let notifications: NotificationsService;
  let afterCommit: AfterCommit;
  let stageId: string;
  let departmentId: string;
  let jobTitleId: string;
  const users: string[] = [];
  const employees: string[] = [];
  const roles: string[] = [];

  /** Runs `fn` with the API signed in as `id`. */
  async function as<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const me = user.id;
    user.id = id;
    try {
      return await fn();
    } finally {
      user.id = me;
    }
  }

  const send = (
    input: Partial<NotifyInput> & { dedupeKey: string; subject: NotificationSubject },
  ) => afterCommit.transaction(() => notifications.notify({ type: TYPE, params: {}, ...input }));

  const subject = (employeeId: string | null = null): NotificationSubject => ({
    entityType: ENTITY,
    entityId: randomUUID(),
    employeeId,
  });

  const newUser = async (
    label: string,
    roleKeys: string[] = [],
    employeeId: string | null = null,
  ) => {
    const id = (
      await db.user.create({
        data: {
          email: `${unique(label)}@example.test`,
          name: label,
          passwordHash: 'x',
          employeeId,
        },
        select: { id: true },
      })
    ).id;
    users.push(id);
    if (roleKeys.length > 0) await giveRoles(db, id, roleKeys);
    return id;
  };

  /** A custom role granting `hr.penalties.approve` at a scope. */
  const scopedRole = async (scope: 'own_stage' | 'own_team') => {
    const role = await db.role.create({
      data: {
        key: unique('custom_e2e_notif'),
        nameEn: unique('Notif approver'),
        nameAr: unique('معتمد'),
        permissions: { create: [{ permissionKey: 'hr.penalties.approve', scope }] },
      },
      select: { id: true, key: true },
    });
    roles.push(role.id);
    return role.key;
  };

  const employee = async () => {
    const id = (
      await http(app)
        .post('/hr/employees')
        .send({
          nameEn: unique('Notif'),
          nameAr: unique('إشعار'),
          gender: 'FEMALE',
          dateOfBirth: '1990-01-01',
          phone: '01000000000',
          hireDate: '2015-09-01',
          stageId,
          departmentId,
          jobTitleId,
          workSystem: 'FULL_TIME',
          basicSalary: 1_000_000,
        })
        .expect(201)
    ).body.data.id as string;
    employees.push(id);
    return id;
  };

  const rowsOf = (userId: string, type: string = TYPE) =>
    db.notification.findMany({
      where: { recipientKind: 'user', recipientId: userId, type },
      include: { items: true, deliveries: true },
      orderBy: { createdAt: 'asc' },
    });

  const list = (userId: string, query = '') =>
    as(userId, async () => (await http(app).get(`/notifications${query}`).expect(200)).body);
  const count = (userId: string) =>
    as(
      userId,
      async () =>
        (await http(app).get('/notifications/unread-count').expect(200)).body.data.count as number,
    );
  const mine = async (userId: string): Promise<NotificationItem[]> =>
    ((await list(userId, '?limit=50')).data as NotificationItem[]).filter(
      (n) => n.type === TYPE || n.type === LOCKED_TYPE,
    );

  beforeAll(async () => {
    ({ app, user } = await createAppAsTestUser());
    db = app.get(DatabaseService);
    notifications = app.get(NotificationsService);
    afterCommit = app.get(AfterCommit);
    const types = app.get(NotificationTypes);
    types.register(TYPE, definition(true));
    types.register(LOCKED_TYPE, definition(false));
    notifications.registerScopeResolver(ENTITY, (scope, subjects) =>
      Promise.resolve(
        subjects.map((s) => covers.get(scope.employeeId ?? '')?.has(s.employeeId ?? '') ?? false),
      ),
    );
    stageId = (
      await db.stage.create({ data: { nameEn: unique('Stage'), nameAr: unique('مرحلة') } })
    ).id;
    const mk = async (path: string) =>
      (
        await http(app)
          .post(path)
          .send({ nameEn: unique('x'), nameAr: unique('س') })
          .expect(201)
      ).body.data.id as string;
    departmentId = await mk('/hr/departments');
    jobTitleId = await mk('/hr/job-titles');
  });

  afterAll(async () => {
    await db.notification.deleteMany({ where: { type: { in: [TYPE, LOCKED_TYPE] } } });
    await db.notificationDefault.deleteMany({ where: { type: { in: [TYPE, LOCKED_TYPE] } } });
    await db.notificationPreference.deleteMany({ where: { userId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.role.deleteMany({ where: { id: { in: roles } } });
    await deleteEmployees(db, { where: { id: { in: employees } } });
    await db.department.deleteMany({ where: { id: departmentId } });
    await db.jobTitle.deleteMany({ where: { id: jobTitleId } });
    await db.stage.deleteMany({ where: { id: stageId } });
    await app.close();
  });

  describe('sending (N4, N5, N8, N9)', () => {
    it('writes one item per holder in the caller’s transaction, with an in-app delivery marked sent', async () => {
      const approver = await newUser('Approver', ['principal']);
      const s = subject();
      const { created } = await send({
        subject: s,
        dedupeKey: `e2e:${s.entityId}`,
        params: { who: { en: 'Omar', ar: 'عمر' } },
      });
      expect(created).toBeGreaterThanOrEqual(2); // the approver and the test user (System admin), at least
      const [row] = await rowsOf(approver);
      expect(row?.items).toHaveLength(1);
      expect(row?.items[0]).toMatchObject({
        entityType: ENTITY,
        entityId: s.entityId,
        dedupeKey: `e2e:${s.entityId}`,
      });
      // Values, never a sentence (N3, edge case 23): both names stored.
      expect(row?.items[0]?.params).toEqual({ who: { en: 'Omar', ar: 'عمر' } });
      expect(row?.deliveries).toEqual([
        expect.objectContaining({ channel: 'in_app', status: 'sent', sentAt: expect.any(Date) }),
      ]);
    });

    it('a rolled-back change leaves no notification and no delivery (edge case 1)', async () => {
      const approver = await newUser('Rollback', ['principal']);
      const s = subject();
      await expect(
        afterCommit.transaction(async () => {
          await notifications.notify({ type: TYPE, subject: s, dedupeKey: `e2e:${s.entityId}` });
          throw new Error('the change failed');
        }),
      ).rejects.toThrow('the change failed');
      expect(await rowsOf(approver)).toEqual([]);
      expect(await db.notificationItem.count({ where: { entityId: s.entityId } })).toBe(0);
    });

    it('throws outside a transaction (edge case 2)', async () => {
      const s = subject();
      await expect(
        notifications.notify({ type: TYPE, subject: s, dedupeKey: 'e2e:x' }),
      ).rejects.toBeInstanceOf(NotificationOutsideTransactionError);
    });

    it('the same item twice → one row; the second call reports created: 0 (edge case 3)', async () => {
      const approver = await newUser('Twice', ['principal']);
      const s = subject();
      await send({ subject: s, dedupeKey: `e2e:${s.entityId}` });
      expect(await send({ subject: s, dedupeKey: `e2e:${s.entityId}` })).toEqual({ created: 0 });
      expect((await rowsOf(approver)).flatMap((r) => r.items)).toHaveLength(1);
    });

    it('two transactions with the same dedupe key at once → one row, neither fails (edge case 4)', async () => {
      const approver = await newUser('Race', ['principal']);
      // Same group: the group lock makes them take turns.
      const s1 = subject();
      const k1 = `e2e:${s1.entityId}`;
      await Promise.all([
        send({ subject: s1, dedupeKey: k1 }),
        send({ subject: s1, dedupeKey: k1 }),
      ]);
      // Different groups: the unique dedupe index decides; the loser drops the notification it made.
      const s2 = subject();
      const k2 = `e2e:${s2.entityId}`;
      const results = await Promise.all([
        send({ subject: s2, dedupeKey: k2, groupKey: unique('g') }),
        send({ subject: s2, dedupeKey: k2, groupKey: unique('g') }),
      ]);
      expect(results.every((r) => r.created >= 0)).toBe(true);
      const rows = await rowsOf(approver);
      for (const s of [s1, s2]) {
        expect(rows.flatMap((r) => r.items).filter((i) => i.entityId === s.entityId)).toHaveLength(
          1,
        );
      }
      // No empty notification left behind.
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.items.length === 1)).toBe(true);
    });

    it('scopes: widest wins, scoped holders get only covered subjects, unlinked scoped users nothing (edges 5, 6)', async () => {
      const [inEmp, outEmp, subjectEmp] = [await employee(), await employee(), await employee()];
      covers.set(inEmp, new Set([subjectEmp]));
      const stageRole = await scopedRole('own_stage');
      const teamRole = await scopedRole('own_team');
      const inside = await newUser('Inside', [stageRole], inEmp);
      const outside = await newUser('Outside', [stageRole], outEmp);
      const unlinked = await newUser('Unlinked', [stageRole]);
      // own_team plus principal's `all`: treated as all, though nothing covers them as a team.
      const both = await newUser('Both', [teamRole, 'principal'], null);

      const s = subject(subjectEmp);
      await send({ subject: s, dedupeKey: `e2e:${s.entityId}` });
      expect(await rowsOf(inside)).toHaveLength(1);
      expect(await rowsOf(outside)).toHaveLength(0);
      expect(await rowsOf(unlinked)).toHaveLength(0);
      expect(await rowsOf(both)).toHaveLength(1);
    });

    it('a deactivated user, the person who caused it, and nobody at all (edges 7, 8, 9)', async () => {
      const inactive = await newUser('Inactive', ['principal']);
      await db.user.update({ where: { id: inactive }, data: { isActive: false } });
      const actor = await newUser('Actor', ['principal']);
      const s = subject();
      // A group of its own: an item joining an earlier open group keeps that group's first actor.
      await send({ subject: s, dedupeKey: `e2e:${s.entityId}`, actorId: actor, groupKey: unique('actor') });
      expect(await rowsOf(inactive)).toHaveLength(0);
      expect(await rowsOf(actor)).toHaveLength(0);
      const item = await db.notificationItem.findFirst({
        where: { entityId: s.entityId },
        include: { notification: true },
      });
      expect(item?.notification.actorId).toBe(actor);
    });

    it('a scoped recipient and no resolver for the subject’s type → throws, nothing written (edge case 10)', async () => {
      const emp = await employee();
      await newUser('NoResolver', [await scopedRole('own_stage')], emp);
      const s = { entityType: 'e2e_unregistered', entityId: randomUUID(), employeeId: emp };
      await expect(send({ subject: s, dedupeKey: `e2e:${s.entityId}` })).rejects.toBeInstanceOf(
        NoNotificationScopeResolverError,
      );
      expect(await db.notificationItem.count({ where: { entityId: s.entityId } })).toBe(0);
    });
  });

  describe('grouping and resolve (N10, N17)', () => {
    it('items of one group join the unread notification; after it is read, the next starts a new one (edge 26)', async () => {
      const approver = await newUser('Grouped', ['principal']);
      const group = unique('day');
      for (let i = 0; i < 3; i++) {
        const s = subject();
        await send({
          subject: s,
          dedupeKey: `e2e:${s.entityId}`,
          groupKey: group,
          params: { n: i },
        });
      }
      let views = await mine(approver);
      expect(views).toHaveLength(1);
      expect(views[0]).toMatchObject({
        openCount: 3,
        params: { count: 3 },
        link: null,
        readAt: null,
      });
      expect(await count(approver)).toBe(1);

      await as(approver, () => http(app).post(`/notifications/${views[0]?.id}/read`).expect(200));
      const s = subject();
      await send({ subject: s, dedupeKey: `e2e:${s.entityId}`, groupKey: group });
      views = await mine(approver);
      expect(views).toHaveLength(2);
      expect(views[0]).toMatchObject({
        openCount: 1,
        readAt: null,
        link: { screen: 'employee', recordId: s.entityId },
      });
      expect(await count(approver)).toBe(1);
    });

    it('resolve() marks every recipient’s item with who did it; the last open item resolves the group (edges 13, 14, 28)', async () => {
      const a = await newUser('ResolveA', ['principal']);
      const b = await newUser('ResolveB', ['principal']);
      const resolver = await newUser('Laila Hassan');
      const group = unique('day');
      const [s1, s2] = [subject(), subject()];
      await send({ subject: s1, dedupeKey: `e2e:${s1.entityId}`, groupKey: group });
      await send({ subject: s2, dedupeKey: `e2e:${s2.entityId}`, groupKey: group });

      const first = await afterCommit.transaction(() =>
        notifications.resolve({
          type: TYPE,
          subject: s1,
          resolution: 'approved',
          byUserId: resolver,
        }),
      );
      expect(first.resolved).toBeGreaterThanOrEqual(2);
      for (const id of [a, b]) {
        const [view] = await mine(id);
        expect(view).toMatchObject({ openCount: 1, resolved: null });
        expect(view?.items.find((i) => i.resolved)?.resolved).toMatchObject({
          by: { en: 'Laila Hassan', ar: 'Laila Hassan' },
          resolution: 'approved',
        });
        expect(await count(id)).toBe(1);
        expect((await list(id, '?status=unread')).meta.total).toBe(1);
      }
      await afterCommit.transaction(() =>
        notifications.resolve({ type: TYPE, subject: s2, resolution: 'cancelled' }),
      );
      for (const id of [a, b]) {
        const [view] = await mine(id);
        expect(view).toMatchObject({ openCount: 0, resolved: { resolution: 'done', by: null } });
        expect(await count(id)).toBe(0);
        // Unread lists what the bell counts: done and never read, it is in All only (N5 check).
        expect(view?.readAt).toBeNull();
        expect((await list(id, '?status=unread')).meta.total).toBe(0);
        expect((await list(id)).meta.total).toBe(1);
      }
      // Nothing open → 0, no error.
      expect(
        await afterCommit.transaction(() =>
          notifications.resolve({ type: TYPE, subject: s2, resolution: 'done' }),
        ),
      ).toEqual({ resolved: 0 });
    });
  });

  describe('reading (N11, contract)', () => {
    it('losing the permission hides the notification from list and count; the row stays; opening it is 404 (edge 11)', async () => {
      const approver = await newUser('Loses', ['principal']);
      const s = subject();
      await send({ subject: s, dedupeKey: `e2e:${s.entityId}` });
      const [view] = await mine(approver);
      expect(await count(approver)).toBe(1);

      await db.userRoleAssignment.deleteMany({ where: { userId: approver } });
      expect(await mine(approver)).toEqual([]);
      expect(await count(approver)).toBe(0);
      expect(await rowsOf(approver)).toHaveLength(1);
      await as(approver, () => http(app).post(`/notifications/${view?.id}/read`).expect(404));
      // New ones don't reach them either.
      const s2 = subject();
      await send({ subject: s2, dedupeKey: `e2e:${s2.entityId}` });
      expect(await rowsOf(approver)).toHaveLength(1);
    });

    it('a scope change hides the items now outside it; a group keeps only the visible ones (edges 12, 19, 27)', async () => {
      const [mgr, e1, e2] = [await employee(), await employee(), await employee()];
      covers.set(mgr, new Set([e1, e2]));
      const approver = await newUser('Scoped', [await scopedRole('own_stage')], mgr);
      const group = unique('day');
      const [s1, s2] = [subject(e1), subject(e2)];
      await send({ subject: s1, dedupeKey: `e2e:${s1.entityId}`, groupKey: group });
      await send({ subject: s2, dedupeKey: `e2e:${s2.entityId}`, groupKey: group });
      expect((await mine(approver))[0]).toMatchObject({ openCount: 2, params: { count: 2 } });

      covers.set(mgr, new Set([e2]));
      const [view] = await mine(approver);
      expect(view?.items.map((i) => i.link?.recordId)).toEqual([s2.entityId]);
      expect(view).toMatchObject({ openCount: 1, params: { count: 1 } });
      expect(await count(approver)).toBe(1);

      covers.set(mgr, new Set());
      expect(await mine(approver)).toEqual([]);
      expect(await count(approver)).toBe(0);
    });

    it('another person’s notification → 404 on read and unread; an unknown id → 404 (edge 15)', async () => {
      const owner = await newUser('Owner', ['principal']);
      const other = await newUser('Other', ['principal']);
      const s = subject();
      await send({ subject: s, dedupeKey: `e2e:${s.entityId}` });
      const [view] = await mine(owner);
      await as(other, async () => {
        await http(app).post(`/notifications/${view?.id}/read`).expect(404);
        await http(app).post(`/notifications/${view?.id}/unread`).expect(404);
        await http(app).post(`/notifications/${randomUUID()}/read`).expect(404);
      });
      expect((await mine(owner))[0]?.readAt).toBeNull();
    });

    it('read / unread toggle; read-all marks only those up to the moment sent (edge 16)', async () => {
      const approver = await newUser('ReadAll', ['principal']);
      const s1 = subject();
      await send({ subject: s1, dedupeKey: `e2e:${s1.entityId}`, groupKey: unique('a') });
      const [one] = await mine(approver);
      const read = await as(approver, () =>
        http(app).post(`/notifications/${one?.id}/read`).expect(200),
      );
      expect((read.body.data as NotificationItem).readAt).not.toBeNull();
      const unread = await as(approver, () =>
        http(app).post(`/notifications/${one?.id}/unread`).expect(200),
      );
      expect((unread.body.data as NotificationItem).readAt).toBeNull();

      const upTo = new Date().toISOString();
      await new Promise((r) => setTimeout(r, 20));
      const s2 = subject();
      await send({ subject: s2, dedupeKey: `e2e:${s2.entityId}`, groupKey: unique('b') });
      await as(approver, () =>
        http(app).post('/notifications/read-all').send({ upTo }).expect(200),
      );
      const views = await mine(approver);
      expect(views.find((v) => v.id === one?.id)?.readAt).not.toBeNull();
      expect(views.filter((v) => v.readAt === null)).toHaveLength(1);
      await as(approver, () =>
        http(app).post('/notifications/read-all').send({ upTo: 'yesterday' }).expect(400),
      );
    });

    it('lists newest first, paged (≤ 50), filtered by status and category; the count is the real number over 99 (edge 21)', async () => {
      const approver = await newUser('Many', ['principal']);
      const now = Date.now();
      for (let i = 0; i < 101; i++) {
        await db.notification.create({
          data: {
            type: TYPE,
            recipientKind: 'user',
            recipientId: approver,
            groupKey: `bulk-${i}`,
            createdAt: new Date(now - i * 1000),
            updatedAt: new Date(now - i * 1000),
            items: {
              create: [
                {
                  recipientKind: 'user',
                  recipientId: approver,
                  type: TYPE,
                  entityType: ENTITY,
                  entityId: randomUUID(),
                  dedupeKey: `bulk:${i}`,
                },
              ],
            },
          },
        });
      }
      expect(await count(approver)).toBe(101);
      const page = await list(approver, '?page=2&limit=50&status=unread');
      expect(page.meta).toMatchObject({
        total: 101,
        page: 2,
        limit: 50,
        hasNextPage: true,
        hasPreviousPage: true,
      });
      const times = (page.data as NotificationItem[]).map((n) => Date.parse(n.updatedAt));
      expect(times).toEqual([...times].sort((a, b) => b - a));
      expect((await list(approver, '?category=approval')).meta.total).toBe(0);
      expect((await list(approver, '?category=reminder&limit=1')).meta.total).toBe(101);
      await as(approver, () => http(app).get('/notifications?limit=51').expect(400));
      await as(approver, () => http(app).get('/notifications?status=old').expect(400));
    });
  });

  describe('preferences and school defaults (N13)', () => {
    it('GET lists only types the person can receive (edge 20)', async () => {
      const nobody = await newUser('NoKeys');
      const prefs = await as(
        nobody,
        async () =>
          (await http(app).get('/notifications/preferences').expect(200)).body
            .data as NotificationPreferences,
      );
      expect(prefs.types).toEqual([]);
      // Push is a channel too (2026-11-21), live only with VAPID keys — none in this suite.
      expect(prefs.channels).toEqual([
        { channel: 'in_app', available: true },
        { channel: 'push', available: false },
      ]);
      const approver = await newUser('Prefs', ['principal']);
      const theirs = await as(
        approver,
        async () =>
          (await http(app).get('/notifications/preferences').expect(200)).body
            .data as NotificationPreferences,
      );
      expect(theirs.types.map((t) => t.type)).toEqual(
        expect.arrayContaining([TYPE, LOCKED_TYPE, 'hr.penalty.awaiting_approval']),
      );
      expect(theirs.types.map((t) => t.type)).not.toContain('hr.payroll.ready_to_approve');
    });

    it('turning a type off stops new ones for that person only; null goes back to the default; audited (edges 17, 18, 25)', async () => {
      const off = await newUser('TurnsOff', ['principal']);
      const on = await newUser('StaysOn', ['principal']);
      const mark = await historyMark(db);
      await as(off, () =>
        http(app)
          .put('/notifications/preferences')
          .send({ items: [{ type: TYPE, channel: 'in_app', enabled: false }] })
          .expect(200),
      );
      const s = subject();
      await send({ subject: s, dedupeKey: `e2e:${s.entityId}` });
      expect(await rowsOf(off)).toHaveLength(0);
      expect(await rowsOf(on)).toHaveLength(1);

      const entries = await db.auditEntry.findMany({
        where: { seq: { gt: mark }, action: 'core.notification_preferences.update', entityId: off },
      });
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ entityType: 'notification_preferences', actorId: off });
      expect(entries[0]?.changes as unknown as AuditChange[]).toEqual([
        { field: `${TYPE}:in_app`, before: null, after: false },
      ]);

      const back = await as(
        off,
        async () =>
          (
            await http(app)
              .put('/notifications/preferences')
              .send({ items: [{ type: TYPE, channel: 'in_app', enabled: null }] })
              .expect(200)
          ).body.data as NotificationPreferences,
      );
      expect(back.types.find((t) => t.type === TYPE)?.channels[0]).toMatchObject({
        enabled: true,
        personal: null,
      });
      expect(await db.notificationPreference.count({ where: { userId: off } })).toBe(0);
      const s2 = subject();
      await send({ subject: s2, dedupeKey: `e2e:${s2.entityId}` });
      expect(await rowsOf(off)).toHaveLength(1);
    });

    it('refuses: a required type off (409), another channel (409), an unknown type (400), a bad body (400) — nothing written (edge 17)', async () => {
      const approver = await newUser('Refused', ['principal']);
      const mark = await historyMark(db);
      await as(approver, async () => {
        const required = await http(app)
          .put('/notifications/preferences')
          .send({ items: [{ type: LOCKED_TYPE, channel: 'in_app', enabled: false }] })
          .expect(409);
        expect(required.body.error).toBe(ErrorCode.NOTIFICATION_TYPE_REQUIRED);
        const channel = await http(app)
          .put('/notifications/preferences')
          .send({ items: [{ type: TYPE, channel: 'email', enabled: true }] })
          .expect(409);
        expect(channel.body.error).toBe(ErrorCode.CHANNEL_NOT_AVAILABLE);
        await http(app)
          .put('/notifications/preferences')
          .send({ items: [{ type: 'hr.nope.nothing', channel: 'in_app', enabled: true }] })
          .expect(400);
        await http(app)
          .put('/notifications/preferences')
          .send({ items: [{ type: TYPE, channel: 'in_app', enabled: 'yes' }] })
          .expect(400);
      });
      expect(await db.notificationPreference.count({ where: { userId: approver } })).toBe(0);
      expect(
        await db.auditEntry.count({
          where: { seq: { gt: mark }, action: 'core.notification_preferences.update' },
        }),
      ).toBe(0);
    });

    it('a school default applies to people with no choice of their own, from the next send (edge 19)', async () => {
      const follows = await newUser('Follows', ['principal']);
      const chose = await newUser('Chose', ['principal']);
      await as(chose, () =>
        http(app)
          .put('/notifications/preferences')
          .send({ items: [{ type: TYPE, channel: 'in_app', enabled: true }] })
          .expect(200),
      );
      await http(app)
        .put('/settings/notifications')
        .send({ defaults: [{ type: TYPE, channel: 'in_app', enabled: false }] })
        .expect(200);
      try {
        const s = subject();
        await send({ subject: s, dedupeKey: `e2e:${s.entityId}` });
        expect(await rowsOf(follows)).toHaveLength(0);
        expect(await rowsOf(chose)).toHaveLength(1);
      } finally {
        await http(app)
          .put('/settings/notifications')
          .send({ defaults: [{ type: TYPE, channel: 'in_app', enabled: true }] })
          .expect(200);
      }
    });

    it('Settings → Notifications: the HR manager reads it, PUT is 403; the System admin saves one entry with only what changed (edges 25, 29)', async () => {
      const hrManager = await newUser('HrManager', ['hr_manager']);
      const nobody = await newUser('NoSettings');
      const before = await as(
        hrManager,
        async () =>
          (await http(app).get('/settings/notifications').expect(200)).body
            .data as NotificationSettings,
      );
      expect(before.retention).toEqual({ readDays: 90, resolvedDays: 30, maxDays: 365 });
      expect(before.defaults.find((d) => d.type === LOCKED_TYPE)).toMatchObject({
        enabled: true,
        locked: true,
      });
      await as(hrManager, () =>
        http(app)
          .put('/settings/notifications')
          .send({ retention: { readDays: 10 } })
          .expect(403),
      );
      await as(nobody, () => http(app).get('/settings/notifications').expect(403));

      const mark = await historyMark(db);
      try {
        const saved = (
          await http(app)
            .put('/settings/notifications')
            .send({
              retention: { readDays: 60, maxDays: 365 },
              defaults: [{ type: TYPE, channel: 'in_app', enabled: true }],
            })
            .expect(200)
        ).body.data as NotificationSettings;
        expect(saved.retention).toEqual({ readDays: 60, resolvedDays: 30, maxDays: 365 });
        const entries = await db.auditEntry.findMany({
          where: { seq: { gt: mark }, action: 'core.notification_settings.update' },
        });
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({ entityType: 'notification_settings', actorId: user.id });
        expect(entries[0]?.changes as unknown as AuditChange[]).toEqual([
          { field: 'notifications.retention.readDays', before: 90, after: 60 },
        ]);
        await http(app)
          .put('/settings/notifications')
          .send({ retention: { readDays: 0 } })
          .expect(400);
        await http(app)
          .put('/settings/notifications')
          .send({ retention: { maxDays: 3651 } })
          .expect(400);
        await http(app)
          .put('/settings/notifications')
          .send({ defaults: [{ type: LOCKED_TYPE, channel: 'in_app', enabled: false }] })
          .expect(409);
      } finally {
        await http(app)
          .put('/settings/notifications')
          .send({ retention: { readDays: 90 } })
          .expect(200);
      }
    });

    it('reading and marking read write no audit entry (edge 25)', async () => {
      const approver = await newUser('NoAudit', ['principal']);
      const s = subject();
      await send({ subject: s, dedupeKey: `e2e:${s.entityId}` });
      const mark = await historyMark(db);
      const [view] = await mine(approver);
      await as(approver, async () => {
        await http(app).post(`/notifications/${view?.id}/read`).expect(200);
        await http(app).post(`/notifications/${view?.id}/unread`).expect(200);
        await http(app)
          .post('/notifications/read-all')
          .send({ upTo: new Date().toISOString() })
          .expect(200);
      });
      expect(await db.auditEntry.count({ where: { seq: { gt: mark }, actorId: approver } })).toBe(
        0,
      );
    });
  });

  describe('retention (N14, edge 22)', () => {
    it('the nightly purge deletes read > 90 days, resolved > 30 days and any > 365 days, with items and deliveries', async () => {
      const owner = await newUser('Purge');
      const day = 24 * 60 * 60 * 1000;
      const ago = (days: number) => new Date(Date.now() - days * day);
      const make = async (
        label: string,
        data: { createdAt: Date; readAt?: Date; resolvedAt?: Date },
      ) =>
        (
          await db.notification.create({
            data: {
              type: TYPE,
              recipientKind: 'user',
              recipientId: owner,
              groupKey: label,
              createdAt: data.createdAt,
              updatedAt: data.createdAt,
              readAt: data.readAt ?? null,
              resolvedAt: data.resolvedAt ?? null,
              items: {
                create: [
                  {
                    recipientKind: 'user',
                    recipientId: owner,
                    type: TYPE,
                    entityType: ENTITY,
                    entityId: label,
                    dedupeKey: label,
                  },
                ],
              },
              deliveries: {
                create: [{ channel: 'in_app', status: 'sent', sentAt: data.createdAt }],
              },
            },
            select: { id: true },
          })
        ).id;
      const readOld = await make('read-old', { createdAt: ago(200), readAt: ago(91) });
      const readRecent = await make('read-recent', { createdAt: ago(200), readAt: ago(89) });
      const resolvedOld = await make('resolved-old', { createdAt: ago(40), resolvedAt: ago(31) });
      const resolvedRecent = await make('resolved-recent', {
        createdAt: ago(40),
        resolvedAt: ago(29),
      });
      const ancient = await make('ancient', { createdAt: ago(366) });
      const unread = await make('unread', { createdAt: ago(300) });

      expect(await app.get(JobRunner).run(NOTIFICATIONS_PURGE_JOB)).toBe('success');
      const left = (
        await db.notification.findMany({ where: { recipientId: owner }, select: { id: true } })
      ).map((r) => r.id);
      expect(left.sort()).toEqual([readRecent, resolvedRecent, unread].sort());
      for (const gone of [readOld, resolvedOld, ancient]) {
        expect(await db.notificationItem.count({ where: { notificationId: gone } })).toBe(0);
        expect(await db.notificationDelivery.count({ where: { notificationId: gone } })).toBe(0);
      }
      const runs = await db.jobRun.findMany({
        where: { jobName: NOTIFICATIONS_PURGE_JOB },
        orderBy: { startedAt: 'desc' },
        take: 1,
      });
      expect(runs[0]?.status).toBe('success');
    });
  });
});
