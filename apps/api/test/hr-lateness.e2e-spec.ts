import { INestApplication } from '@nestjs/common';
import {
  ErrorCode,
  SETTING_DEFAULTS,
  HrSettingKey,
  type CreateEmployeeRequest,
  type LatenessMonth,
  type LatenessSummary,
  type LatenessRow,
} from '@school-erp/shared';
import { DatabaseService } from '../src/database/database.service';
import { http, unique } from './helpers';
import { createAppAsTestUser } from './helpers/as-test-user';

// Months far from any real data, so this suite owns its rows.
const MONTH = '2098-01';
const OTHER_MONTH = '2098-02';
const APPROVED_MONTH = '2098-03';
const DRAFT_MONTH = '2098-04';
const MONTHS = [MONTH, OTHER_MONTH, APPROVED_MONTH, DRAFT_MONTH];

const DEFAULT_LATENESS = {
  graceMinutes: SETTING_DEFAULTS[HrSettingKey.LATENESS_GRACE_MINUTES],
  steps: SETTING_DEFAULTS[HrSettingKey.LATENESS_STEPS],
  extraHourDays: SETTING_DEFAULTS[HrSettingKey.LATENESS_EXTRA_HOUR_DAYS],
};

describe('Monthly lateness — /hr/lateness (e2e)', () => {
  let app: INestApplication;
  let userId: string;
  let db: DatabaseService;
  let stageId: string;
  let departmentId: string;
  let jobTitleId: string;

  const MISSING_ID = '11111111-1111-4111-8111-111111111111';

  const newEmployee = async (overrides: Partial<CreateEmployeeRequest> = {}) => {
    const body: CreateEmployeeRequest = {
      nameEn: unique('Late'),
      nameAr: unique('متأخر'),
      gender: 'MALE',
      dateOfBirth: '1990-01-01',
      phone: '01000000000',
      hireDate: '2024-09-01',
      stageId,
      departmentId,
      jobTitleId,
      workSystem: 'FULL_TIME',
      basicSalary: 1000000,
      ...overrides,
    };
    return (await http(app).post('/hr/employees').send(body).expect(201)).body.data.id as string;
  };

  const get = (month: string, query: Record<string, string | number> = {}) =>
    http(app).get('/hr/lateness').query({ month, ...query });
  const put = (month: string, entries: unknown) =>
    http(app).put(`/hr/lateness/${month}`).send({ entries });
  /** Every row of the month (one page of 100 holds this suite's employees). */
  const rows = async (month: string) =>
    ((await get(month, { limit: 100 }).expect(200)).body.data as LatenessMonth).items;
  const rowOf = (list: LatenessRow[], id: string) => list.find((r) => r.employee.id === id);

  beforeAll(async () => {
    ({ app, user: { id: userId } } = await createAppAsTestUser());
    db = app.get(DatabaseService);
    stageId = (await db.stage.create({ data: { nameEn: 'Lateness', nameAr: 'تأخير' } })).id;
    const mk = async (path: string) =>
      (await http(app).post(path).send({ nameEn: unique('L'), nameAr: unique('ل') }).expect(201))
        .body.data.id as string;
    departmentId = await mk('/hr/departments');
    jobTitleId = await mk('/hr/job-titles');
    await db.payrollRun.deleteMany({ where: { month: { in: MONTHS } } });
    await db.payrollRun.create({
      data: { month: APPROVED_MONTH, status: 'APPROVED', approvedAt: new Date() },
    });
    await db.payrollRun.create({ data: { month: DRAFT_MONTH, status: 'DRAFT' } });
  });

  afterEach(async () => {
    // Restore the default rule through the public API (storage is the settings module's concern).
    await http(app).patch('/hr/settings').send({ lateness: DEFAULT_LATENESS }).expect(200);
  });

  afterAll(async () => {
    await db.latenessEntry.deleteMany({});
    await db.payrollRun.deleteMany({ where: { month: { in: MONTHS } } });
    await db.employee.updateMany({ data: { managerId: null } });
    await db.employee.deleteMany({});
    await db.department.deleteMany({});
    await db.jobTitle.deleteMany({});
    await db.stage.deleteMany({});
    await app.close();
  });

  it('full flow: GET shows every active employee at 0 → PUT some → GET shows minutes and days; stored per month', async () => {
    const a = await newEmployee();
    const b = await newEmployee();

    const before = await rows(MONTH);
    expect(rowOf(before, a)).toMatchObject({ minutes: 0, days: 0 });
    expect(rowOf(before, b)).toMatchObject({ minutes: 0, days: 0 });
    expect(rowOf(before, a)!.employee).toEqual({
      id: a,
      code: expect.stringMatching(/^EMP-\d{4}$/),
      nameEn: expect.any(String),
      nameAr: expect.any(String),
    });

    const res = await put(MONTH, [
      { employeeId: a, minutes: 61 },
      { employeeId: b, minutes: 121 },
    ]).expect(200);
    expect(res.body).toMatchObject({ success: true, statusCode: 200 });
    // The save answers with the month's lock, rule and totals; the rows are re-read.
    expect(res.body.data).not.toHaveProperty('items');
    const after = await rows(MONTH);
    expect(rowOf(after, a)).toMatchObject({ minutes: 61, days: 0.75 });
    expect(rowOf(after, b)).toMatchObject({ minutes: 121, days: 1.25 });
    expect(rowOf(await rows(MONTH), a)).toMatchObject({ minutes: 61, days: 0.75 });

    // Stored with who changed it; another month is untouched.
    const stored = await db.latenessEntry.findUnique({
      where: { employeeId_month: { employeeId: a, month: MONTH } },
    });
    expect(stored).toMatchObject({ minutes: 61, updatedById: userId });
    expect(rowOf(await rows(OTHER_MONTH), a)).toMatchObject({ minutes: 0, days: 0 });

    // A DRAFT run doesn't lock the month.
    await put(DRAFT_MONTH, [{ employeeId: a, minutes: 30 }]).expect(200);
  });

  it('locked is false for an open month (no run, or a DRAFT run) and true once the payroll is APPROVED', async () => {
    await newEmployee();
    const open = (await get(MONTH).expect(200)).body.data as LatenessMonth;
    expect(open.locked).toBe(false);
    expect(Array.isArray(open.items)).toBe(true);
    expect(((await get(DRAFT_MONTH).expect(200)).body.data as LatenessMonth).locked).toBe(false);
    expect(((await get(APPROVED_MONTH).expect(200)).body.data as LatenessMonth).locked).toBe(true);
    // PUT returns the same shape.
    const putRes = (await put(MONTH, []).expect(200)).body.data as LatenessMonth;
    expect(putRes.locked).toBe(false);
  });

  it('each row carries the employee\'s department { id, nameEn, nameAr }', async () => {
    const a = await newEmployee();
    const department = await db.department.findUniqueOrThrow({ where: { id: departmentId } });
    expect(rowOf(await rows(MONTH), a)!.department).toEqual({
      id: departmentId,
      nameEn: department.nameEn,
      nameAr: department.nameAr,
    });
    await put(MONTH, [{ employeeId: a, minutes: 5 }]).expect(200);
    expect(rowOf(await rows(MONTH), a)!.department.id).toBe(departmentId);
  });

  it('Minutes negative, decimal or above 6,000 → 400', async () => {
    const a = await newEmployee();
    for (const minutes of [-1, 1.5, 6001, '30', null]) {
      const res = await put(MONTH, [{ employeeId: a, minutes }]).expect(400);
      expect(res.body.success).toBe(false);
    }
    expect(rowOf(await rows(MONTH), a)).toMatchObject({ minutes: 0 });
  });

  it('6,000 minutes accepted; 6,001 → 400; 0 accepted', async () => {
    const a = await newEmployee();
    await put(MONTH, [{ employeeId: a, minutes: 6000 }]).expect(200);
    let list = await rows(MONTH);
    // 100 hours: ¼ + ½ + 98 × ½ = 49.75 days under the default rule.
    expect(rowOf(list, a)).toMatchObject({ minutes: 6000, days: 49.75 });
    await put(MONTH, [{ employeeId: a, minutes: 6001 }]).expect(400);
    await put(MONTH, [{ employeeId: a, minutes: 0 }]).expect(200);
    list = await rows(MONTH);
    expect(rowOf(list, a)).toMatchObject({ minutes: 0, days: 0 });
  });

  it('Entry for an inactive employee → 409', async () => {
    const active = await newEmployee();
    const inactive = await newEmployee();
    await http(app).post(`/hr/employees/${inactive}/deactivate`).expect(200);

    const res = await put(MONTH, [
      { employeeId: active, minutes: 10 },
      { employeeId: inactive, minutes: 10 },
    ]).expect(409);
    expect(res.body.error).toBe(ErrorCode.EMPLOYEE_INACTIVE);

    // Nothing written (all or none), and the inactive employee isn't listed.
    const list = await rows(MONTH);
    expect(rowOf(list, active)).toMatchObject({ minutes: 0 });
    expect(rowOf(list, inactive)).toBeUndefined();
  });

  it('PUT for a month whose payroll is APPROVED → 409 PAYROLL_APPROVED', async () => {
    const a = await newEmployee();
    const res = await put(APPROVED_MONTH, [{ employeeId: a, minutes: 10 }]).expect(409);
    expect(res.body.error).toBe(ErrorCode.PAYROLL_APPROVED);
    expect(
      await db.latenessEntry.count({ where: { employeeId: a, month: APPROVED_MONTH } }),
    ).toBe(0);
    // Reading a locked month is still allowed.
    expect(rowOf(await rows(APPROVED_MONTH), a)).toMatchObject({ minutes: 0 });
  });

  it('Response days follow the current rule; changing the rule changes the shown days', async () => {
    const a = await newEmployee();
    await put(MONTH, [{ employeeId: a, minutes: 70 }]).expect(200);
    expect(rowOf(await rows(MONTH), a)).toMatchObject({ minutes: 70, days: 0.75 });

    await http(app)
      .patch('/hr/settings')
      .send({ lateness: { graceMinutes: 10, steps: [{ hour: 1, days: 1 }], extraHourDays: 2 } })
      .expect(200);
    // 70 − 10 grace = 60 → hour 1 only → 1 day. Stored minutes unchanged.
    expect(rowOf(await rows(MONTH), a)).toMatchObject({ minutes: 70, days: 1 });
  });

  it('Bad month format → 400', async () => {
    const a = await newEmployee();
    for (const month of ['2098-13', '2098-1', '98-01', '2098-01-01', 'nope']) {
      await get(month).expect(400);
      await put(month, [{ employeeId: a, minutes: 1 }]).expect(400);
    }
    await http(app).get('/hr/lateness').expect(400);
  });

  it('Duplicate employeeId in entries → 400; unknown employeeId → 400; an employee left out keeps 0 or their earlier value', async () => {
    const a = await newEmployee();
    const b = await newEmployee();
    const c = await newEmployee();

    await put(MONTH, [
      { employeeId: a, minutes: 10 },
      { employeeId: a, minutes: 20 },
    ]).expect(400);

    const unknown = await put(MONTH, [
      { employeeId: a, minutes: 10 },
      { employeeId: MISSING_ID, minutes: 10 },
    ]).expect(400);
    expect(unknown.body.error).toBe(ErrorCode.FOREIGN_KEY_VIOLATION);
    await put(MONTH, [{ employeeId: 'not-a-uuid', minutes: 10 }]).expect(400);
    expect(rowOf(await rows(MONTH), a)).toMatchObject({ minutes: 0 });

    await put(MONTH, [{ employeeId: a, minutes: 45 }]).expect(200);
    await put(MONTH, [{ employeeId: b, minutes: 90 }]).expect(200);
    const list = await rows(MONTH);
    expect(rowOf(list, a)).toMatchObject({ minutes: 45, days: 0.25 });
    expect(rowOf(list, b)).toMatchObject({ minutes: 90, days: 0.75 });
    expect(rowOf(list, c)).toMatchObject({ minutes: 0, days: 0 });

    // An empty PUT writes nothing and answers with the month as it stands.
    const saved = (await put(MONTH, []).expect(200)).body.data as LatenessSummary;
    expect(saved.totals.minutes).toBe((await rows(MONTH)).reduce((n, r) => n + r.minutes, 0));
    expect(rowOf(await rows(MONTH), a)).toMatchObject({ minutes: 45 });
  });

  // ── paged and searched by the API (owner, 2026-11-21) ───────────────────

  it('pages by code, searches code and both names, and totals every row whatever the page or search', async () => {
    const a = await newEmployee({ nameEn: unique('Paging Late') });
    const b = await newEmployee();
    await put(MONTH, [{ employeeId: a, minutes: 61 }, { employeeId: b, minutes: 121 }]).expect(200);
    const all = await rows(MONTH);
    expect(all.map((r) => r.employee.code)).toEqual([...all.map((r) => r.employee.code)].sort());

    const first = (await get(MONTH, { page: 1, limit: 1 }).expect(200)).body.data as LatenessMonth;
    const second = (await get(MONTH, { page: 2, limit: 1 }).expect(200)).body.data as LatenessMonth;
    expect(first).toMatchObject({ total: all.length, page: 1, limit: 1 });
    expect(first.items).toHaveLength(1);
    expect(second.items[0].employee.id).toBe(all[1].employee.id);
    const totals = {
      employees: all.length,
      minutes: all.reduce((n, r) => n + r.minutes, 0),
      days: all.reduce((n, r) => n + r.days, 0),
    };
    expect(first.totals).toEqual(totals);

    const row = rowOf(all, a)!;
    const byName = (await get(MONTH, { search: row.employee.nameEn.toUpperCase() }).expect(200)).body.data as LatenessMonth;
    expect(byName.items.map((r) => r.employee.id)).toEqual([a]);
    expect(byName.total).toBe(1);
    // The summary stays the month's.
    expect(byName.totals).toEqual(totals);
    const byCode = (await get(MONTH, { search: row.employee.code }).expect(200)).body.data as LatenessMonth;
    expect(byCode.items.map((r) => r.employee.id)).toContain(a);
    const byArabic = (await get(MONTH, { search: row.employee.nameAr }).expect(200)).body.data as LatenessMonth;
    expect(byArabic.items.map((r) => r.employee.id)).toEqual([a]);

    await get(MONTH, { limit: 101 }).expect(400);
    await get(MONTH, { page: 0 }).expect(400);
    expect(((await get(MONTH, { page: 999 }).expect(200)).body.data as LatenessMonth)).toMatchObject({ items: [], total: all.length });
  });
});
