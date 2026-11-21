import { INestApplication } from '@nestjs/common';
import {
  AUTH_COOKIES,
  ErrorCode,
  PERMISSION_KEYS,
  type AuditActor,
  type AuditChange,
  type AuthUser,
  type EmployeeOption,
  type Role,
  type UserAccount,
} from '@school-erp/shared';
import { hashPassword } from '../src/common/utils/password.util';
import { DatabaseService } from '../src/database/database.service';
import { http, unique } from './helpers';
import { ANONYMOUS_HEADER, createAppAsTestUser, giveRoles } from './helpers/as-test-user';
import { historyMark } from './helpers/history';

/*
 * Users and roles API (spec roles-permissions P2): R2, R5, R8, R9 and edge cases 5–8 against the
 * real database, guard and audit log. The test user is System admin + HR manager; tests that act
 * as someone else swap the signed-in user's id (`as(...)`).
 */

const PASSWORD = 'first-password-123';

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

describe('users and roles (e2e)', () => {
  let app: INestApplication;
  let user: AuthUser;
  let db: DatabaseService;
  const userIds: string[] = [];
  const roleIds: string[] = [];
  let roleId: (key: string) => string;
  const listRefs: { stage?: string; department?: string; jobTitle?: string; employee?: string } =
    {};

  /** Runs `fn` signed in as `userId` (the test user's id, swapped). */
  async function as<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const id = user.id;
    user.id = userId;
    try {
      return await fn();
    } finally {
      user.id = id;
    }
  }

  async function makeUser(roleKeys: string[] = [], password = PASSWORD) {
    const email = `${unique('u')}@school.test`.toLowerCase();
    const row = await db.user.create({
      data: { email, name: unique('User'), passwordHash: await hashPassword(password, 4) },
    });
    userIds.push(row.id);
    if (roleKeys.length) await giveRoles(db, row.id, roleKeys);
    return row;
  }

  const entriesAfter = (mark: bigint, action?: string) =>
    db.auditEntry.findMany({
      where: { seq: { gt: mark }, ...(action ? { action } : {}) },
      orderBy: { seq: 'asc' },
    });

  beforeAll(async () => {
    ({ app, user } = await createAppAsTestUser());
    db = app.get(DatabaseService);
    const roles = await db.role.findMany({ select: { id: true, key: true } });
    const byKey = new Map(roles.map((r) => [r.key, r.id]));
    roleId = (key) => byKey.get(key) ?? '';

    listRefs.stage = (await db.stage.create({ data: { nameEn: unique('S'), nameAr: 'م' } })).id;
    listRefs.department = (
      await db.department.create({ data: { nameEn: unique('D'), nameAr: 'ق' } })
    ).id;
    listRefs.jobTitle = (
      await db.jobTitle.create({ data: { nameEn: unique('J'), nameAr: 'و' } })
    ).id;
    listRefs.employee = (
      await db.employee.create({
        data: {
          code: unique('EMP-U'),
          nameEn: 'Linked Person',
          nameAr: 'شخص',
          gender: 'FEMALE',
          dateOfBirth: new Date('1990-01-01'),
          phone: '01000000000',
          hireDate: new Date('2020-01-01'),
          stageId: listRefs.stage,
          departmentId: listRefs.department,
          jobTitleId: listRefs.jobTitle,
          workSystem: 'FULL_TIME',
          basicSalary: 1_000_000,
          contractStart: new Date('2026-06-01'),
          contractEnd: new Date('2027-05-31'),
        },
      })
    ).id;
  });

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.role.deleteMany({ where: { id: { in: roleIds } } });
    if (listRefs.employee) await db.employee.deleteMany({ where: { id: listRefs.employee } });
    if (listRefs.stage) await db.stage.deleteMany({ where: { id: listRefs.stage } });
    if (listRefs.department) {
      await db.department.deleteMany({ where: { id: listRefs.department } });
    }
    if (listRefs.jobTitle) await db.jobTitle.deleteMany({ where: { id: listRefs.jobTitle } });
    await app.close();
  });

  describe('roles', () => {
    it('lists the seeded starting roles with their permissions and scopes (R2, R5)', async () => {
      const res = await http(app).get('/roles?limit=50').expect(200);
      const roles = res.body.data as Role[];
      const builtIn = roles.filter((r) => r.builtIn).map((r) => r.key);
      expect(builtIn).toEqual([
        'system_admin',
        'hr_manager',
        'hr_officer',
        'accountant',
        'principal',
        'stage_head',
        'direct_manager',
      ]);
      const admin = roles.find((r) => r.key === 'system_admin')!;
      expect(admin.permissions.map((p) => p.key)).toEqual(PERMISSION_KEYS);
      const stageHead = roles.find((r) => r.key === 'stage_head')!;
      expect(stageHead.permissions).toEqual(
        expect.arrayContaining([{ key: 'hr.employees.view', scope: 'own_stage' }]),
      );
      expect(res.body.meta).toMatchObject({ page: 1, limit: 50 });
    });

    it('searches the roles by either name (the user form’s checklist) and pages them', async () => {
      const all = (await http(app).get('/roles?limit=100').expect(200)).body.data as Role[];
      const accountant = all.find((r) => r.key === 'accountant')!;
      const term = accountant.nameEn.slice(0, 5);
      const byEn = await http(app).get('/roles').query({ search: term.toUpperCase(), limit: 100 }).expect(200);
      expect((byEn.body.data as Role[]).map((r) => r.key)).toContain('accountant');
      expect((byEn.body.data as Role[]).every((r) => r.nameEn.toLowerCase().includes(term.toLowerCase()))).toBe(true);
      const byAr = await http(app).get('/roles').query({ search: accountant.nameAr, limit: 100 }).expect(200);
      expect((byAr.body.data as Role[]).map((r) => r.key)).toContain('accountant');
      expect(byAr.body.meta.total).toBe((byAr.body.data as Role[]).length);
      const none = await http(app).get('/roles').query({ search: 'no-such-role-xyz' }).expect(200);
      expect(none.body).toMatchObject({ data: [], meta: { total: 0 } });
      const second = await http(app).get('/roles').query({ page: 2, limit: 1 }).expect(200);
      expect((second.body.data as Role[])[0]!.id).toBe(all[1]!.id);
      await http(app).get('/roles').query({ limit: 101 }).expect(400);
    });

    it('creates a custom role, edits its permissions and scopes, and records both', async () => {
      const mark = await historyMark(db);
      const created = await http(app)
        .post('/roles')
        .send({
          nameEn: 'Nurse',
          nameAr: 'ممرضة',
          permissions: [{ key: 'hr.employees.view', scope: 'own_stage' }],
        })
        .expect(201);
      const role = created.body.data as Role;
      roleIds.push(role.id);
      expect(role).toMatchObject({ builtIn: false, userCount: 0, nameEn: 'Nurse' });
      expect(role.key).toMatch(/^custom_[0-9a-f]{8}$/);

      const edited = await http(app)
        .patch(`/roles/${role.id}`)
        .send({
          permissions: [
            { key: 'hr.employees.view', scope: 'all' },
            { key: 'hr.penalties.view', scope: 'own_team' },
          ],
        })
        .expect(200);
      expect((edited.body.data as Role).permissions).toEqual([
        { key: 'hr.employees.view', scope: 'all' },
        { key: 'hr.penalties.view', scope: 'own_team' },
      ]);

      const entries = await entriesAfter(mark);
      expect(entries.map((e) => e.action)).toEqual(['core.role.create', 'core.role.update']);
      expect(entries[1]).toMatchObject({ entityType: 'role', entityId: role.id, actorId: user.id });
      expect(entries[1]?.changes as unknown as AuditChange[]).toEqual([
        {
          field: 'permissions',
          before: { 'hr.employees.view': 'own_stage' },
          after: { 'hr.employees.view': 'all', 'hr.penalties.view': 'own_team' },
        },
      ]);
    });

    it('refuses unknown keys or scopes (400) and duplicates', async () => {
      const send = (permissions: unknown) =>
        http(app).post('/roles').send({ nameEn: 'X', nameAr: 'س', permissions });
      expect((await send([{ key: 'hr.payroll.delete', scope: 'all' }])).status).toBe(400);
      expect((await send([{ key: 'hr.payroll.view', scope: 'everyone' }])).status).toBe(400);
      const dup = await send([
        { key: 'hr.payroll.view', scope: 'all' },
        { key: 'hr.payroll.view', scope: 'self' },
      ]);
      expect([dup.status, dup.body.error]).toEqual([400, ErrorCode.DUPLICATE_PERMISSION]);
    });

    it('the System admin can’t be deleted, nor its permissions narrowed', async () => {
      const del = await http(app).delete(`/roles/${roleId('system_admin')}`).expect(409);
      expect(del.body.error).toBe(ErrorCode.SYSTEM_ADMIN_UNDELETABLE);
      expect(await db.role.count({ where: { key: 'system_admin' } })).toBe(1);
      const fixed = await http(app)
        .patch(`/roles/${roleId('system_admin')}`)
        .send({ permissions: [] })
        .expect(409);
      expect(fixed.body.error).toBe(ErrorCode.SYSTEM_ADMIN_FIXED);
    });

    it('a starting role is deleted once nobody holds it, and the deletion is audited (owner 2026-11-19)', async () => {
      // A starting role of its own, so the shared ones other specs sign in with stay.
      const role = await db.role.create({
        data: { key: unique('starting').toLowerCase(), nameEn: 'Starting', nameAr: 'أساسي', builtIn: true },
      });
      roleIds.push(role.id);
      await db.rolePermission.create({
        data: { roleId: role.id, permissionKey: 'hr.employees.view', scope: 'all' },
      });
      const holder = await makeUser();
      await db.userRoleAssignment.create({ data: { userId: holder.id, roleId: role.id } });
      const held = await http(app).delete(`/roles/${role.id}`).expect(409);
      expect(held.body.error).toBe(ErrorCode.ROLE_IN_USE);
      await db.userRoleAssignment.deleteMany({ where: { roleId: role.id } });

      const mark = await historyMark(db);
      await http(app).delete(`/roles/${role.id}`).expect(204);
      await http(app).get(`/roles/${role.id}`).expect(404);
      expect(await db.rolePermission.count({ where: { roleId: role.id } })).toBe(0);
      const [entry] = await entriesAfter(mark, 'core.role.delete');
      expect(entry).toMatchObject({ entityType: 'role', entityId: role.id, actorId: user.id });
    });

    it('a custom role is deleted only when nobody holds it', async () => {
      const role = (
        await http(app)
          .post('/roles')
          .send({ nameEn: 'Temp', nameAr: 'مؤقت', permissions: [] })
          .expect(201)
      ).body.data as Role;
      roleIds.push(role.id);
      const holder = await makeUser();
      await db.userRoleAssignment.create({ data: { userId: holder.id, roleId: role.id } });
      const inUse = await http(app).delete(`/roles/${role.id}`).expect(409);
      expect(inUse.body.error).toBe(ErrorCode.ROLE_IN_USE);
      await db.userRoleAssignment.deleteMany({ where: { roleId: role.id } });
      await http(app).delete(`/roles/${role.id}`).expect(204);
      await http(app).get(`/roles/${role.id}`).expect(404);
    });
  });

  describe('users', () => {
    it('creates a user with roles and a linked employee; the password is temporary and never returned', async () => {
      const mark = await historyMark(db);
      const email = `${unique('new')}@School.test`;
      const res = await http(app)
        .post('/users')
        .send({
          name: 'Nadia Samir',
          email,
          password: PASSWORD,
          roleIds: [roleId('accountant')],
          employeeId: listRefs.employee,
        })
        .expect(201);
      const created = res.body.data as UserAccount;
      userIds.push(created.id);
      expect(created).toMatchObject({
        name: 'Nadia Samir',
        email: email.toLowerCase(),
        isActive: true,
        mustChangePassword: true,
        roles: [{ key: 'accountant' }],
        employee: { id: listRefs.employee, nameEn: 'Linked Person' },
      });
      expect(JSON.stringify(res.body)).not.toMatch(/password_hash|passwordHash|\$2[aby]\$/);
      // HR's employee profile says who signs in as this employee ("Signs in as: …"), name and id only.
      const profile = await http(app).get(`/hr/employees/${listRefs.employee}`).expect(200);
      expect(profile.body.data.signInAccount).toEqual({ id: created.id, name: 'Nadia Samir' });

      const [entry] = await entriesAfter(mark, 'core.user.create');
      expect(entry).toMatchObject({ entityType: 'user', entityId: created.id });
      expect(JSON.stringify(entry?.changes)).not.toContain(PASSWORD);

      // The same email again (any case) → 409; the same employee for someone else → 409.
      const again = await http(app)
        .post('/users')
        .send({ name: 'X', email: email.toUpperCase(), password: PASSWORD, roleIds: [] })
        .expect(409);
      expect(again.body.error).toBe(ErrorCode.EMAIL_TAKEN);
      const other = await makeUser();
      const linked = await http(app)
        .patch(`/users/${other.id}`)
        .send({ employeeId: listRefs.employee })
        .expect(409);
      expect(linked.body.error).toBe(ErrorCode.EMPLOYEE_ALREADY_LINKED);

      // Unlink, then the user list finds them by name.
      await http(app).patch(`/users/${created.id}`).send({ employeeId: null }).expect(200);
      const list = await http(app).get('/users?search=nadia%20samir').expect(200);
      expect((list.body.data as UserAccount[]).map((u) => u.id)).toContain(created.id);
      expect((list.body.data as UserAccount[])[0]?.employee).toBeNull();
      const unlinked = await http(app).get(`/hr/employees/${listRefs.employee}`).expect(200);
      expect(unlinked.body.data.signInAccount).toBeNull();
    });

    it('refuses unknown roles (400), a short password (400) and an unknown employee (400)', async () => {
      const base = { name: 'X', email: `${unique('v')}@school.test`, password: PASSWORD };
      const role = await http(app)
        .post('/users')
        .send({ ...base, roleIds: ['00000000-0000-4000-8000-000000000000'] })
        .expect(400);
      expect(role.body.error).toBe(ErrorCode.UNKNOWN_ROLE);
      await http(app)
        .post('/users')
        .send({ ...base, password: 'short', roleIds: [] })
        .expect(400);
      const emp = await http(app)
        .post('/users')
        .send({ ...base, roleIds: [], employeeId: '00000000-0000-4000-8000-000000000000' })
        .expect(400);
      expect(emp.body.error).toBe(ErrorCode.UNKNOWN_EMPLOYEE);
      await http(app).get('/users/00000000-0000-4000-8000-000000000000').expect(404);
    });

    it('a user without core.users.manage → 403 on every write; without core.users.view → 403 on reads', async () => {
      const hrManager = await makeUser(['hr_manager']);
      const target = await makeUser();
      await as(hrManager.id, async () => {
        await http(app)
          .post('/users')
          .send({ name: 'X', email: 'x@school.test', password: PASSWORD, roleIds: [] })
          .expect(403);
        await http(app).patch(`/users/${target.id}`).send({ name: 'Y' }).expect(403);
        await http(app).post(`/users/${target.id}/deactivate`).expect(403);
        await http(app).post(`/users/${target.id}/password`).send({ password: PASSWORD }).expect(403);
        await http(app).get('/users').expect(403);
        await http(app).get('/roles').expect(403);
        await http(app)
          .post('/roles')
          .send({ nameEn: 'X', nameAr: 'س', permissions: [] })
          .expect(403);
      });
      // Nothing changed.
      expect((await db.user.findUniqueOrThrow({ where: { id: target.id } })).isActive).toBe(true);
    });

    it('edge case 7 — a role’s permissions changed → the user gets the new set on their next request, no re-login', async () => {
      const role = (
        await http(app)
          .post('/roles')
          .send({ nameEn: 'Viewer', nameAr: 'مطلع', permissions: [] })
          .expect(201)
      ).body.data as Role;
      roleIds.push(role.id);
      const viewer = await makeUser();
      await http(app).patch(`/users/${viewer.id}`).send({ roleIds: [role.id] }).expect(200);

      await as(viewer.id, () => http(app).get('/audit').expect(403));
      await http(app)
        .patch(`/roles/${role.id}`)
        .send({ permissions: [{ key: 'core.audit.view', scope: 'all' }] })
        .expect(200);
      await as(viewer.id, async () => {
        await http(app).get('/audit').expect(200);
        const me = await http(app).get('/auth/me').expect(200);
        expect(me.body.data.permissions).toEqual(['core.audit.view']);
      });

      // Taking the role away works the same way.
      await http(app).patch(`/users/${viewer.id}`).send({ roleIds: [] }).expect(200);
      await as(viewer.id, () => http(app).get('/audit').expect(403));
    });

    it('edge case 2 — two roles: /auth/me shows the union', async () => {
      const both = await makeUser(['accountant', 'principal']);
      const me = await as(both.id, () => http(app).get('/auth/me').expect(200));
      const keys = me.body.data.permissions as string[];
      expect(keys).toEqual(expect.arrayContaining(['hr.payroll.export_bank_sheet']));
      expect(keys).toEqual(expect.arrayContaining(['hr.penalties.approve']));
      expect(keys).not.toContain('hr.payroll.approve');
    });

    it('edge case 8 — an unknown permission key stored in the DB is ignored', async () => {
      const role = (
        await http(app)
          .post('/roles')
          .send({
            nameEn: 'Old',
            nameAr: 'قديم',
            permissions: [{ key: 'hr.lateness.view', scope: 'all' }],
          })
          .expect(201)
      ).body.data as Role;
      roleIds.push(role.id);
      await db.rolePermission.create({
        data: { roleId: role.id, permissionKey: 'hr.removed.thing', scope: 'all' },
      });
      const holder = await makeUser();
      await db.userRoleAssignment.create({ data: { userId: holder.id, roleId: role.id } });
      const me = await as(holder.id, () => http(app).get('/auth/me').expect(200));
      expect(me.body.data.permissions).toEqual(['hr.lateness.view']);
      const shown = await http(app).get(`/roles/${role.id}`).expect(200);
      expect((shown.body.data as Role).permissions).toEqual([
        { key: 'hr.lateness.view', scope: 'all' },
      ]);
    });

    it('edge case 6 — a deactivated user with a live session: next request 401, refresh refused, tokens revoked', async () => {
      const person = await makeUser(['hr_officer']);
      const login = await http(app)
        .post('/auth/login')
        .set(ANONYMOUS_HEADER, '1')
        .send({ email: person.email, password: PASSWORD })
        .expect(200);
      const cookies = cookiesOf(login);
      const withSession = (path: string) =>
        http(app)
          .get(path)
          .set(ANONYMOUS_HEADER, '1')
          .set('Cookie', `${AUTH_COOKIES.access}=${cookies[AUTH_COOKIES.access]}`);
      await withSession('/hr/employees').expect(200);

      const mark = await historyMark(db);
      const res = await http(app).post(`/users/${person.id}/deactivate`).expect(200);
      expect((res.body.data as UserAccount).isActive).toBe(false);

      await withSession('/hr/employees').expect(401);
      await http(app)
        .post('/auth/refresh')
        .set(ANONYMOUS_HEADER, '1')
        .set('Cookie', `${AUTH_COOKIES.refresh}=${cookies[AUTH_COOKIES.refresh]}`)
        .expect(401);
      const live = await db.refreshToken.count({ where: { userId: person.id, revokedAt: null } });
      expect(live).toBe(0);
      const [entry] = await entriesAfter(mark, 'core.user.deactivate');
      expect(entry?.changes as unknown as AuditChange[]).toEqual([
        { field: 'status', before: 'active', after: 'inactive' },
      ]);

      // Reactivated: they sign in again; the old refresh token stays dead.
      await http(app).post(`/users/${person.id}/reactivate`).expect(200);
      await http(app)
        .post('/auth/refresh')
        .set(ANONYMOUS_HEADER, '1')
        .set('Cookie', `${AUTH_COOKIES.refresh}=${cookies[AUTH_COOKIES.refresh]}`)
        .expect(401);
      await http(app)
        .post('/auth/login')
        .set(ANONYMOUS_HEADER, '1')
        .send({ email: person.email, password: PASSWORD })
        .expect(200);
    });

    it('edge case 5 — the last active System admin can’t lose the role or be deactivated', async () => {
      // Make the test user the only active System admin for this test.
      const others = await db.user.findMany({
        where: {
          id: { not: user.id },
          isActive: true,
          roles: { some: { role: { key: 'system_admin' } } },
        },
        select: { id: true },
      });
      const otherIds = others.map((o) => o.id);
      await db.user.updateMany({ where: { id: { in: otherIds } }, data: { isActive: false } });
      try {
        const mark = await historyMark(db);
        const lose = await http(app)
          .patch(`/users/${user.id}`)
          .send({ roleIds: [roleId('hr_manager')] })
          .expect(409);
        expect(lose.body.error).toBe(ErrorCode.LAST_SYSTEM_ADMIN);
        const off = await http(app).post(`/users/${user.id}/deactivate`).expect(409);
        expect(off.body.error).toBe(ErrorCode.LAST_SYSTEM_ADMIN);
        // Nothing changed, nothing recorded.
        const roles = await db.userRoleAssignment.findMany({
          where: { userId: user.id },
          select: { role: { select: { key: true } } },
        });
        expect(roles.map((r) => r.role.key).sort()).toEqual(['hr_manager', 'system_admin']);
        expect(await entriesAfter(mark)).toEqual([]);

        // With a second active System admin, the first may step down.
        const second = await makeUser(['system_admin']);
        await http(app)
          .patch(`/users/${second.id}`)
          .send({ roleIds: [roleId('hr_officer')] })
          .expect(200);
        // …but now the test user is the last one again.
        await http(app).post(`/users/${user.id}/deactivate`).expect(409);
      } finally {
        await db.user.updateMany({ where: { id: { in: otherIds } }, data: { isActive: true } });
      }
    });

    it('temporary password: the old one stops working, the user must change it; then changes their own', async () => {
      const person = await makeUser(['hr_officer']);
      const temp = 'temporary-pass-456';
      await http(app).post(`/users/${person.id}/password`).send({ password: temp }).expect(204);
      const login = (password: string) =>
        http(app)
          .post('/auth/login')
          .set(ANONYMOUS_HEADER, '1')
          .send({ email: person.email, password });
      await login(PASSWORD).expect(401);
      await login(temp).expect(200);
      expect((await http(app).get(`/users/${person.id}`).expect(200)).body.data).toMatchObject({
        mustChangePassword: true,
      });

      await as(person.id, async () => {
        const wrong = await http(app)
          .post('/account/password')
          .send({ currentPassword: 'not-it', newPassword: 'my-own-password-789' })
          .expect(400);
        expect(wrong.body.error).toBe(ErrorCode.WRONG_PASSWORD);
        await http(app)
          .post('/account/password')
          .send({ currentPassword: temp, newPassword: 'my-own-password-789' })
          .expect(204);
      });
      await login('my-own-password-789').expect(200);
      expect((await http(app).get(`/users/${person.id}`).expect(200)).body.data).toMatchObject({
        mustChangePassword: false,
      });
      const entries = await db.auditEntry.findMany({
        where: { entityId: person.id, action: { startsWith: 'core.user.' } },
        orderBy: { seq: 'asc' },
      });
      expect(entries.map((e) => e.action)).toEqual([
        'core.user.set_password',
        'core.user.change_password',
      ]);
      expect(JSON.stringify(entries.map((e) => e.changes))).not.toMatch(
        /temporary-pass|my-own-password/,
      );
      expect(entries.map((e) => e.changes)).toEqual([[], []]);
    });
  });

  describe('screens (P3)', () => {
    /** Signs `email` in for real and returns a request maker carrying that session's cookie. */
    async function session(email: string, password: string) {
      const res = await http(app)
        .post('/auth/login')
        .set(ANONYMOUS_HEADER, '1')
        .send({ email, password })
        .expect(200);
      const cookies = cookiesOf(res);
      const cookie = `${AUTH_COOKIES.access}=${cookies[AUTH_COOKIES.access]}`;
      return {
        login: res.body.data as { user: AuthUser },
        get: (path: string) => http(app).get(path).set(ANONYMOUS_HEADER, '1').set('Cookie', cookie),
        post: (path: string, body: object = {}) =>
          http(app).post(path).set(ANONYMOUS_HEADER, '1').set('Cookie', cookie).send(body),
      };
    }

    it('forced change: with a temporary password only /auth/me, sign-out and a new password answer', async () => {
      const temp = 'temporary-pass-p3-1';
      const created = await http(app)
        .post('/users')
        .send({
          name: 'Forced Person',
          email: `${unique('forced')}@school.test`.toLowerCase(),
          password: temp,
          roleIds: [roleId('hr_officer')],
        })
        .expect(201);
      const person = created.body.data as UserAccount;
      userIds.push(person.id);

      const s = await session(person.email, temp);
      // The sign-in response says so, and /auth/me too (the web app sends them to the page).
      expect(s.login.user.mustChangePassword).toBe(true);
      const me = await s.get('/auth/me').expect(200);
      expect(me.body.data).toMatchObject({ mustChangePassword: true, roles: [{ key: 'hr_officer' }] });

      // Everything else is refused — even what their role allows, and My account.
      for (const path of ['/hr/employees', '/account', '/settings/school']) {
        const refused = await s.get(path).expect(403);
        expect(refused.body.error).toBe(ErrorCode.PASSWORD_CHANGE_REQUIRED);
      }
      // The temporary one can't be reused as the new one.
      const same = await s.post('/account/password', { newPassword: temp }).expect(400);
      expect(same.body.error).toBe(ErrorCode.SAME_PASSWORD);
      // The new one alone is enough: the sign-in just proved the temporary one.
      await s.post('/account/password', { newPassword: 'my-own-password-p3' }).expect(204);

      // Same session, next request: the app opens up to what the role allows.
      await s.get('/hr/employees').expect(200);
      await s.get('/users').expect(403); // HR officer: no core.users.view
      expect((await s.get('/auth/me').expect(200)).body.data.mustChangePassword).toBe(false);
      const account = (await s.get('/account').expect(200)).body.data as UserAccount;
      expect(account).toMatchObject({ id: person.id, mustChangePassword: false });
      expect(account.passwordChangedAt).not.toBeNull();
      expect(account.lastSignInAt).not.toBeNull();
    });

    it('sign-out works while a new password is still owed', async () => {
      const person = await makeUser(['hr_officer']);
      await db.user.update({ where: { id: person.id }, data: { mustChangePassword: true } });
      const s = await session(person.email, PASSWORD);
      await s.post('/auth/logout').expect(200);
    });

    it('without a temporary password, changing it still needs the current one', async () => {
      const person = await makeUser(['hr_officer']);
      const s = await session(person.email, PASSWORD);
      const res = await s.post('/account/password', { newPassword: 'my-own-password-p3' }).expect(400);
      expect(res.body.error).toBe(ErrorCode.WRONG_PASSWORD);
    });

    it('a sign-in is remembered (Users → Last sign-in)', async () => {
      const person = await makeUser(['hr_officer']);
      const before = (await http(app).get(`/users/${person.id}`).expect(200)).body.data as UserAccount;
      expect(before.lastSignInAt).toBeNull();
      await session(person.email, PASSWORD);
      const after = (await http(app).get(`/users/${person.id}`).expect(200)).body.data as UserAccount;
      expect(after.lastSignInAt).not.toBeNull();
    });

    it('the users list filters by role (the role filter, a role’s holders)', async () => {
      const role = (
        await http(app)
          .post('/roles')
          .send({ nameEn: unique('Holders'), nameAr: 'حاملون', permissions: [] })
          .expect(201)
      ).body.data as Role;
      roleIds.push(role.id);
      const holder = await makeUser();
      await db.userRoleAssignment.create({ data: { userId: holder.id, roleId: role.id } });
      await makeUser(['hr_officer']);
      const res = await http(app).get(`/users?roleId=${role.id}`).expect(200);
      expect((res.body.data as UserAccount[]).map((u) => u.id)).toEqual([holder.id]);
      expect(res.body.meta.total).toBe(1);
      await http(app).get('/users?roleId=not-a-uuid').expect(400);
    });

    it('employee options: search by name or code, each with the account already linked', async () => {
      const linked = await makeUser();
      await db.user.update({ where: { id: linked.id }, data: { employeeId: listRefs.employee } });
      try {
        const res = await http(app).get('/users/employee-options?search=Linked%20Person').expect(200);
        const [option] = res.body.data as EmployeeOption[];
        expect(option).toMatchObject({
          id: listRefs.employee,
          isActive: true,
          linkedUser: { id: linked.id, name: linked.name },
        });
        expect(option?.jobTitle).toEqual({ nameEn: expect.any(String), nameAr: 'و' });
        const byCode = await http(app)
          .get(`/users/employee-options?search=${encodeURIComponent(option?.code ?? '')}`)
          .expect(200);
        expect((byCode.body.data as EmployeeOption[]).map((o) => o.id)).toEqual([listRefs.employee]);
      } finally {
        await db.user.update({ where: { id: linked.id }, data: { employeeId: null } });
      }
    });

    it('the avatar: accounts, /auth/me, the audit actors and the employee options carry the linked employee’s photo and gender', async () => {
      const photoUrl = '/files/employee-photos/avatar-e2e.jpg';
      const linked = await makeUser();
      const plain = await makeUser();
      await db.employee.update({ where: { id: listRefs.employee }, data: { photoUrl } });
      await db.user.update({ where: { id: linked.id }, data: { employeeId: listRefs.employee } });
      try {
        const account = (await http(app).get(`/users/${linked.id}`).expect(200)).body.data as UserAccount;
        expect(account.employee).toEqual({
          id: listRefs.employee,
          code: expect.any(String),
          nameEn: 'Linked Person',
          nameAr: 'شخص',
          photoUrl,
          gender: 'FEMALE',
        });
        const unlinked = (await http(app).get(`/users/${plain.id}`).expect(200)).body.data as UserAccount;
        expect(unlinked.employee).toBeNull();

        // The user chip: only the photo and gender, never more of the employee.
        await as(linked.id, async () => {
          const me = await http(app).get('/auth/me').expect(200);
          expect(me.body.data.employee).toEqual({ photoUrl, gender: 'FEMALE' });
        });
        await as(plain.id, async () => {
          const me = await http(app).get('/auth/me').expect(200);
          expect(me.body.data.employee).toBeNull();
        });

        // Activity's Person filter: each actor with their account's linked employee, or null.
        for (const u of [linked, plain]) {
          await db.auditEntry.create({
            data: {
              action: 'core.user.update',
              module: 'core',
              entityType: 'user',
              entityId: u.id,
              entityLabel: u.name,
              actorId: u.id,
              actorName: u.name,
            },
          });
        }
        const actors = (await http(app).get('/audit/actors').expect(200)).body.data as AuditActor[];
        expect(actors.find((a) => a.id === linked.id)).toEqual({
          id: linked.id,
          name: linked.name,
          employee: { photoUrl, gender: 'FEMALE' },
        });
        expect(actors.find((a) => a.id === plain.id)?.employee).toBeNull();

        const options = await http(app).get('/users/employee-options?search=Linked%20Person').expect(200);
        expect((options.body.data as EmployeeOption[])[0]).toMatchObject({ photoUrl, gender: 'FEMALE' });
      } finally {
        await db.user.update({ where: { id: linked.id }, data: { employeeId: null } });
        await db.employee.update({ where: { id: listRefs.employee }, data: { photoUrl: null } });
      }
    });

    it('employee options need core.users.manage (403 for a viewer of users)', async () => {
      const role = (
        await http(app)
          .post('/roles')
          .send({
            nameEn: unique('Viewer'),
            nameAr: 'مطلع',
            permissions: [{ key: 'core.users.view', scope: 'all' }],
          })
          .expect(201)
      ).body.data as Role;
      roleIds.push(role.id);
      const viewer = await makeUser();
      await db.userRoleAssignment.create({ data: { userId: viewer.id, roleId: role.id } });
      await as(viewer.id, async () => {
        await http(app).get('/users').expect(200);
        await http(app).get('/users/employee-options').expect(403);
        await http(app).post(`/users/${viewer.id}/deactivate`).expect(403);
      });
    });

    it('a whole-school permission can’t be scoped (INVALID_SCOPE); a row-level one can', async () => {
      const bad = await http(app)
        .post('/roles')
        .send({
          nameEn: unique('Bad'),
          nameAr: 'خطأ',
          permissions: [{ key: 'hr.payroll.approve', scope: 'own_stage' }],
        })
        .expect(400);
      expect(bad.body.error).toBe(ErrorCode.INVALID_SCOPE);
      const good = await http(app)
        .post('/roles')
        .send({
          nameEn: unique('Good'),
          nameAr: 'جيد',
          permissions: [{ key: 'hr.penalties.view', scope: 'own_team' }],
        })
        .expect(201);
      roleIds.push((good.body.data as Role).id);
    });
  });
});
