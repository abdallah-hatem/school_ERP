import { INestApplication } from '@nestjs/common';
import { AUTH_COOKIES, type CreateEmployeeRequest, type Employee, type Role, type UserAccount } from '@school-erp/shared';
import { DatabaseService } from '../src/database/database.service';
import { http, unique } from './helpers';
import { ANONYMOUS_HEADER, createAppAsTestUser } from './helpers/as-test-user';

/*
 * Files follow their record (docs/ARCHITECTURE.md → Security): an employee photo opens for whoever
 * may see that employee — `hr.employees.view` and its scope — and for the employee themselves;
 * anyone else gets 404, as for the employee. The test user (HR admin) makes everything through the
 * API; each reader is a real account that signs in and sets its own password through the API, and
 * opens files with its session cookie. `/files/…` is checked by FilesAccessMiddleware (a real
 * session) before any guard, so the test user's stand-in guard can't stand in for a reader here.
 *
 *   inA  (stage A)  ← linked to the stage head (hr.employees.view, own_stage)
 *   inA2 (stage A)
 *   inB  (stage B)  ← linked to the self user (hr.employees.view, self)
 *   the "all" reader: hr.employees.view at scope all; "none": no permission at all.
 */

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const TEMPORARY = 'a-temporary-password-1';
const OWN = 'my-own-password-123';

/** `name=value; …` for the session cookies a response set. */
function sessionCookie(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? (raw as string[]) : raw ? [String(raw)] : [];
  return list
    .map((c) => c.split(';')[0] ?? '')
    .filter((pair) => pair.startsWith(`${AUTH_COOKIES.access}=`) || pair.startsWith(`${AUTH_COOKIES.refresh}=`))
    .join('; ');
}

describe('file access follows the record (e2e)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  const made = { stages: [] as string[], departments: [] as string[], jobTitles: [] as string[], employees: [] as string[], roles: [] as string[], users: [] as string[] };
  const photo = { inA: '', inA2: '', inB: '' };
  const session = { stageHead: '', self: '', all: '', none: '' };

  /** GET as a signed-in reader (their cookie, through the real auth). */
  const as = (cookie: string, url: string) => http(app).get(url).set(ANONYMOUS_HEADER, '1').set('Cookie', cookie);
  const status = async (cookie: string, url: string) => (await as(cookie, url)).status;

  beforeAll(async () => {
    ({ app } = await createAppAsTestUser());
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
    /** A reader: made by the admin, signs in, sets their own password, signs in again. */
    const reader = async (employeeId: string | null, roleIds: string[]): Promise<string> => {
      const email = `${unique('files')}@school.test`.toLowerCase();
      const u = (
        await http(app).post('/users').send({ name: unique('Reader'), email, password: TEMPORARY, roleIds, employeeId }).expect(201)
      ).body.data as UserAccount;
      made.users.push(u.id);
      const first = await http(app).post('/auth/login').set(ANONYMOUS_HEADER, '1').send({ email, password: TEMPORARY }).expect(200);
      await http(app)
        .post('/account/password')
        .set(ANONYMOUS_HEADER, '1')
        .set('Cookie', sessionCookie(first))
        .send({ newPassword: OWN })
        .expect(204);
      const signedIn = await http(app).post('/auth/login').set(ANONYMOUS_HEADER, '1').send({ email, password: OWN }).expect(200);
      return sessionCookie(signedIn);
    };
    session.stageHead = await reader(inA.id, [await role('own_stage')]);
    session.self = await reader(inB.id, [await role('self')]);
    session.all = await reader(null, [await role('all')]);
    session.none = await reader(null, []);
  });

  afterAll(async () => {
    const emails = (await db.user.findMany({ where: { id: { in: made.users } }, select: { email: true } })).map((u) => u.email);
    await db.loginAttempt.deleteMany({ where: { email: { in: emails } } });
    await db.user.deleteMany({ where: { id: { in: made.users } } }); // tokens cascade
    await db.role.deleteMany({ where: { id: { in: made.roles } } });
    await db.employee.deleteMany({ where: { id: { in: made.employees } } });
    await db.department.deleteMany({ where: { id: { in: made.departments } } });
    await db.jobTitle.deleteMany({ where: { id: { in: made.jobTitles } } });
    await db.stage.deleteMany({ where: { id: { in: made.stages } } });
    await app.close();
  });

  it('a stage head opens the photos of their stage’s employees; another stage’s → 404, like the employee', async () => {
    expect(await status(session.stageHead, photo.inA)).toBe(200);
    expect(await status(session.stageHead, photo.inA2)).toBe(200);
    expect(await status(session.stageHead, photo.inB)).toBe(404);
    const res = await as(session.stageHead, photo.inA2);
    expect(res.headers).toMatchObject({ 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'content-type': 'image/png' });
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
  });

  it('a self-scope user opens their own photo only', async () => {
    expect(await status(session.self, photo.inB)).toBe(200);
    expect(await status(session.self, photo.inA)).toBe(404);
  });

  it('no view permission: nothing but 404 (and no hint the file exists)', async () => {
    const real = await as(session.none, photo.inA);
    const missing = await as(session.none, '/files/employee-photos/nobody-0000.png');
    expect(real.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(real.body.error).toBe(missing.body.error);
  });

  it('scope all opens every photo', async () => {
    for (const url of Object.values(photo)) expect(await status(session.all, url)).toBe(200);
  });

  it('signed out → 401 (who you are comes first); signed in, an unknown folder → 404; the logo stays public', async () => {
    await http(app).get(photo.inA).set(ANONYMOUS_HEADER, '1').expect(401);
    await http(app).get('/files/contracts/contract.pdf').set(ANONYMOUS_HEADER, '1').expect(401);
    expect(await status(session.all, '/files/contracts/contract.pdf')).toBe(404);
    expect(await status(session.all, '/files/payslips/a.pdf')).toBe(404);
    const logo = (
      await http(app).post('/settings/school/logo').attach('file', PNG, { filename: 'logo.png', contentType: 'image/png' }).expect(201)
    ).body.data.logoUrl as string;
    await http(app).get(logo).set(ANONYMOUS_HEADER, '1').expect(200);
  });

  it('a replaced photo belongs to nobody: its old URL → 404 even at scope all', async () => {
    const id = made.employees[1] ?? '';
    await http(app).post(`/hr/employees/${id}/photo`).attach('file', PNG, { filename: 'new.png', contentType: 'image/png' }).expect(200);
    expect(await status(session.all, photo.inA2)).toBe(404);
  });
});
