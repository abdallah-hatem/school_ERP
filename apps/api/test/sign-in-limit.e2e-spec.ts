import { INestApplication } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ErrorCode, type AuditChange, type AuthUser, type UserAccount } from '@school-erp/shared';
import { hashPassword } from '../src/common/utils/password.util';
import { JobRunner } from '../src/core/jobs';
import { LOGIN_ATTEMPTS_CLEANUP_JOB } from '../src/core/sign-in-limit';
import { DatabaseService } from '../src/database/database.service';
import { http, unique } from './helpers';
import { ANONYMOUS_HEADER, createAppAsTestUser, giveRoles } from './helpers/as-test-user';
import { historyMark } from './helpers/history';

/*
 * Sign-in limits (owner 2026-11-18) and the scheduled-jobs foundation, against the real database:
 * 5 wrong passwords in 15 minutes lock that account's sign-in for 15 minutes, per lower-cased
 * email (an unknown one too), refused with 429 before any password is checked; a correct sign-in
 * clears the count; a System admin can unlock early; both password-change paths are limited; the
 * nightly clean-up deletes only stale rows.
 */

const PASSWORD = 'right-password-123';
const MINUTE = 60_000;

describe('sign-in limit and scheduled jobs (e2e)', () => {
  let app: INestApplication;
  let user: AuthUser;
  let db: DatabaseService;
  const userIds: string[] = [];
  const emails: string[] = [];

  async function makeUser(opts: { roles?: string[]; mustChangePassword?: boolean } = {}) {
    const email = `${unique('limit')}@school.test`.toLowerCase();
    const row = await db.user.create({
      data: {
        email,
        name: unique('Limited'),
        passwordHash: await hashPassword(PASSWORD, 4),
        mustChangePassword: opts.mustChangePassword ?? false,
      },
    });
    userIds.push(row.id);
    emails.push(email);
    if (opts.roles?.length) await giveRoles(db, row.id, opts.roles);
    return row;
  }

  const login = (email: string, password: string, lang = 'en') =>
    http(app)
      .post('/auth/login')
      .set(ANONYMOUS_HEADER, '1')
      .set('Accept-Language', lang)
      .send({ email, password });

  async function wrongTimes(email: string, n: number) {
    for (let i = 0; i < n; i++) await login(email, 'not-the-password').expect(401);
  }

  /** Runs `fn` signed in as `person` (the test user swapped). */
  async function as<T>(
    person: { id: string; email: string; name: string; mustChangePassword: boolean },
    fn: () => Promise<T>,
  ): Promise<T> {
    const saved = { ...user };
    Object.assign(user, {
      id: person.id,
      email: person.email,
      name: person.name,
      mustChangePassword: person.mustChangePassword,
    });
    try {
      return await fn();
    } finally {
      Object.assign(user, saved);
    }
  }

  const attempt = (email: string) => db.loginAttempt.findUnique({ where: { email } });

  beforeAll(async () => {
    ({ app, user } = await createAppAsTestUser());
    db = app.get(DatabaseService);
  });

  afterAll(async () => {
    await db.loginAttempt.deleteMany({ where: { email: { in: emails } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  describe('sign-in', () => {
    it('5 wrong passwords lock sign-in: the 6th gets 429 even with the right password, nothing checked', async () => {
      const person = await makeUser();
      const mark = await historyMark(db);
      await wrongTimes(person.email, 5); // the 5th is still the usual 401

      const locked = await login(person.email, PASSWORD).expect(429);
      expect(locked.body).toMatchObject({
        success: false,
        error: ErrorCode.TOO_MANY_ATTEMPTS,
        message: 'Too many attempts. Try again in 15 minutes.',
        params: { count: 15 },
      });
      expect(locked.headers['set-cookie']).toBeUndefined();
      // Arabic, with its plural form.
      const ar = await login(person.email, PASSWORD, 'ar').expect(429);
      expect(ar.body.message).toBe('محاولات كثيرة جدًا. حاول مرة أخرى بعد 15 دقيقة.');

      const row = await attempt(person.email);
      expect(row?.failedCount).toBe(5); // refused attempts are not counted (nothing was checked)
      expect(row!.lockedUntil!.getTime() - Date.now()).toBeGreaterThan(14 * MINUTE);

      // The lockout is in the audit log once, with no actor (nobody was signed in).
      const entries = await db.auditEntry.findMany({
        where: { seq: { gt: mark }, action: 'core.auth.locked_out' },
      });
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        entityType: 'user',
        entityId: person.id,
        entityLabel: person.email,
        actorId: null,
      });
    });

    it('the attempts after the lock say the minutes still left (rounded up)', async () => {
      const person = await makeUser();
      await wrongTimes(person.email, 5);
      await db.loginAttempt.update({
        where: { email: person.email },
        data: { lockedUntil: new Date(Date.now() + 7.5 * MINUTE) },
      });
      const res = await login(person.email, PASSWORD).expect(429);
      expect(res.body.message).toBe('Too many attempts. Try again in 8 minutes.');
      expect(res.body.params).toEqual({ count: 8 });
      expect((await login(person.email, PASSWORD, 'ar')).body.message).toBe(
        'محاولات كثيرة جدًا. حاول مرة أخرى بعد 8 دقائق.',
      );
    });

    it('a correct sign-in before the limit clears the count', async () => {
      const person = await makeUser();
      await wrongTimes(person.email, 4);
      await login(person.email, PASSWORD).expect(200);
      expect(await attempt(person.email)).toBeNull();
      await wrongTimes(person.email, 4); // a fresh count: still not locked
      await login(person.email, PASSWORD).expect(200);
    });

    it('a window older than 15 minutes starts over; an ended lock lets the right password in', async () => {
      const person = await makeUser();
      await wrongTimes(person.email, 4);
      await db.loginAttempt.update({
        where: { email: person.email },
        data: { windowStartedAt: new Date(Date.now() - 16 * MINUTE) },
      });
      await wrongTimes(person.email, 1);
      expect(await attempt(person.email)).toMatchObject({ failedCount: 1, lockedUntil: null });

      await wrongTimes(person.email, 4); // 5 in the new window → locked
      await login(person.email, PASSWORD).expect(429);
      await db.loginAttempt.update({
        where: { email: person.email },
        data: { lockedUntil: new Date(Date.now() - 1000) },
      });
      await login(person.email, PASSWORD).expect(200);
    });

    it('the email is counted lower-cased: different cases add up to one lock', async () => {
      const person = await makeUser();
      const mixed = person.email.charAt(0).toUpperCase() + person.email.slice(1);
      const variants = [person.email.toUpperCase(), person.email, mixed];
      for (let i = 0; i < 5; i++) {
        await login(variants[i % variants.length], 'not-the-password').expect(401);
      }
      await login(person.email.toUpperCase(), PASSWORD).expect(429);
    });

    it('an unknown email behaves the same: 401 × 5, then the same 429 and message', async () => {
      const email = `${unique('nobody')}@school.test`.toLowerCase();
      emails.push(email);
      const known = await makeUser();
      await wrongTimes(email, 5);
      await wrongTimes(known.email, 5);
      const unknown = await login(email, PASSWORD).expect(429);
      const real = await login(known.email, PASSWORD).expect(429);
      expect({ error: unknown.body.error, message: unknown.body.message }).toEqual({
        error: real.body.error,
        message: real.body.message,
      });
      expect(await attempt(email)).toMatchObject({ failedCount: 5 });
    });

    it('concurrent wrong passwords are all counted and lock once', async () => {
      const person = await makeUser();
      const mark = await historyMark(db);
      const results = await Promise.all(
        Array.from({ length: 8 }, () => login(person.email, 'not-the-password')),
      );
      // Every one was either counted (401) or refused once the lock landed (429).
      expect(results.every((r) => r.status === 401 || r.status === 429)).toBe(true);
      const counted = results.filter((r) => r.status === 401).length;
      expect((await attempt(person.email))?.failedCount).toBe(counted);
      expect(counted).toBeGreaterThanOrEqual(5);
      await login(person.email, PASSWORD).expect(429);
      const lockouts = await db.auditEntry.count({
        where: { seq: { gt: mark }, action: 'core.auth.locked_out', entityId: person.id },
      });
      expect(lockouts).toBe(1);
    });
  });

  describe('unlock (System admin, Users page)', () => {
    it('the account shows its lock; unlocking lets the user in at once and is audited', async () => {
      const person = await makeUser();
      await wrongTimes(person.email, 5);
      const before = (await http(app).get(`/users/${person.id}`).expect(200)).body
        .data as UserAccount;
      expect(before.lockedUntil).not.toBeNull();
      const list = (await http(app).get('/users').query({ search: person.email }).expect(200)).body
        .data as UserAccount[];
      expect(list.find((u) => u.id === person.id)?.lockedUntil).toBe(before.lockedUntil);

      const mark = await historyMark(db);
      const res = await http(app).post(`/users/${person.id}/unlock-sign-in`).expect(200);
      expect((res.body.data as UserAccount).lockedUntil).toBeNull();
      expect(await attempt(person.email)).toBeNull();
      await login(person.email, PASSWORD).expect(200);

      const entries = await db.auditEntry.findMany({
        where: { seq: { gt: mark }, action: 'core.user.unlock_sign_in' },
      });
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ entityId: person.id, actorId: user.id });
      const changes = entries[0].changes as unknown as AuditChange[];
      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        field: 'lockedUntil',
        before: before.lockedUntil,
        after: null,
      });
    });

    it('unlocking an account that is not locked changes nothing and writes no entry', async () => {
      const person = await makeUser();
      const mark = await historyMark(db);
      await http(app).post(`/users/${person.id}/unlock-sign-in`).expect(200);
      expect(
        await db.auditEntry.count({
          where: { seq: { gt: mark }, action: 'core.user.unlock_sign_in' },
        }),
      ).toBe(0);
    });

    it('needs core.users.manage (403 without it); an unknown id → 404', async () => {
      const officer = await makeUser({ roles: ['hr_officer'] });
      const target = await makeUser();
      await as({ ...officer, mustChangePassword: false }, () =>
        http(app).post(`/users/${target.id}/unlock-sign-in`).expect(403),
      );
      await http(app)
        .post('/users/00000000-0000-4000-8000-000000000000/unlock-sign-in')
        .expect(404);
    });
  });

  describe('password changes have the same limit', () => {
    it('My account: 5 wrong current passwords → locked; then 429 even with the right one', async () => {
      const person = await makeUser();
      await as({ ...person, mustChangePassword: false }, async () => {
        for (let i = 0; i < 5; i++) {
          const res = await http(app)
            .post('/account/password')
            .send({ currentPassword: 'not-it', newPassword: 'my-new-password-1' })
            .expect(400);
          expect(res.body.error).toBe(ErrorCode.WRONG_PASSWORD);
        }
        const locked = await http(app)
          .post('/account/password')
          .set('Accept-Language', 'en')
          .send({ currentPassword: PASSWORD, newPassword: 'my-new-password-1' })
          .expect(429);
        expect(locked.body).toMatchObject({
          error: ErrorCode.TOO_MANY_ATTEMPTS,
          message: 'Too many attempts. Try again in 15 minutes.',
        });
      });
      // The count survived the requests' rollbacks, and it locks sign-in too.
      expect(await attempt(person.email)).toMatchObject({ failedCount: 5 });
      await login(person.email, PASSWORD).expect(429);
    });

    it('the forced new-password screen is refused while the account is locked', async () => {
      const person = await makeUser({ mustChangePassword: true });
      await wrongTimes(person.email, 5);
      await as({ ...person, mustChangePassword: true }, () =>
        http(app).post('/account/password').send({ newPassword: 'my-own-password-1' }).expect(429),
      );
      expect((await db.user.findUnique({ where: { id: person.id } }))?.mustChangePassword).toBe(
        true,
      );
    });
  });

  describe('scheduled jobs', () => {
    it('nothing is put on a clock in tests', () => {
      expect(app.get(SchedulerRegistry).getCronJobs().size).toBe(0);
    });

    it('the clean-up deletes only rows whose window and lock both ended more than a day ago', async () => {
      const now = Date.now();
      const rows = {
        staleOpen: { windowStartedAt: new Date(now - 2 * 24 * 60 * MINUTE), lockedUntil: null },
        staleLocked: {
          windowStartedAt: new Date(now - 2 * 24 * 60 * MINUTE),
          lockedUntil: new Date(now - 25 * 60 * MINUTE),
        },
        recentWindow: { windowStartedAt: new Date(now - 60 * MINUTE), lockedUntil: null },
        lockEndedRecently: {
          windowStartedAt: new Date(now - 2 * 24 * 60 * MINUTE),
          lockedUntil: new Date(now - 2 * 60 * MINUTE),
        },
        windowEndedRecently: {
          // started 24h 5m ago: its 15-minute window ended less than a day ago
          windowStartedAt: new Date(now - (24 * 60 + 5) * MINUTE),
          lockedUntil: null,
        },
        lockedNow: {
          windowStartedAt: new Date(now - 5 * MINUTE),
          lockedUntil: new Date(now + 10 * MINUTE),
        },
      };
      const tag = unique('cleanup');
      const emailOf = (k: string) => `${tag}-${k}@school.test`.toLowerCase();
      for (const [k, v] of Object.entries(rows)) {
        emails.push(emailOf(k));
        await db.loginAttempt.create({ data: { email: emailOf(k), failedCount: 3, ...v } });
      }

      await expect(app.get(JobRunner).run(LOGIN_ATTEMPTS_CLEANUP_JOB)).resolves.toBe('success');

      const left = await db.loginAttempt.findMany({
        where: { email: { startsWith: `${tag}-`.toLowerCase() } },
        select: { email: true },
      });
      expect(left.map((r) => r.email).sort()).toEqual(
        ['recentWindow', 'lockEndedRecently', 'windowEndedRecently', 'lockedNow']
          .map(emailOf)
          .sort(),
      );
      const run = await db.jobRun.findFirst({
        where: { jobName: LOGIN_ATTEMPTS_CLEANUP_JOB },
        orderBy: { startedAt: 'desc' },
      });
      expect(run).toMatchObject({ status: 'success', error: null });
      expect(run!.finishedAt.getTime()).toBeGreaterThanOrEqual(run!.startedAt.getTime());
    });

    it('a job whose lock another container holds is skipped (single run)', async () => {
      const runner = app.get(JobRunner);
      const outcome = await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`job:${LOGIN_ATTEMPTS_CLEANUP_JOB}`}, 0))`;
        return runner.run(LOGIN_ATTEMPTS_CLEANUP_JOB);
      });
      expect(outcome).toBe('skipped');
    });

    it('a failing job is recorded as failed with its error and does not crash the API', async () => {
      const runner = app.get(JobRunner);
      const name = unique('e2e.failing');
      runner.register(
        { name, cron: '0 3 * * *' },
        { run: () => Promise.reject(new Error('boom in job')) },
      );
      await expect(runner.run(name)).resolves.toBe('failed');
      const run = await db.jobRun.findFirst({ where: { jobName: name } });
      expect(run?.status).toBe('failed');
      expect(run?.error).toContain('boom in job');
      await http(app).get('/health').expect(200);
      await db.jobRun.deleteMany({ where: { jobName: name } });
    });
  });
});
