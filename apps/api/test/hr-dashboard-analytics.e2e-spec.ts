import { INestApplication } from '@nestjs/common';
import { BuiltInRole, monthOf, schoolDayOf, type AuthUser, type HrDashboardAnalytics } from '@school-erp/shared';
import { DatabaseService } from '../src/database/database.service';
import { http, unique } from './helpers';
import { createAppAsTestUser, giveRoles } from './helpers/as-test-user';

/**
 * `GET /hr/dashboard/analytics` (§2, owner 2026-11-21): the home page's charts. Only the System
 * admin holds `hr.dashboard.view_analytics` at the start (the test user is System admin + HR
 * manager); an admin can grant it to any role. On top of it each part follows its screen's rules:
 * a role limited to its stage counts only that stage, and gets no money without salaries.
 */
describe('dashboard analytics (e2e)', () => {
  let app: INestApplication;
  let user: AuthUser;
  let db: DatabaseService;
  const today = schoolDayOf(new Date());
  const month = monthOf(today);
  let stageId: string;
  const ids = { joiner: '', veteran: '' };
  const users = { hrManager: '', principal: '', stageCharts: '' };

  async function asUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const own = user.id;
    user.id = userId;
    try {
      return await fn();
    } finally {
      user.id = own;
    }
  }

  const analytics = async (query: Record<string, string> = {}) =>
    (await http(app).get('/hr/dashboard/analytics').query(query).expect(200)).body.data as HrDashboardAnalytics;

  beforeAll(async () => {
    ({ app, user } = await createAppAsTestUser());
    db = app.get(DatabaseService);
    stageId = (await db.stage.create({ data: { nameEn: unique('Charts'), nameAr: unique('رسوم') } })).id;
    const departmentId = (
      await http(app).post('/hr/departments').send({ nameEn: unique('D'), nameAr: unique('ق') }).expect(201)
    ).body.data.id as string;
    const jobTitleId = (
      await http(app).post('/hr/job-titles').send({ nameEn: unique('T'), nameAr: unique('و') }).expect(201)
    ).body.data.id as string;
    const createEmployee = async (hireDate: string) =>
      (
        await http(app)
          .post('/hr/employees')
          .send({
            nameEn: unique('Employee'),
            nameAr: unique('موظف'),
            gender: 'FEMALE',
            dateOfBirth: '1990-01-01',
            phone: '01000000000',
            hireDate,
            stageId,
            departmentId,
            jobTitleId,
            workSystem: 'FULL_TIME',
            basicSalary: 1_000_000,
          })
          .expect(201)
      ).body.data.id as string;
    ids.joiner = await createEmployee(today);
    ids.veteran = await createEmployee('2020-09-01');

    const newUser = async (label: string, employeeId: string | null, roles: string[]) => {
      const row = await db.user.create({
        data: { email: `${unique(label)}@example.test`, name: label, passwordHash: 'x', employeeId },
        select: { id: true },
      });
      await giveRoles(db, row.id, roles);
      return row.id;
    };
    // A custom role an admin was given the charts to: its own stage's employees only.
    const role = await db.role.create({
      data: {
        key: unique('charts_stage'),
        nameEn: 'Stage charts',
        nameAr: 'رسوم المرحلة',
        permissions: {
          create: [
            { permissionKey: 'hr.dashboard.view_analytics', scope: 'all' },
            { permissionKey: 'hr.employees.view', scope: 'own_stage' },
          ],
        },
      },
      select: { key: true },
    });
    users.hrManager = await newUser('hr-manager', null, [BuiltInRole.HR_MANAGER]);
    users.principal = await newUser('principal', null, [BuiltInRole.PRINCIPAL]);
    users.stageCharts = await newUser('stage-charts', ids.joiner, [role.key]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('the System admin: 6 months by default or 12, ending with this month', async () => {
    const six = await analytics();
    expect(six.range).toBe(6);
    expect(six.months).toHaveLength(6);
    expect(six.months.at(-1)).toBe(month);
    for (const series of [six.payroll, six.flow, six.penalties, six.lateness]) expect(series).toHaveLength(6);
    const twelve = await analytics({ months: '12' });
    expect(twelve.months).toHaveLength(12);
    expect(typeof twelve.approvedMonths).toBe('number');
  });

  it('any other range is a 400 VALIDATION_FAILED', async () => {
    for (const months of ['7', '0', '24', 'all']) {
      const res = await http(app).get('/hr/dashboard/analytics').query({ months }).expect(400);
      expect(res.body.error).toBe('VALIDATION_FAILED');
    }
    await http(app).get('/hr/dashboard/analytics').query({ months: '6', page: '1' }).expect(400);
  });

  it('no starting role but the System admin may see them: the HR manager and the principal get 403', async () => {
    await asUser(users.hrManager, () => http(app).get('/hr/dashboard/analytics').expect(403));
    await asUser(users.principal, () => http(app).get('/hr/dashboard/analytics').expect(403));
    // The rest of the dashboard is unchanged for them.
    await asUser(users.hrManager, () => http(app).get('/hr/dashboard').expect(200));
  });

  it('a role granted the charts sees its stage only, and nothing it has no screen for', async () => {
    const before = await asUser(users.stageCharts, () => analytics());
    expect(before.payroll).toBeNull();
    expect(before.penalties).toBeNull();
    expect(before.lateness).toBeNull();
    expect(before.deductions).toBeNull();
    expect(before.headcountByStage).toEqual([{ stage: expect.objectContaining({ id: stageId }), count: 2, share: 1, noStage: false }]);
    expect(before.flow!.at(-1)).toEqual({ month, joiners: 1, leavers: 0, headcountEnd: 2 });

    // A leaver counts in the month they were deactivated.
    await http(app).post(`/hr/employees/${ids.veteran}/deactivate`).expect(200);
    const after = await asUser(users.stageCharts, () => analytics());
    expect(after.flow!.at(-1)).toEqual({ month, joiners: 1, leavers: 1, headcountEnd: 1 });

    // Reactivated: no longer a leaver.
    await http(app).post(`/hr/employees/${ids.veteran}/reactivate`).expect(200);
    const back = await asUser(users.stageCharts, () => analytics());
    expect(back.flow!.at(-1)).toEqual({ month, joiners: 1, leavers: 0, headcountEnd: 2 });
  });
});
