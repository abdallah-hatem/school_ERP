import type { INestApplication } from '@nestjs/common';
import {
  AUTH_COOKIES,
  ErrorCode,
  type AuthUser,
  type Role,
  type RoleGrant,
  type UserAccount,
} from '@school-erp/shared';
import { createHash } from 'node:crypto';
import { DatabaseService } from '../src/database/database.service';
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
    ]);
    weakRole = await createRole([{ key: 'hr.employees.view', scope: 'self' }]);
    manager = await createUser([managerRole.id]);
    weakUser = await createUser([weakRole.id]);
    admin = await createUser([roleId('system_admin')]);
  });

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.role.deleteMany({ where: { id: { in: roleIds } } });
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
        // Adding a key they lack to a role they may edit is refused too.
        const res = await http(app)
          .patch(`/roles/${weakRole.id}`)
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
