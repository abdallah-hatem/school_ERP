import { INestApplication } from '@nestjs/common';
import type { AuthUser, CreateEmployeeRequest, Employee, Role, UserAccount } from '@school-erp/shared';
import { DatabaseService } from '../src/database/database.service';
import { http, unique } from './helpers';
import { ANONYMOUS_HEADER, createAppAsTestUser } from './helpers/as-test-user';

/*
 * Files follow their record (docs/ARCHITECTURE.md → Security): an employee photo opens for whoever
 * may see that employee — `hr.employees.view` and its scope — and for the employee themselves;
 * anyone else gets 404, as for the employee. Everything is made through the API as the HR admin
 * (the test user); requests "as" another user swap the test user's id (like hr-visibility).
 *
 *   inA  (stage A)  ← linked to the stage head (hr.employees.view, own_stage)
 *   inA2 (stage A)
 *   inB  (stage B)  ← linked to the self user (hr.employees.view, self)
 */

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);

describe('file access follows the record (e2e)', () => {
  let app: INestApplication;
  let user: AuthUser;
  let db: DatabaseService;
  const made = { stages: [] as string[], departments: [] as string[], jobTitles: [] as string[], employees: [] as string[], roles: [] as string[], users: [] as string[] };
  const photo = { inA: '', inA2: '', inB: '' };
  const users = { stageHead: '', self: '', none: '' };

  async function asUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const own = user.id;
    user.id = userId;
    try {
      return await fn();
    } finally {
      user.id = own;
    }
  }
  const status = async (url: string) => (await http(app).get(url)).status;

  beforeAll(async () => {
    ({ app, user } = await createAppAsTestUser());
    db = app.get(DatabaseService);

    const stage = async () => {
      const id = (await http(app).post('/stages').send({ nameEn: unique('Stage'), nameAr: unique('مرحلة') }).expect(201)).body.data.id as string;
      made.stages.push(id);
      return id;
    };
    const [stageA, stageB] = [await stage(), await stage()];
    const departmentId = (await http(app).post('/hr/departments').send({ nameEn: unique('D'), nameAr: unique('ق') }).expect(201)).body.data.id as string;
    const jobTitleId = (await http(app).post('/hr/job-titles').send({ nameEn: unique('T'), nameAr: unique('و') }).expect(201)).body.data.id as string;
    made.departments.push(departmentId);
    made.jobTitles.push(jobTitleId);

    const employeeWithPhoto = async (stageId: string): Promise<{ id: string; photoUrl: string }> => {
      const body: CreateEmployeeRequest = {
        nameEn: unique('Employee'),
        nameAr: unique('موظف'),
        gender: 'MALE',
        dateOfBirth: '1990-01-01',
        phone: '01000000000',
        hireDate: '2022-09-01',
        stageId,
        departmentId,
        jobTitleId,
        workSystem: 'FULL_TIME',
        basicSalary: 1_000_000,
      };
      const e = (await http(app).post('/hr/employees').send(body).expect(201)).body.data as Employee;
      made.employees.push(e.id);
      const withPhoto = (
        await http(app).post(`/hr/employees/${e.id}/photo`).attach('file', PNG, { filename: 'p.png', contentType: 'image/png' }).expect(200)
      ).body.data as Employee;
      return { id: e.id, photoUrl: withPhoto.photoUrl ?? '' };
    };
    const inA = await employeeWithPhoto(stageA);
    const inA2 = await employeeWithPhoto(stageA);
    const inB = await employeeWithPhoto(stageB);
    Object.assign(photo, { inA: inA.photoUrl, inA2: inA2.photoUrl, inB: inB.photoUrl });

    const role = async (scope: string) => {
      const r = (
        await http(app).post('/roles').send({ nameEn: unique('Role'), nameAr: unique('دور'), permissions: [{ key: 'hr.employees.view', scope }] }).expect(201)
      ).body.data as Role;
      made.roles.push(r.id);
      return r.id;
    };
    const account = async (employeeId: string | null, roleIds: string[]) => {
      const u = (
        await http(app)
          .post('/users')
          .send({ name: unique('User'), email: `${unique('files')}@school.test`.toLowerCase(), password: 'a-long-password-1', roleIds, employeeId })
          .expect(201)
      ).body.data as UserAccount;
      made.users.push(u.id);
      return u.id;
    };
    users.stageHead = await account(inA.id, [await role('own_stage')]);
    users.self = await account(inB.id, [await role('self')]);
    users.none = await account(null, []);
  });

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { in: made.users } } });
    await db.role.deleteMany({ where: { id: { in: made.roles } } });
    await db.employee.deleteMany({ where: { id: { in: made.employees } } });
    await db.department.deleteMany({ where: { id: { in: made.departments } } });
    await db.jobTitle.deleteMany({ where: { id: { in: made.jobTitles } } });
    await db.stage.deleteMany({ where: { id: { in: made.stages } } });
    await app.close();
  });

  it('a stage head opens the photos of their stage’s employees; another stage’s → 404, like the employee', async () => {
    await asUser(users.stageHead, async () => {
      expect(await status(photo.inA)).toBe(200);
      expect(await status(photo.inA2)).toBe(200);
      expect(await status(photo.inB)).toBe(404);
    });
    const res = await asUser(users.stageHead, () => http(app).get(photo.inA2));
    expect(res.headers).toMatchObject({ 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'content-type': 'image/png' });
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
  });

  it('a self-scope user opens their own photo only', async () => {
    await asUser(users.self, async () => {
      expect(await status(photo.inB)).toBe(200);
      expect(await status(photo.inA)).toBe(404);
    });
  });

  it('no view permission: nothing but 404 (and no hint the file exists)', async () => {
    await asUser(users.none, async () => {
      const real = await http(app).get(photo.inA);
      const missing = await http(app).get('/files/employee-photos/nobody-0000.png');
      expect(real.status).toBe(404);
      expect(missing.status).toBe(404);
      expect(real.body.error).toBe(missing.body.error);
    });
  });

  it('the HR admin (scope all) opens every photo', async () => {
    for (const url of Object.values(photo)) expect(await status(url)).toBe(200);
  });

  it('signed out → 401; an unknown folder → 404; the logo stays public', async () => {
    await http(app).get(photo.inA).set(ANONYMOUS_HEADER, '1').expect(401);
    await http(app).get('/files/contracts/contract.pdf').expect(404);
    await http(app).get('/files/payslips/a.pdf').expect(404);
    const logo = (
      await http(app).post('/settings/school/logo').attach('file', PNG, { filename: 'logo.png', contentType: 'image/png' }).expect(201)
    ).body.data.logoUrl as string;
    await http(app).get(logo).set(ANONYMOUS_HEADER, '1').expect(200);
  });

  it('a replaced photo belongs to nobody: its old URL → 404 even for the HR admin', async () => {
    const id = made.employees[1] ?? '';
    await http(app).post(`/hr/employees/${id}/photo`).attach('file', PNG, { filename: 'new.png', contentType: 'image/png' }).expect(200);
    expect(await status(photo.inA2)).toBe(404);
  });
});
