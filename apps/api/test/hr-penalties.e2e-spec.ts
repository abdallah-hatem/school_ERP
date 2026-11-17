import { INestApplication } from '@nestjs/common';
import {
  ErrorCode,
  HrCatalogueKey,
  type CreateEmployeeRequest,
  type PenaltyRecord,
  type RepetitionWindow,
  type ViolationLevelInput,
} from '@school-erp/shared';
import { todayIsoDate } from '../src/common/utils/dates.util';
import { DatabaseService } from '../src/database/database.service';
import { http, unique } from './helpers';
import { createAppAsTestUser } from './helpers/as-test-user';

const LEVELS_5: ViolationLevelInput[] = [
  { level: 1, action: 'NOTICE' },
  { level: 2, action: 'WARNING' },
  { level: 3, action: 'DEDUCT_DAYS', days: 1 },
  { level: 4, action: 'DEDUCT_DAYS', days: 2 },
  { level: 5, action: 'DEDUCT_DAYS', days: 5 },
];
const DEDUCT_1: ViolationLevelInput[] = [{ level: 1, action: 'DEDUCT_DAYS', days: 1 }];

/** Months this suite puts payroll runs in (far from other suites' data). */
const LOCKED_MONTH = '2024-03';

describe('HR penalty catalogue and records (e2e)', () => {
  let app: INestApplication;
  let userId: string;
  let db: DatabaseService;
  let stageId: string;
  let departmentId: string;
  let jobTitleId: string;
  let groupId: string;

  const employee = async (overrides: Partial<CreateEmployeeRequest> = {}) => {
    const res = await http(app)
      .post('/hr/employees')
      .send({
        nameEn: unique('Employee'),
        nameAr: unique('موظف'),
        gender: 'MALE',
        dateOfBirth: '1990-01-01',
        phone: '01000000000',
        hireDate: '2020-09-01',
        stageId,
        departmentId,
        jobTitleId,
        workSystem: 'FULL_TIME',
        basicSalary: 1_000_000,
        ...overrides,
      })
      .expect(201);
    return res.body.data.id as string;
  };

  const newViolation = (levels: ViolationLevelInput[] = LEVELS_5, note?: string) =>
    http(app)
      .post(`/hr/penalty-groups/${groupId}/violations`)
      .send({ nameEn: unique('Violation'), nameAr: unique('مخالفة'), note, levels });

  const violation = async (levels: ViolationLevelInput[] = LEVELS_5, note?: string) =>
    (await newViolation(levels, note).expect(201)).body.data.id as string;

  const record = (employeeId: string, violationId: string, date: string, note?: string) =>
    http(app).post('/hr/penalties').send({ employeeId, violationId, date, note });

  const recordOk = async (employeeId: string, violationId: string, date: string) =>
    (await record(employeeId, violationId, date).expect(201)).body.data as PenaltyRecord;

  const approve = (id: string) => http(app).post(`/hr/penalties/${id}/approve`);
  const approveOk = async (id: string) =>
    (await approve(id).expect(200)).body.data as PenaltyRecord;
  const cancel = (id: string, reason?: string) =>
    http(app).post(`/hr/penalties/${id}/cancel`).send(reason === undefined ? {} : { reason });

  /** Records and approves one penalty; returns the approved record. */
  const approvedOn = async (employeeId: string, violationId: string, date: string) =>
    approveOk((await recordOk(employeeId, violationId, date)).id);

  const getRecord = async (id: string) =>
    (await http(app).get(`/hr/penalties/${id}`).expect(200)).body.data as PenaltyRecord;

  const preview = (employeeId: string, violationId: string, date: string) =>
    http(app).get('/hr/penalties/preview').query({ employeeId, violationId, date });

  const setWindow = (repetitionWindow: RepetitionWindow) =>
    http(app).patch('/hr/settings').send({ penalties: { repetitionWindow } }).expect(200);

  const tomorrow = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return todayIsoDate(d);
  };

  beforeAll(async () => {
    ({ app, user: { id: userId } } = await createAppAsTestUser());
    db = app.get(DatabaseService);
    stageId = (await db.stage.create({ data: { nameEn: 'Primary', nameAr: 'ابتدائي' } })).id;
    const mk = async (path: string) =>
      (await http(app).post(path).send({ nameEn: unique('x'), nameAr: unique('س') }).expect(201))
        .body.data.id as string;
    departmentId = await mk('/hr/departments');
    jobTitleId = await mk('/hr/job-titles');
    groupId = (
      await http(app)
        .post('/hr/penalty-groups')
        .send({ nameEn: 'General table A', nameAr: 'الجدول العام أ' })
        .expect(201)
    ).body.data.id as string;
  });

  afterEach(async () => {
    await setWindow('CONTRACT_YEAR');
  });

  afterAll(async () => {
    await db.payrollRun.deleteMany({ where: { month: LOCKED_MONTH } });
    await db.penaltyRecord.deleteMany({});
    await db.violationLevel.deleteMany({});
    await db.violation.deleteMany({});
    await db.penaltyGroup.deleteMany({});
    await db.employee.deleteMany({});
    await db.department.deleteMany({});
    await db.jobTitle.deleteMany({});
    await db.stage.deleteMany({});
    await db.schoolSetting.deleteMany({ where: { key: { startsWith: 'hr.' } } });
    await db.settingChange.deleteMany({});
    await app.close();
  });

  // ── Catalogue ─────────────────────────────────────────────────────────────

  it('DEDUCT_DAYS level without days, or days ≤ 0 → 400; NOTICE with days → 400', async () => {
    for (const levels of [
      [{ level: 1, action: 'DEDUCT_DAYS' }],
      [{ level: 1, action: 'DEDUCT_DAYS', days: null }],
      [{ level: 1, action: 'DEDUCT_DAYS', days: 0 }],
      [{ level: 1, action: 'NOTICE', days: 1 }],
    ] as ViolationLevelInput[][]) {
      const res = await newViolation(levels).expect(400);
      expect(res.body.error).toBe(ErrorCode.INVALID_LEVELS);
    }
    await newViolation([{ level: 1, action: 'DEDUCT_DAYS', days: -1 }]).expect(400);
    // INVESTIGATION may carry days, or not.
    await newViolation([
      { level: 1, action: 'INVESTIGATION' },
      { level: 2, action: 'INVESTIGATION', days: 2 },
    ]).expect(201);
  });

  it('Levels with a gap (1, 3) or more than 5 → 400', async () => {
    const gap = await newViolation([
      { level: 1, action: 'NOTICE' },
      { level: 3, action: 'WARNING' },
    ]).expect(400);
    expect(gap.body.error).toBe(ErrorCode.INVALID_LEVELS);
    const six = await newViolation([
      ...LEVELS_5,
      { level: 6, action: 'DISMISSAL' },
    ]).expect(400);
    expect(six.body.error).toBe(ErrorCode.INVALID_LEVELS);
    const none = await newViolation([]).expect(400);
    expect(none.body.error).toBe(ErrorCode.INVALID_LEVELS);
    // The same rule applies to PATCH.
    const id = await violation();
    const patch = await http(app)
      .patch(`/hr/violations/${id}`)
      .send({ levels: [{ level: 2, action: 'NOTICE' }] })
      .expect(400);
    expect(patch.body.error).toBe(ErrorCode.INVALID_LEVELS);
  });

  it('Level days 0.3 → 400; 0.25 and 5 → accepted; 30.25 → 400', async () => {
    await newViolation([{ level: 1, action: 'DEDUCT_DAYS', days: 0.3 }]).expect(400);
    await newViolation([{ level: 1, action: 'DEDUCT_DAYS', days: 30.25 }]).expect(400);
    const ok = await newViolation([
      { level: 1, action: 'DEDUCT_DAYS', days: 0.25 },
      { level: 2, action: 'DEDUCT_DAYS', days: 5 },
    ]).expect(201);
    expect(ok.body.data.levels).toEqual([
      { level: 1, action: 'DEDUCT_DAYS', days: 0.25 },
      { level: 2, action: 'DEDUCT_DAYS', days: 5 },
    ]);
  });

  it('Retiring a violation used by approved penalties → allowed; deleting is not possible', async () => {
    const emp = await employee();
    const v = await violation();
    await approvedOn(emp, v, '2025-10-01');
    const res = await http(app).patch(`/hr/violations/${v}`).send({ isActive: false }).expect(200);
    expect(res.body.data.isActive).toBe(false);
    await http(app).delete(`/hr/violations/${v}`).expect(404);
    await http(app).delete(`/hr/penalty-groups/${groupId}`).expect(404);
    expect(await db.violation.count({ where: { id: v } })).toBe(1);
    // Still listed (retired) in the catalogue.
    const groups = (await http(app).get('/hr/penalty-groups').expect(200)).body.data as {
      violations: { id: string; isActive: boolean }[];
    }[];
    const listed = groups.flatMap((g) => g.violations).find((x) => x.id === v);
    expect(listed).toMatchObject({ isActive: false });
  });

  it('Group create / PATCH works; catalogue edits write history', async () => {
    const created = await http(app)
      .post('/hr/penalty-groups')
      .send({ nameEn: 'Table B', nameAr: 'الجدول ب', sortOrder: 2 })
      .expect(201);
    const g = created.body.data as { id: string };
    expect(created.body.data).toMatchObject({ nameEn: 'Table B', sortOrder: 2, isActive: true });
    const patched = await http(app)
      .patch(`/hr/penalty-groups/${g.id}`)
      .send({ nameEn: 'Table B (edited)', isActive: false })
      .expect(200);
    expect(patched.body.data).toMatchObject({ nameEn: 'Table B (edited)', isActive: false });
    await http(app).patch(`/hr/penalty-groups/${g.id}`).send({ nameEn: null }).expect(400);
    await http(app).patch(`/hr/penalty-groups/${g.id}`).send({ nameEn: '  ' }).expect(400);

    const v = await violation();
    await http(app)
      .patch(`/hr/violations/${v}`)
      .send({ levels: [{ level: 1, action: 'WARNING' }] })
      .expect(200);

    const waitFor = async (count: () => Promise<number>, n: number) => {
      for (let i = 0; i < 50 && (await count()) < n; i++) {
        await new Promise((r) => setTimeout(r, 20));
      }
      return count();
    };
    const groupRows = () =>
      db.settingChange.count({
        where: {
          scope: 'CATALOGUE',
          key: HrCatalogueKey.PENALTY_GROUPS,
          changedById: userId,
          newValue: { path: ['id'], equals: g.id },
        },
      });
    expect(await waitFor(groupRows, 2)).toBe(2);
    const violationRows = () =>
      db.settingChange.count({
        where: {
          scope: 'CATALOGUE',
          key: HrCatalogueKey.VIOLATIONS,
          newValue: { path: ['id'], equals: v },
        },
      });
    expect(await waitFor(violationRows, 2)).toBe(2);
    const edit = await db.settingChange.findFirst({
      where: { key: HrCatalogueKey.VIOLATIONS, oldValue: { path: ['id'], equals: v } },
    });
    expect(edit?.newValue).toMatchObject({ levels: [{ level: 1, action: 'WARNING', days: null }] });
  });

  // ── Recording ─────────────────────────────────────────────────────────────

  it('Penalty for an inactive employee → 409', async () => {
    const emp = await employee();
    await http(app).post(`/hr/employees/${emp}/deactivate`).expect(200);
    const res = await record(emp, await violation(), '2025-10-01').expect(409);
    expect(res.body.error).toBe(ErrorCode.EMPLOYEE_INACTIVE);
  });

  it('Penalty dated in the future → 400', async () => {
    await record(await employee(), await violation(), tomorrow()).expect(400);
    // Today is fine.
    await record(await employee(), await violation(), todayIsoDate()).expect(201);
  });

  it('Record for a retired violation → 400', async () => {
    const v = await violation();
    await http(app).patch(`/hr/violations/${v}`).send({ isActive: false }).expect(200);
    const res = await record(await employee(), v, '2025-10-01').expect(400);
    expect(res.body.error).toBe(ErrorCode.VIOLATION_RETIRED);
  });

  it('Record a penalty dated in a month with an APPROVED run → 409 PAYROLL_APPROVED', async () => {
    const emp = await employee();
    const v = await violation();
    const pending = await recordOk(emp, v, `${LOCKED_MONTH}-10`);
    await db.payrollRun.create({
      data: { month: LOCKED_MONTH, status: 'APPROVED', approvedAt: new Date() },
    });
    try {
      const res = await record(emp, v, `${LOCKED_MONTH}-11`).expect(409);
      expect(res.body.error).toBe(ErrorCode.PAYROLL_APPROVED);

      // Approve or cancel when that month's payroll is APPROVED → 409 PAYROLL_APPROVED
      expect((await approve(pending.id).expect(409)).body.error).toBe(ErrorCode.PAYROLL_APPROVED);
      expect((await cancel(pending.id, 'typo').expect(409)).body.error).toBe(
        ErrorCode.PAYROLL_APPROVED,
      );
      expect((await getRecord(pending.id)).status).toBe('PENDING');
    } finally {
      await db.payrollRun.deleteMany({ where: { month: LOCKED_MONTH } });
    }
  });

  it('Approve or cancel when that month’s payroll is APPROVED → 409 PAYROLL_APPROVED (approved record)', async () => {
    const emp = await employee();
    const approved = await approvedOn(emp, await violation(), `${LOCKED_MONTH}-05`);
    await db.payrollRun.create({
      data: { month: LOCKED_MONTH, status: 'APPROVED', approvedAt: new Date() },
    });
    try {
      const res = await cancel(approved.id, 'late correction').expect(409);
      expect(res.body.error).toBe(ErrorCode.PAYROLL_APPROVED);
      expect((await getRecord(approved.id)).status).toBe('APPROVED');
    } finally {
      await db.payrollRun.deleteMany({ where: { month: LOCKED_MONTH } });
    }
  });

  it('No DELETE route for penalty records', async () => {
    const rec = await recordOk(await employee(), await violation(), '2025-10-01');
    await http(app).delete(`/hr/penalties/${rec.id}`).expect(404);
    expect((await getRecord(rec.id)).status).toBe('PENDING');
  });

  it('Preview: inactive employee → 409; future date → 400; retired violation → 400', async () => {
    const emp = await employee();
    const v = await violation();
    const ok = await preview(emp, v, '2025-10-01').expect(200);
    expect(ok.body.data).toEqual({ level: 1, action: 'NOTICE', days: null, priorCount: 0 });
    expect(await db.penaltyRecord.count({ where: { employeeId: emp } })).toBe(0);

    await preview(emp, v, tomorrow()).expect(400);

    const retired = await violation();
    await http(app).patch(`/hr/violations/${retired}`).send({ isActive: false }).expect(200);
    expect((await preview(emp, retired, '2025-10-01').expect(400)).body.error).toBe(
      ErrorCode.VIOLATION_RETIRED,
    );

    await http(app).post(`/hr/employees/${emp}/deactivate`).expect(200);
    expect((await preview(emp, v, '2025-10-01').expect(409)).body.error).toBe(
      ErrorCode.EMPLOYEE_INACTIVE,
    );
  });

  // ── Level ─────────────────────────────────────────────────────────────────

  it('Level counts only APPROVED earlier records of the same violation for the same employee in the window; pending and cancelled ones don’t count', async () => {
    const emp = await employee();
    const v = await violation();
    await approvedOn(emp, v, '2025-09-01');
    await recordOk(emp, v, '2025-09-02'); // pending
    const cancelled = await recordOk(emp, v, '2025-09-03');
    await cancel(cancelled.id, 'entered by mistake').expect(200);

    const res = await preview(emp, v, '2025-09-10').expect(200);
    expect(res.body.data).toEqual({ level: 2, action: 'WARNING', days: null, priorCount: 1 });
    const rec = await recordOk(emp, v, '2025-09-10');
    expect(rec).toMatchObject({ level: 2, action: 'WARNING', status: 'PENDING' });
  });

  it('Another employee’s or another violation’s approved record doesn’t count', async () => {
    const emp = await employee();
    const other = await employee();
    const v = await violation();
    const otherV = await violation();
    await approvedOn(other, v, '2025-09-01');
    await approvedOn(emp, otherV, '2025-09-01');
    const res = await preview(emp, v, '2025-09-10').expect(200);
    expect(res.body.data).toMatchObject({ level: 1, priorCount: 0 });
  });

  it('Window = contract year: an approved record from 31 May doesn’t count for a violation on 1 June', async () => {
    const emp = await employee();
    const v = await violation();
    await approvedOn(emp, v, '2025-05-31');
    expect((await preview(emp, v, '2025-06-01').expect(200)).body.data).toMatchObject({
      level: 1,
      priorCount: 0,
    });
    expect((await preview(emp, v, '2025-05-31').expect(200)).body.data.priorCount).toBe(0);
    await approvedOn(emp, v, '2024-06-01');
    expect((await preview(emp, v, '2025-05-31').expect(200)).body.data.priorCount).toBe(1);
  });

  it('CALENDAR_YEAR: approved on 31 Dec doesn’t count on 1 Jan; ROLLING_12_MONTHS: approved 2025-11-17 counts on 2026-11-16, not on 2026-11-18', async () => {
    const emp = await employee();
    const v = await violation();
    await approvedOn(emp, v, '2024-12-31');
    await setWindow('CALENDAR_YEAR');
    expect((await preview(emp, v, '2025-01-01').expect(200)).body.data.priorCount).toBe(0);
    expect((await preview(emp, v, '2024-12-31').expect(200)).body.data.priorCount).toBe(0);

    const emp2 = await employee();
    await approvedOn(emp2, v, '2025-11-17');
    await setWindow('ROLLING_12_MONTHS');
    const dates = ['2026-11-16', '2026-11-18'].filter((d) => d <= todayIsoDate());
    if (dates.includes('2026-11-16')) {
      expect((await preview(emp2, v, '2026-11-16').expect(200)).body.data.priorCount).toBe(1);
    }
    if (dates.includes('2026-11-18')) {
      expect((await preview(emp2, v, '2026-11-18').expect(200)).body.data.priorCount).toBe(0);
    }
    // Same rule one year back, so it never depends on today's date.
    const emp3 = await employee();
    await approvedOn(emp3, v, '2024-11-17');
    expect((await preview(emp3, v, '2025-11-16').expect(200)).body.data.priorCount).toBe(1);
    expect((await preview(emp3, v, '2025-11-18').expect(200)).body.data.priorCount).toBe(0);
  });

  it('PENDING dated 3 Nov and 10 Nov: approve 3 Nov then 10 Nov → levels 1, 2; approve 10 Nov then 3 Nov → levels 1, 1, neither recomputed', async () => {
    const v = await violation();
    const a = await employee();
    const a3 = await recordOk(a, v, '2025-11-03');
    const a10 = await recordOk(a, v, '2025-11-10');
    expect((await approveOk(a3.id)).level).toBe(1);
    expect((await approveOk(a10.id)).level).toBe(2);

    const b = await employee();
    const b3 = await recordOk(b, v, '2025-11-03');
    const b10 = await recordOk(b, v, '2025-11-10');
    expect((await approveOk(b10.id)).level).toBe(1);
    expect((await approveOk(b3.id)).level).toBe(1);
    // Approving 3 Nov doesn't recompute 10 Nov.
    expect((await getRecord(b10.id)).level).toBe(1);
  });

  it('Two records with the same violation date: approve one then the other → both level 1', async () => {
    const emp = await employee();
    const v = await violation();
    const first = await recordOk(emp, v, '2025-11-05');
    const second = await recordOk(emp, v, '2025-11-05');
    expect((await approveOk(first.id)).level).toBe(1);
    expect((await approveOk(second.id)).level).toBe(1);
  });

  it('"Doubles on repeat" note: level-5 record with 7 prior → level-5 days, not doubled', async () => {
    const emp = await employee();
    const v = await violation(LEVELS_5, 'doubles on repeat');
    for (let d = 1; d <= 7; d++) await approvedOn(emp, v, `2025-07-0${d}`);
    const res = await preview(emp, v, '2025-07-10').expect(200);
    expect(res.body.data).toEqual({ level: 5, action: 'DEDUCT_DAYS', days: 5, priorCount: 7 });
    expect(await approvedOn(emp, v, '2025-07-10')).toMatchObject({ level: 5, days: 5 });
  });

  // ── Approve / cancel ──────────────────────────────────────────────────────

  it('Approve fixes level and action; editing the catalogue afterwards doesn’t change it', async () => {
    const emp = await employee();
    const v = await violation(DEDUCT_1);
    const approved = await approvedOn(emp, v, '2025-08-01');
    expect(approved).toMatchObject({
      status: 'APPROVED',
      level: 1,
      action: 'DEDUCT_DAYS',
      days: 1,
      approvedBy: { id: userId },
    });
    await http(app)
      .patch(`/hr/violations/${v}`)
      .send({ levels: [{ level: 1, action: 'WARNING' }] })
      .expect(200);
    expect(await getRecord(approved.id)).toMatchObject({ level: 1, action: 'DEDUCT_DAYS', days: 1 });
  });

  it('Editing catalogue days changes a PENDING record’s shown days, not an APPROVED one’s', async () => {
    const emp = await employee();
    const v = await violation(DEDUCT_1);
    const approved = await approvedOn(emp, v, '2025-08-01');
    const pending = await recordOk(await employee(), v, '2025-08-02');
    expect(pending.days).toBe(1);

    await http(app)
      .patch(`/hr/violations/${v}`)
      .send({ levels: [{ level: 1, action: 'DEDUCT_DAYS', days: 2.5 }] })
      .expect(200);
    expect((await getRecord(pending.id)).days).toBe(2.5);
    expect((await getRecord(approved.id)).days).toBe(1);

    const list = await http(app).get('/hr/penalties').query({ employeeId: emp }).expect(200);
    expect((list.body.data as PenaltyRecord[]).map((r) => r.days)).toEqual([1]);
    // Approval fixes the catalogue's current days.
    expect((await approveOk(pending.id)).days).toBe(2.5);
  });

  it('Approve twice → 409; cancel an approved record → allowed with reason; cancel without reason → 400', async () => {
    const emp = await employee();
    const rec = await recordOk(emp, await violation(), '2025-08-01');
    await approveOk(rec.id);
    expect((await approve(rec.id).expect(409)).body.error).toBe(ErrorCode.PENALTY_NOT_PENDING);
    await cancel(rec.id).expect(400);
    await cancel(rec.id, '   ').expect(400);
    const res = await cancel(rec.id, 'Investigation cleared the employee').expect(200);
    expect(res.body.data).toMatchObject({
      status: 'CANCELLED',
      cancelReason: 'Investigation cleared the employee',
    });
  });

  it('Approve a CANCELLED record → 409; cancel a CANCELLED record → 409', async () => {
    const rec = await recordOk(await employee(), await violation(), '2025-08-01');
    await cancel(rec.id, 'duplicate').expect(200);
    expect((await approve(rec.id).expect(409)).body.error).toBe(ErrorCode.PENALTY_CANCELLED);
    expect((await cancel(rec.id, 'again').expect(409)).body.error).toBe(
      ErrorCode.PENALTY_CANCELLED,
    );
    expect(await getRecord(rec.id)).toMatchObject({ status: 'CANCELLED', cancelReason: 'duplicate' });
  });

  it('Cancel an APPROVED record (month open) with a reason → CANCELLED; other approved levels unchanged', async () => {
    const emp = await employee();
    const v = await violation();
    const first = await approvedOn(emp, v, '2025-09-01');
    const second = await approvedOn(emp, v, '2025-09-05');
    expect(second.level).toBe(2);
    await cancel(first.id, 'wrong employee').expect(200);
    expect(await getRecord(second.id)).toMatchObject({ status: 'APPROVED', level: 2 });
    // New records now count only the remaining approved one.
    expect((await preview(emp, v, '2025-09-10').expect(200)).body.data.priorCount).toBe(1);
  });

  it('Concurrent approvals of the same record: exactly one succeeds', async () => {
    const rec = await recordOk(await employee(), await violation(), '2025-08-01');
    const results = await Promise.all([approve(rec.id), approve(rec.id)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it('Unknown ids: employee or violation → 400; record → 404', async () => {
    const missing = '11111111-1111-4111-8111-111111111111';
    const emp = await employee();
    const v = await violation();
    expect((await record(missing, v, '2025-08-01').expect(400)).body.error).toBe(
      ErrorCode.FOREIGN_KEY_VIOLATION,
    );
    expect((await record(emp, missing, '2025-08-01').expect(400)).body.error).toBe(
      ErrorCode.FOREIGN_KEY_VIOLATION,
    );
    await approve(missing).expect(404);
    await cancel(missing, 'x').expect(404);
    await http(app).get(`/hr/penalties/${missing}`).expect(404);
    await http(app).patch(`/hr/violations/${missing}`).send({ isActive: false }).expect(404);
    await http(app)
      .post(`/hr/penalty-groups/${missing}/violations`)
      .send({ nameEn: 'a', nameAr: 'b', levels: DEDUCT_1 })
      .expect(404);
  });

  // ── Full flow ─────────────────────────────────────────────────────────────

  it('full flow: catalogue → preview → record → approve → repeat level → list → cancel', async () => {
    const group = (
      await http(app)
        .post('/hr/penalty-groups')
        .send({ nameEn: 'Educational violations', nameAr: 'مخالفات تربوية' })
        .expect(201)
    ).body.data.id as string;
    const v = (
      await http(app)
        .post(`/hr/penalty-groups/${group}/violations`)
        .send({ nameEn: 'Late to class', nameAr: 'التأخر عن الحصة', levels: LEVELS_5 })
        .expect(201)
    ).body.data.id as string;
    const emp = await employee();

    expect((await preview(emp, v, '2025-10-05').expect(200)).body.data.level).toBe(1);
    const first = await recordOk(emp, v, '2025-10-05');
    expect(first).toMatchObject({
      status: 'PENDING',
      level: 1,
      action: 'NOTICE',
      createdBy: { id: userId },
      approvedBy: null,
      violation: { id: v, nameEn: 'Late to class' },
      date: '2025-10-05',
    });
    await approveOk(first.id);

    for (const [date, level, action, days] of [
      ['2025-10-12', 2, 'WARNING', null],
      ['2025-10-19', 3, 'DEDUCT_DAYS', 1],
    ] as const) {
      expect((await preview(emp, v, date).expect(200)).body.data).toMatchObject({ level });
      const rec = await recordOk(emp, v, date);
      expect(await approveOk(rec.id)).toMatchObject({ level, action, days });
    }

    const pendingRec = await recordOk(emp, v, '2025-10-26');
    expect(pendingRec.level).toBe(4);

    const all = await http(app)
      .get('/hr/penalties')
      .query({ employeeId: emp, month: '2025-10', limit: 2 })
      .expect(200);
    expect(all.body.meta).toMatchObject({ total: 4, page: 1, limit: 2, hasNextPage: true });
    expect((all.body.data as PenaltyRecord[]).map((r) => r.date)).toEqual([
      '2025-10-26',
      '2025-10-19',
    ]);
    const pendingOnly = await http(app)
      .get('/hr/penalties')
      .query({ employeeId: emp, status: 'PENDING' })
      .expect(200);
    expect((pendingOnly.body.data as PenaltyRecord[]).map((r) => r.id)).toEqual([pendingRec.id]);
    await http(app).get('/hr/penalties').query({ month: '2025-13' }).expect(400);
    await http(app).get('/hr/penalties').query({ status: 'DONE' }).expect(400);

    const searched = await http(app).get('/hr/penalties').query({ search: 'late to CLASS' });
    expect((searched.body.data as PenaltyRecord[]).length).toBe(4);

    const cancelled = await cancel(pendingRec.id, 'Recorded twice').expect(200);
    expect(cancelled.body.data.status).toBe('CANCELLED');

    const catalogue = (await http(app).get('/hr/penalty-groups').expect(200)).body.data as {
      id: string;
      violations: { id: string; levels: unknown[] }[];
    }[];
    const g = catalogue.find((x) => x.id === group);
    expect(g?.violations[0]).toMatchObject({ id: v, isActive: true, note: null });
    expect(g?.violations[0]?.levels).toHaveLength(5);
  });
});
