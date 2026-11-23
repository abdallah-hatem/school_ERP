import type { INestApplication } from '@nestjs/common';
import {
  AUTH_COOKIES,
  ErrorCode,
  type AuthUser,
  type Role,
  type RoleGrant,
  type UserAccount,
} from '@school-erp/shared';
import { TransactionHost } from '@nestjs-cls/transactional';
import { ClsService } from 'nestjs-cls';
import { createHash } from 'node:crypto';
import { unlinkedPayAccounts } from '../prisma/checks/unlinked-pay-accounts';
import { RolesRepository } from '../src/core/roles/repositories/roles.repository';
import { UsersRepository } from '../src/core/users/repositories/users.repository';
import { DatabaseService } from '../src/database/database.service';
import type { DbAdapter } from '../src/database/transactions';
import { http, unique } from './helpers';
import { ANONYMOUS_HEADER, createAppAsTestUser } from './helpers/as-test-user';

/*
 * Security review (2026-11-23), against the real database, guard and sessions:
 *   H1 — `core.users.manage` has a ceiling;  H2 — `core.roles.manage` has a ceiling;
 *   M3 — a password change ends the user's other sessions;  L5 — a refresh replayed inside the
 *   grace window gets the pair already issued, and after it revokes the family.
 * Users and roles are made through the API by the test user (System admin + HR manager); `as(...)`
 * swaps the signed-in user for the refusals.
 */

const PASSWORD = 'first-password-123';
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

/** `name=value` pairs from a response's Set-Cookie headers. */
function cookiesOf(res: { headers: Record<string, unknown> }): Record<string, string> {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? (raw as string[]) : raw ? [String(raw)] : [];
  return Object.fromEntries(
    list.map((c) => {
      const [pair = ''] = c.split(';');
      const eq = pair.indexOf('=');
      return [pair.slice(0, eq), decodeURIComponent(pair.slice(eq + 1))];
    }),
  );
}

describe('Security review — access ceilings and sessions (e2e)', () => {
  let app: INestApplication;
  let user: AuthUser;
  let db: DatabaseService;
  const userIds: string[] = [];
  const roleIds: string[] = [];
  let roleId: (key: string) => string;
  /** A user manager who isn't a System admin: manages users and roles, sees employees and their stage's penalties. */
  let managerRole: Role;
  let manager: UserAccount;
  /** A role within the manager's own access. */
  let weakRole: Role;
  let weakUser: UserAccount;
  let admin: UserAccount;
  /** M1: two stages, an employee in each (third review). */
  const ref = {
    primary: '',
    prep: '',
    department: '',
    jobTitle: '',
    empPrimary: '',
    empPrep: '',
    /** Linked only by the L-c test (M1 links the two above). */
    empCheck: '',
    /** Linked only by the M2-C test. */
    empLog: '',
  };

  async function as<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const me = user.id;
    user.id = id;
    try {
      return await fn();
    } finally {
      user.id = me;
    }
  }

  const createRole = async (permissions: RoleGrant[]) => {
    const role = (
      await http(app)
        .post('/roles')
        .send({ nameEn: unique('Ceiling role'), nameAr: unique('دور'), permissions })
        .expect(201)
    ).body.data as Role;
    roleIds.push(role.id);
    return role;
  };

  const createUser = async (ids: string[], password = PASSWORD) => {
    const account = (
      await http(app)
        .post('/users')
        .send({ name: unique('Ceiling user'), email: `${unique('ceiling')}@school.test`.toLowerCase(), password, roleIds: ids })
        .expect(201)
    ).body.data as UserAccount;
    userIds.push(account.id);
    return account;
  };

  beforeAll(async () => {
    ({ app, user } = await createAppAsTestUser());
    db = app.get(DatabaseService);
    const roles = await db.role.findMany({ select: { id: true, key: true } });
    const byKey = new Map(roles.map((r) => [r.key, r.id]));
    roleId = (key) => byKey.get(key) ?? '';

    managerRole = await createRole([
      { key: 'core.users.view', scope: 'all' },
      { key: 'core.users.manage', scope: 'all' },
      { key: 'core.roles.view', scope: 'all' },
      { key: 'core.roles.manage', scope: 'all' },
      { key: 'hr.employees.view', scope: 'all' },
      { key: 'hr.penalties.view', scope: 'own_stage' },
      // Acts on pay (M2): what they may give, but only to a linked account.
      { key: 'hr.lateness.edit', scope: 'all' },
    ]);
    weakRole = await createRole([{ key: 'hr.employees.view', scope: 'self' }]);
    const named = async (path: string) =>
      (await http(app).post(path).send({ nameEn: unique('Ref'), nameAr: unique('مرجع') }).expect(201)).body.data.id as string;
    ref.primary = await named('/stages');
    ref.prep = await named('/stages');
    ref.department = await named('/hr/departments');
    ref.jobTitle = await named('/hr/job-titles');
    const employee = async (stageId: string) =>
      (
        await http(app)
          .post('/hr/employees')
          .send({
            nameEn: unique('Ceiling'),
            nameAr: unique('سقف'),
            gender: 'MALE',
            dateOfBirth: '1990-01-01',
            phone: '01000000000',
            hireDate: '2015-09-01',
            stageId,
            departmentId: ref.department,
            jobTitleId: ref.jobTitle,
            workSystem: 'FULL_TIME',
            basicSalary: 1_000_000,
          })
          .expect(201)
      ).body.data.id as string;
    ref.empPrimary = await employee(ref.primary);
    ref.empPrep = await employee(ref.prep);
    ref.empCheck = await employee(ref.prep);
    ref.empLog = await employee(ref.primary);
    manager = await createUser([managerRole.id]);
    weakUser = await createUser([weakRole.id]);
    admin = await createUser([roleId('system_admin')]);
  });

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.role.deleteMany({ where: { id: { in: roleIds } } });
    await db.employee.deleteMany({
      where: { id: { in: [ref.empPrimary, ref.empPrep, ref.empCheck, ref.empLog].filter(Boolean) } },
    });
    await db.department.deleteMany({ where: { id: ref.department } });
    await db.jobTitle.deleteMany({ where: { id: ref.jobTitle } });
    await db.stage.deleteMany({ where: { id: { in: [ref.primary, ref.prep].filter(Boolean) } } });
    await app.close();
  });

  describe('H1 — core.users.manage without being a System admin', () => {
    it('can’t grant system_admin — creating or editing a user (403 SYSTEM_ADMIN_ONLY)', async () => {
      await as(manager.id, async () => {
        const created = await http(app)
          .post('/users')
          .send({ name: 'Nope', email: `${unique('nope')}@school.test`.toLowerCase(), password: PASSWORD, roleIds: [roleId('system_admin')] })
          .expect(403);
        expect(created.body.error).toBe(ErrorCode.SYSTEM_ADMIN_ONLY);
        const edited = await http(app)
          .patch(`/users/${weakUser.id}`)
          .send({ roleIds: [weakRole.id, roleId('system_admin')] })
          .expect(403);
        expect(edited.body.error).toBe(ErrorCode.SYSTEM_ADMIN_ONLY);
      });
      const roles = (await http(app).get(`/users/${weakUser.id}`).expect(200)).body.data.roles as { key: string }[];
      expect(roles.map((r) => r.key)).toEqual([weakRole.key]);
    });

    it('can’t reset an admin’s password, deactivate, reactivate or edit an admin (403 SYSTEM_ADMIN_ONLY)', async () => {
      const before = await db.user.findUniqueOrThrow({ where: { id: admin.id }, select: { passwordHash: true } });
      await as(manager.id, async () => {
        for (const res of [
          await http(app).post(`/users/${admin.id}/password`).send({ password: 'taken-over-123' }).expect(403),
          await http(app).post(`/users/${admin.id}/deactivate`).expect(403),
          await http(app).post(`/users/${admin.id}/reactivate`).expect(403),
          await http(app).patch(`/users/${admin.id}`).send({ email: `${unique('mine')}@school.test` }).expect(403),
        ]) {
          expect(res.body.error).toBe(ErrorCode.SYSTEM_ADMIN_ONLY);
        }
      });
      const after = await db.user.findUniqueOrThrow({ where: { id: admin.id }, select: { passwordHash: true, isActive: true, email: true } });
      expect(after).toMatchObject({ passwordHash: before.passwordHash, isActive: true, email: admin.email });
    });

    it('can’t assign a role stronger than their own (403 GRANT_EXCEEDS_OWN); one within it is given', async () => {
      await as(manager.id, async () => {
        // HR officer holds permissions the manager doesn't.
        const stronger = await http(app)
          .patch(`/users/${weakUser.id}`)
          .send({ roleIds: [weakRole.id, roleId('hr_officer')] })
          .expect(403);
        expect(stronger.body.error).toBe(ErrorCode.GRANT_EXCEEDS_OWN);
      });
      // A role reaching further than theirs (penalties of everyone, they see their stage's) is stronger too.
      const wider = await createRole([{ key: 'hr.penalties.view', scope: 'all' }]);
      const within = await createRole([{ key: 'hr.penalties.view', scope: 'self' }]);
      await as(manager.id, async () => {
        const res = await http(app).patch(`/users/${weakUser.id}`).send({ roleIds: [weakRole.id, wider.id] }).expect(403);
        expect(res.body.error).toBe(ErrorCode.GRANT_EXCEEDS_OWN);
        await http(app).patch(`/users/${weakUser.id}`).send({ roleIds: [weakRole.id, within.id] }).expect(200);
      });
      // …and someone holding more than they do can't be reset by them (no takeover of a stronger account).
      const officer = await createUser([roleId('hr_officer')]);
      await as(manager.id, async () => {
        const res = await http(app).post(`/users/${officer.id}/password`).send({ password: 'taken-over-123' }).expect(403);
        expect(res.body.error).toBe(ErrorCode.GRANT_EXCEEDS_OWN);
      });
    });

    it('can’t change their own roles or employee link (403 OWN_ACCESS_CHANGE); their name they can', async () => {
      await as(manager.id, async () => {
        const roles = await http(app)
          .patch(`/users/${manager.id}`)
          .send({ roleIds: [managerRole.id, weakRole.id] })
          .expect(403);
        expect(roles.body.error).toBe(ErrorCode.OWN_ACCESS_CHANGE);
        const link = await http(app)
          .patch(`/users/${manager.id}`)
          .send({ employeeId: '00000000-0000-4000-8000-000000000123' })
          .expect(403);
        expect(link.body.error).toBe(ErrorCode.OWN_ACCESS_CHANGE);
        // The same roles sent back (the form does) change nothing: the rest saves.
        await http(app).patch(`/users/${manager.id}`).send({ name: 'Renamed Manager', roleIds: [managerRole.id] }).expect(200);
      });
      // A System admin can't either — another administrator does it.
      const self = await http(app).patch(`/users/${user.id}`).send({ roleIds: [roleId('system_admin')] }).expect(403);
      expect(self.body.error).toBe(ErrorCode.OWN_ACCESS_CHANGE);
    });
  });

  describe('H-1 / M-1 — the employee link and unlocking a sign-in', () => {
    it('H-1 — only a System admin sets or changes the employee link, on create and on update (403 EMPLOYEE_LINK_ADMIN_ONLY)', async () => {
      // Any employee id: the refusal comes before the employee is even looked up.
      const someone = '00000000-0000-4000-8000-000000000456';
      await as(manager.id, async () => {
        const created = await http(app)
          .post('/users')
          .send({ name: 'Linked', email: `${unique('linked')}@school.test`.toLowerCase(), password: PASSWORD, roleIds: [weakRole.id], employeeId: someone })
          .expect(403);
        expect(created.body.error).toBe(ErrorCode.EMPLOYEE_LINK_ADMIN_ONLY);
        const updated = await http(app).patch(`/users/${weakUser.id}`).send({ employeeId: someone }).expect(403);
        expect(updated.body.error).toBe(ErrorCode.EMPLOYEE_LINK_ADMIN_ONLY);
        // Without a link, creating still works.
        const plain = await http(app)
          .post('/users')
          .send({ name: 'Plain', email: `${unique('plain')}@school.test`.toLowerCase(), password: PASSWORD, roleIds: [weakRole.id] })
          .expect(201);
        userIds.push(plain.body.data.id);
      });
      expect((await http(app).get(`/users/${weakUser.id}`).expect(200)).body.data.employee).toBeNull();
    });

    it('M-1 — unlocking a sign-in is under the ceiling: a System admin → 403 SYSTEM_ADMIN_ONLY, a stronger user → 403 GRANT_EXCEEDS_OWN', async () => {
      const officer = await createUser([roleId('hr_officer')]);
      await as(manager.id, async () => {
        const onAdmin = await http(app).post(`/users/${admin.id}/unlock-sign-in`).expect(403);
        expect(onAdmin.body.error).toBe(ErrorCode.SYSTEM_ADMIN_ONLY);
        const onStronger = await http(app).post(`/users/${officer.id}/unlock-sign-in`).expect(403);
        expect(onStronger.body.error).toBe(ErrorCode.GRANT_EXCEEDS_OWN);
        await http(app).post(`/users/${weakUser.id}/unlock-sign-in`).expect(200);
      });
    });
  });

  describe('third review (owner 2026-11-23)', () => {
    const createLinked = async (ids: string[], employeeId: string, password = PASSWORD) => {
      const account = (
        await http(app)
          .post('/users')
          .send({ name: unique('Linked'), email: `${unique('linked')}@school.test`.toLowerCase(), password, roleIds: ids, employeeId })
          .expect(201)
      ).body.data as UserAccount;
      userIds.push(account.id);
      return account;
    };

    it('M1 — same scope, different link: the Primary user manager can’t take over the Prep head (LINKED_ACCOUNT_ADMIN_ONLY)', async () => {
      const stageManager = await createLinked(
        [
          (
            await createRole([
              { key: 'core.users.view', scope: 'all' },
              { key: 'core.users.manage', scope: 'all' },
              { key: 'hr.employees.view', scope: 'own_stage' },
            ])
          ).id,
        ],
        ref.empPrimary,
      );
      // The Prep head holds exactly the same label (own_stage) — anchored to Prep.
      const prepHead = await createLinked([(await createRole([{ key: 'hr.employees.view', scope: 'own_stage' }])).id], ref.empPrep);
      const before = await db.user.findUniqueOrThrow({ where: { id: prepHead.id }, select: { passwordHash: true, email: true } });
      await as(stageManager.id, async () => {
        for (const res of [
          await http(app).post(`/users/${prepHead.id}/password`).send({ password: 'taken-over-123' }).expect(403),
          await http(app).patch(`/users/${prepHead.id}`).send({ email: `${unique('mine')}@school.test` }).expect(403),
          await http(app).post(`/users/${prepHead.id}/unlock-sign-in`).expect(403),
        ]) {
          expect(res.body.error).toBe(ErrorCode.LINKED_ACCOUNT_ADMIN_ONLY);
        }
      });
      expect(await db.user.findUniqueOrThrow({ where: { id: prepHead.id }, select: { passwordHash: true, email: true } })).toEqual(before);
      // A System admin may.
      await http(app).post(`/users/${prepHead.id}/password`).send({ password: 'admin-reset-123' }).expect(204);
    });

    it('M2-A — a non-admin can’t give an unlinked account a role acting on pay (UNLINKED_PAY_ROLE), create or update', async () => {
      const clerk = await createRole([{ key: 'hr.lateness.edit', scope: 'all' }]);
      await as(manager.id, async () => {
        const created = await http(app)
          .post('/users')
          .send({ name: 'Clerk', email: `${unique('clerk')}@school.test`.toLowerCase(), password: PASSWORD, roleIds: [clerk.id] })
          .expect(403);
        expect(created.body.error).toBe(ErrorCode.UNLINKED_PAY_ROLE);
        const updated = await http(app).patch(`/users/${weakUser.id}`).send({ roleIds: [weakRole.id, clerk.id] }).expect(403);
        expect(updated.body.error).toBe(ErrorCode.UNLINKED_PAY_ROLE);
      });
      // A System admin may (they link accounts; the link is theirs to keep).
      await http(app).patch(`/users/${weakUser.id}`).send({ roleIds: [weakRole.id, clerk.id] }).expect(200);
      await http(app).patch(`/users/${weakUser.id}`).send({ roleIds: [weakRole.id] }).expect(200);
    });

    it('fourth review H1 — a role held by an unlinked account can’t be turned into one acting on pay (UNLINKED_PAY_ROLE)', async () => {
      await as(manager.id, async () => {
        const role = (
          await http(app)
            .post('/roles')
            .send({ nameEn: unique('Plain'), nameAr: unique('عادي'), permissions: [{ key: 'hr.employees.view', scope: 'self' }] })
            .expect(201)
        ).body.data as Role;
        roleIds.push(role.id);
        const holder = (
          await http(app)
            .post('/users')
            .send({ name: 'Holder', email: `${unique('holder')}@school.test`.toLowerCase(), password: PASSWORD, roleIds: [role.id] })
            .expect(201)
        ).body.data as UserAccount;
        userIds.push(holder.id);
        const res = await http(app)
          .patch(`/roles/${role.id}`)
          .send({ permissions: [{ key: 'hr.employees.view', scope: 'self' }, { key: 'hr.lateness.edit', scope: 'all' }] })
          .expect(403);
        expect(res.body.error).toBe(ErrorCode.ROLE_HAS_UNLINKED_HOLDER);
        expect(((await http(app).get(`/roles/${role.id}`).expect(200)).body.data as Role).permissions).toHaveLength(1);
      });
    });

    it('L-c — the release check lists an unlinked account acting on pay, not a linked one or a System admin', async () => {
      const unlinked = await createUser([roleId('hr_officer')]);
      const linked = await createLinked([roleId('hr_officer')], ref.empCheck);
      const found = await unlinkedPayAccounts(db);
      const emails = found.map((a) => a.email);
      expect(emails).toContain(unlinked.email);
      expect(emails).not.toContain(linked.email);
      expect(emails).not.toContain(admin.email);
      expect(found.find((a) => a.email === unlinked.email)?.permissions).toEqual(
        expect.arrayContaining(['hr.employees.edit', 'hr.lateness.edit', 'hr.payroll.adjust']),
      );
      // Leave nothing for the next suites to trip on.
      await http(app).post(`/users/${unlinked.id}/deactivate`).expect(200);
    });

    it('M2-C — a link change is in the log by name, before and after', async () => {
      const person = await createUser([weakRole.id]);
      await http(app).patch(`/users/${person.id}`).send({ employeeId: ref.empLog }).expect(200);
      const [entry] = await db.auditEntry.findMany({
        where: { entityId: person.id, action: 'core.user.update' },
        orderBy: { seq: 'desc' },
        take: 1,
      });
      const change = (entry?.changes as unknown as { field: string; before: unknown; after: unknown }[]).find(
        (c) => c.field === 'employeeId',
      );
      expect(change).toMatchObject({ after: { id: ref.empLog, nameEn: expect.stringContaining('Ceiling') } });
      expect(change?.before ?? null).toBeNull();
      await http(app).patch(`/users/${person.id}`).send({ employeeId: null }).expect(200);
    });

    it('pre-existing — a reactivated user’s access tokens from before the deactivation stay dead', async () => {
      const person = await createUser([weakRole.id]);
      const cookies = cookiesOf(
        await http(app).post('/auth/login').set(ANONYMOUS_HEADER, '1').send({ email: person.email, password: PASSWORD }).expect(200),
      );
      const me = () =>
        http(app).get('/auth/me').set(ANONYMOUS_HEADER, '1').set('Cookie', `${AUTH_COOKIES.access}=${cookies[AUTH_COOKIES.access]}`);
      await me().expect(200);
      await http(app).post(`/users/${person.id}/deactivate`).expect(200);
      await http(app).post(`/users/${person.id}/reactivate`).expect(200);
      await me().expect(401);
    });

    it('L3 — while a user’s and a role’s rows are locked for a check, a refresh token for that user and that role given to someone both still go in', async () => {
      const person = await createUser([weakRole.id]);
      const users = app.get(UsersRepository, { strict: false });
      const roles = app.get(RolesRepository, { strict: false });
      const txHost = app.get<TransactionHost<DbAdapter>>(TransactionHost, { strict: false });
      const within = async <T>(p: Promise<T>, ms: number) => {
        let timer: NodeJS.Timeout | undefined;
        try {
          return await Promise.race([
            p.then(() => 'done' as const),
            new Promise<'blocked'>((r) => {
              timer = setTimeout(() => r('blocked'), ms);
            }),
          ]);
        } finally {
          clearTimeout(timer);
        }
      };
      const outcome = await app.get(ClsService).run(() =>
        txHost.withTransaction(async () => {
          await users.lockUser(person.id);
          await roles.lockRole(weakRole.id);
          // Another connection: a token for that user, and that role given to someone — both only
          // reference the locked rows (foreign keys), so neither waits.
          const token = await within(
            db.refreshToken.create({
              data: { userId: person.id, familyId: '00000000-0000-4000-8000-000000000777', tokenHash: unique('h'), expiresAt: new Date(Date.now() + 60_000) },
            }),
            2_000,
          );
          const given = await within(db.userRoleAssignment.create({ data: { userId: admin.id, roleId: weakRole.id } }), 2_000);
          return { token, given };
        }),
      );
      expect(outcome).toEqual({ token: 'done', given: 'done' });
      await db.userRoleAssignment.deleteMany({ where: { userId: admin.id, roleId: weakRole.id } });
    });

    it('L-6 — two admin actions at once on one account: the ceiling check never passes on roles that changed under it', async () => {
      // Real sessions (the test-user swap can't run two people at once).
      const signedIn = async (account: UserAccount, temp: string, own: string) => {
        const first = cookiesOf(
          await http(app).post('/auth/login').set(ANONYMOUS_HEADER, '1').send({ email: account.email, password: temp }).expect(200),
        );
        await http(app)
          .post('/account/password')
          .set(ANONYMOUS_HEADER, '1')
          .set('Cookie', `${AUTH_COOKIES.access}=${first[AUTH_COOKIES.access]}`)
          .send({ newPassword: own })
          .expect(204);
        const c = cookiesOf(
          await http(app).post('/auth/login').set(ANONYMOUS_HEADER, '1').send({ email: account.email, password: own }).expect(200),
        );
        return `${AUTH_COOKIES.access}=${c[AUTH_COOKIES.access]}`;
      };
      const promoter = await createUser([roleId('system_admin')], 'temp-promoter-1');
      const promoterCookie = await signedIn(promoter, 'temp-promoter-1', 'own-promoter-1');
      const managerAccount = await createUser([managerRole.id], 'temp-manager-1');
      const managerCookie = await signedIn(managerAccount, 'temp-manager-1', 'own-manager-1');
      // Its own role: the targets become System admins, and a role they hold would then be one
      // "a System admin holds" for every later test that edits it.
      const raceRole = await createRole([{ key: 'hr.employees.view', scope: 'self' }]);
      for (let round = 0; round < 3; round++) {
        const target = await createUser([raceRole.id]);
        const [promote, deactivate] = await Promise.all([
          http(app)
            .patch(`/users/${target.id}`)
            .set(ANONYMOUS_HEADER, '1')
            .set('Cookie', promoterCookie)
            .send({ roleIds: [raceRole.id, roleId('system_admin')] }),
          http(app).post(`/users/${target.id}/deactivate`).set(ANONYMOUS_HEADER, '1').set('Cookie', managerCookie),
        ]);
        expect(promote.status).toBe(200);
        if (deactivate.status === 403) {
          // It ran after the promotion: refused for the right reason.
          expect(deactivate.body.error).toBe(ErrorCode.SYSTEM_ADMIN_ONLY);
        } else {
          // It ran first: its entry comes before the promotion's — never a deactivation of an admin.
          expect(deactivate.status).toBe(200);
          const entries = await db.auditEntry.findMany({
            where: { entityId: target.id, action: { in: ['core.user.update', 'core.user.deactivate'] } },
            orderBy: { seq: 'asc' },
            select: { action: true },
          });
          expect(entries.map((e) => e.action)).toEqual(['core.user.deactivate', 'core.user.update']);
        }
      }
    });
  });

  describe('H2 — core.roles.manage without being a System admin', () => {
    it('L-4 — removing a grant they don’t hold, or deleting a role beyond theirs, is refused', async () => {
      const strong = await createRole([
        { key: 'hr.employees.view', scope: 'all' },
        { key: 'hr.payroll.approve', scope: 'all' },
      ]);
      await as(manager.id, async () => {
        const narrowed = await http(app)
          .patch(`/roles/${strong.id}`)
          .send({ permissions: [{ key: 'hr.employees.view', scope: 'all' }] })
          .expect(403);
        expect(narrowed.body.error).toBe(ErrorCode.GRANT_EXCEEDS_OWN);
        const deleted = await http(app).delete(`/roles/${strong.id}`).expect(403);
        expect(deleted.body.error).toBe(ErrorCode.GRANT_EXCEEDS_OWN);
      });
      expect(((await http(app).get(`/roles/${strong.id}`).expect(200)).body.data as Role).permissions).toHaveLength(2);
      // A role within their own access they may delete.
      const within = await createRole([{ key: 'hr.employees.view', scope: 'self' }]);
      await as(manager.id, () => http(app).delete(`/roles/${within.id}`).expect(204));
    });

    it('can’t grant keys they lack, or a wider scope than theirs (403 GRANT_EXCEEDS_OWN); within is created', async () => {
      await as(manager.id, async () => {
        for (const permissions of [
          [{ key: 'hr.payroll.approve', scope: 'all' }],
          [{ key: 'core.settings.edit', scope: 'all' }],
          [{ key: 'hr.penalties.view', scope: 'all' }],
          [{ key: 'hr.penalties.view', scope: 'own_team' }],
        ]) {
          const res = await http(app).post('/roles').send({ nameEn: unique('Up'), nameAr: unique('أ'), permissions }).expect(403);
          expect(res.body.error).toBe(ErrorCode.GRANT_EXCEEDS_OWN);
        }
        const ok = await http(app)
          .post('/roles')
          .send({ nameEn: unique('Within'), nameAr: unique('ض'), permissions: [{ key: 'hr.penalties.view', scope: 'own_stage' }] })
          .expect(201);
        roleIds.push(ok.body.data.id);
        // Adding a key they lack to a role they may edit (their own, held by nobody) is refused too.
        const own = (
          await http(app)
            .post('/roles')
            .send({ nameEn: unique('Editable'), nameAr: unique('قابل'), permissions: [{ key: 'hr.employees.view', scope: 'self' }] })
            .expect(201)
        ).body.data as Role;
        roleIds.push(own.id);
        const res = await http(app)
          .patch(`/roles/${own.id}`)
          .send({ permissions: [{ key: 'hr.employees.view', scope: 'self' }, { key: 'core.audit.view', scope: 'all' }] })
          .expect(403);
        expect(res.body.error).toBe(ErrorCode.GRANT_EXCEEDS_OWN);
      });
    });

    it('can’t edit a role they hold (403 ROLE_HELD_BY_YOU), nor one a System admin holds (403 ROLE_HELD_BY_SYSTEM_ADMIN)', async () => {
      const adminsRole = await createRole([{ key: 'hr.employees.view', scope: 'all' }]);
      await http(app).patch(`/users/${admin.id}`).send({ roleIds: [roleId('system_admin'), adminsRole.id] }).expect(200);
      await as(manager.id, async () => {
        const own = await http(app).patch(`/roles/${managerRole.id}`).send({ nameEn: 'Mine now' }).expect(403);
        expect(own.body.error).toBe(ErrorCode.ROLE_HELD_BY_YOU);
        const widened = await http(app)
          .patch(`/roles/${managerRole.id}`)
          .send({ permissions: [...managerRole.permissions, { key: 'hr.payroll.approve', scope: 'all' }] })
          .expect(403);
        expect(widened.body.error).toBe(ErrorCode.ROLE_HELD_BY_YOU);
        const admins = await http(app).patch(`/roles/${adminsRole.id}`).send({ nameEn: 'Renamed' }).expect(403);
        expect(admins.body.error).toBe(ErrorCode.ROLE_HELD_BY_SYSTEM_ADMIN);
        const system = await http(app).patch(`/roles/${roleId('system_admin')}`).send({ nameEn: 'Mine' }).expect(403);
        expect(system.body.error).toBe(ErrorCode.ROLE_HELD_BY_SYSTEM_ADMIN);
      });
      const stored = (await http(app).get(`/roles/${managerRole.id}`).expect(200)).body.data as Role;
      expect(stored.nameEn).toBe(managerRole.nameEn);
      expect(stored.permissions).toEqual(managerRole.permissions);
    });
  });

  describe('M3 — a password change ends the user’s other sessions', () => {
    const login = (email: string, password: string) =>
      http(app).post('/auth/login').set(ANONYMOUS_HEADER, '1').send({ email, password }).expect(200);
    const refresh = (token: string | undefined) =>
      http(app).post('/auth/refresh').set(ANONYMOUS_HEADER, '1').set('Cookie', `${AUTH_COOKIES.refresh}=${token}`);

    it('the other sessions are signed out; the current one still works', async () => {
      const temp = 'temporary-pass-m3-1';
      const person = await createUser([weakRole.id], temp);
      const a = cookiesOf(await login(person.email, temp));
      const withA = (req: ReturnType<ReturnType<typeof http>['get']>) =>
        req.set(ANONYMOUS_HEADER, '1').set('Cookie', `${AUTH_COOKIES.access}=${a[AUTH_COOKIES.access]}`);
      // The forced first change (from session A).
      await withA(http(app).post('/account/password')).send({ newPassword: 'own-password-m3-1' }).expect(204);
      // A second sign-in elsewhere (B), with the new password.
      const b = cookiesOf(await login(person.email, 'own-password-m3-1'));

      // A changes the password again.
      await withA(http(app).post('/account/password'))
        .send({ currentPassword: 'own-password-m3-1', newPassword: 'own-password-m3-2' })
        .expect(204);

      // B is signed out: its refresh is refused…
      const refused = await refresh(b[AUTH_COOKIES.refresh]).expect(401);
      expect(refused.body.error).toBe(ErrorCode.INVALID_REFRESH_TOKEN);
      // …and (L-1) its access token stops at once, not when it expires.
      await http(app)
        .get('/auth/me')
        .set(ANONYMOUS_HEADER, '1')
        .set('Cookie', `${AUTH_COOKIES.access}=${b[AUTH_COOKIES.access]}`)
        .expect(401);
      // A keeps working: its access token, and its refresh.
      await withA(http(app).get('/auth/me')).expect(200);
      await refresh(a[AUTH_COOKIES.refresh]).expect(200);
      // Every live token is A's sign-in.
      const families = await db.refreshToken.findMany({
        where: { userId: person.id, revokedAt: null },
        select: { familyId: true },
      });
      const aFamily = await db.refreshToken.findUniqueOrThrow({
        where: { tokenHash: sha256(a[AUTH_COOKIES.refresh]) },
        select: { familyId: true },
      });
      expect(new Set(families.map((f) => f.familyId))).toEqual(new Set([aFamily.familyId]));
    });
  });

  describe('L5 — refresh-token reuse grace', () => {
    const refresh = (token: string | undefined) =>
      http(app).post('/auth/refresh').set(ANONYMOUS_HEADER, '1').set('Cookie', `${AUTH_COOKIES.refresh}=${token}`);

    it('a reuse within the grace window returns the same pair, minting nothing', async () => {
      const person = await createUser([weakRole.id]);
      const first = cookiesOf(
        await http(app).post('/auth/login').set(ANONYMOUS_HEADER, '1').send({ email: person.email, password: PASSWORD }).expect(200),
      )[AUTH_COOKIES.refresh];
      const once = cookiesOf(await refresh(first).expect(200));
      const again = cookiesOf(await refresh(first).expect(200));
      expect(again[AUTH_COOKIES.refresh]).toBe(once[AUTH_COOKIES.refresh]);
      expect(again[AUTH_COOKIES.access]).toBe(once[AUTH_COOKIES.access]);
      // The sign-in's token and its one successor: the replay minted no third.
      expect(await db.refreshToken.count({ where: { userId: person.id } })).toBe(2);
    });

    it('L-7 — two refreshes at once with the same cookie get the same pair and stay signed in', async () => {
      const person = await createUser([weakRole.id]);
      const first = cookiesOf(
        await http(app).post('/auth/login').set(ANONYMOUS_HEADER, '1').send({ email: person.email, password: PASSWORD }).expect(200),
      )[AUTH_COOKIES.refresh];
      const [x, y] = await Promise.all([refresh(first), refresh(first)]);
      expect([x.status, y.status]).toEqual([200, 200]);
      const [cx, cy] = [cookiesOf(x), cookiesOf(y)];
      expect(cx[AUTH_COOKIES.refresh]).toBe(cy[AUTH_COOKIES.refresh]);
      // Still signed in: the pair works, and refreshes on.
      await http(app)
        .get('/auth/me')
        .set(ANONYMOUS_HEADER, '1')
        .set('Cookie', `${AUTH_COOKIES.access}=${cx[AUTH_COOKIES.access]}`)
        .expect(200);
      const next = cookiesOf(await refresh(cx[AUTH_COOKIES.refresh]).expect(200));
      // L-2: a late replay of the first token (inside the window) follows on to the live one.
      const late = cookiesOf(await refresh(first).expect(200));
      expect(late[AUTH_COOKIES.refresh]).toBe(next[AUTH_COOKIES.refresh]);
      expect(await db.refreshToken.count({ where: { userId: person.id, revokedAt: null } })).toBe(3);
    });

    it('a reuse after the window revokes the family', async () => {
      const person = await createUser([weakRole.id]);
      const first = cookiesOf(
        await http(app).post('/auth/login').set(ANONYMOUS_HEADER, '1').send({ email: person.email, password: PASSWORD }).expect(200),
      )[AUTH_COOKIES.refresh];
      const next = cookiesOf(await refresh(first).expect(200))[AUTH_COOKIES.refresh];
      await db.refreshToken.update({
        where: { tokenHash: sha256(first) },
        data: { usedAt: new Date(Date.now() - 11_000) },
      });
      await refresh(first).expect(401);
      await refresh(next).expect(401);
      expect(await db.refreshToken.count({ where: { userId: person.id, revokedAt: null } })).toBe(0);
    });
  });
});
