import { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ErrorCode,
  HrEvent,
  type CreateEmployeeRequest,
  type EmployeePayrollLine,
  type HrDashboard,
  type PayrollLine,
  type PayrollRun,
  type PayrollRunSummary,
  type Payslip,
  type ViolationLevelInput,
} from '@school-erp/shared';
import ExcelJS from 'exceljs';
import type { Response } from 'supertest';
import { monthOf, todayIsoDate } from '../src/common/utils/dates.util';
import { DatabaseService } from '../src/database/database.service';
import { http, unique } from './helpers';
import { createAppAsTestUser } from './helpers/as-test-user';

const DEDUCT = (days: number): ViolationLevelInput[] => [{ level: 1, action: 'DEDUCT_DAYS', days }];

/** Months this suite puts payroll runs in: a fresh one per test (one run per month, §6). */
let monthSeq = 0;
const usedMonths: string[] = [];
const nextMonth = () => {
  const n = monthSeq++;
  const month = `${2015 + Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`;
  usedMonths.push(month);
  return month;
};
const day = (month: string, d: number) => `${month}-${String(d).padStart(2, '0')}`;

let idSeq = 0;
const nationalId = () => `29${String(Date.now()).slice(-8)}${String(idSeq++).padStart(4, '0')}`;

/** Parses a binary (xlsx) response body into a Buffer. */
const binary = (res: Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

describe('HR payroll and dashboard (e2e)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let stageId: string;
  let departmentId: string;
  let otherDepartmentId: string;
  let jobTitleId: string;
  let groupId: string;

  // ── helpers ───────────────────────────────────────────────────────────────

  const employee = async (overrides: Partial<CreateEmployeeRequest> = {}) => {
    const res = await http(app)
      .post('/hr/employees')
      .send({
        nameEn: unique('Employee'),
        nameAr: unique('موظف'),
        gender: 'MALE',
        dateOfBirth: '1990-01-01',
        phone: '01000000000',
        hireDate: '2010-09-01',
        stageId,
        departmentId,
        jobTitleId,
        workSystem: 'FULL_TIME',
        basicSalary: 1_200_000,
        ...overrides,
      })
      .expect(201);
    return res.body.data.id as string;
  };

  const violation = async (levels: ViolationLevelInput[] = DEDUCT(1)) =>
    (
      await http(app)
        .post(`/hr/penalty-groups/${groupId}/violations`)
        .send({ nameEn: unique('Violation'), nameAr: unique('مخالفة'), levels })
        .expect(201)
    ).body.data.id as string;

  const recordPenalty = async (employeeId: string, violationId: string, date: string) =>
    (await http(app).post('/hr/penalties').send({ employeeId, violationId, date }).expect(201)).body
      .data.id as string;

  const approvePenalty = (id: string) => http(app).post(`/hr/penalties/${id}/approve`).expect(200);

  /** Records and approves a penalty with the given levels; returns its id. */
  const approvedPenalty = async (
    employeeId: string,
    date: string,
    levels: ViolationLevelInput[] = DEDUCT(1),
  ) => {
    const id = await recordPenalty(employeeId, await violation(levels), date);
    await approvePenalty(id);
    return id;
  };

  const setLateness = (month: string, employeeId: string, minutes: number) =>
    http(app)
      .put(`/hr/lateness/${month}`)
      .send({ entries: [{ employeeId, minutes }] });

  const createRun = async (month: string) =>
    (await http(app).post('/hr/payroll-runs').send({ month }).expect(201)).body.data as PayrollRun;
  const getRun = async (id: string, query: Record<string, string> = {}) =>
    (await http(app).get(`/hr/payroll-runs/${id}`).query(query).expect(200)).body
      .data as PayrollRun;
  const recalculate = (id: string) => http(app).post(`/hr/payroll-runs/${id}/recalculate`);
  const approve = (id: string) => http(app).post(`/hr/payroll-runs/${id}/approve`);
  const approveOk = async (id: string) => (await approve(id).expect(200)).body.data as PayrollRun;
  const addAdjustment = (id: string, body: Record<string, unknown>) =>
    http(app).post(`/hr/payroll-runs/${id}/adjustments`).send(body);
  const payslip = (id: string, lineId: string) =>
    http(app).get(`/hr/payroll-runs/${id}/lines/${lineId}`);
  const bankSheet = (id: string) =>
    http(app).get(`/hr/payroll-runs/${id}/bank-sheet`).buffer(true).parse(binary);

  const lineOf = (run: PayrollRun, employeeId: string) => {
    const line = run.lines.find((l) => l.employeeId === employeeId);
    if (!line) throw new Error(`no line for ${employeeId}`);
    return line;
  };

  const setDivisor = (dayDivisor: number) =>
    http(app).patch('/hr/settings').send({ payroll: { dayDivisor } }).expect(200);

  const readSheet = async (body: Buffer) => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(body as unknown as ArrayBuffer);
    return wb.worksheets[0];
  };

  const sumOf = (lines: PayrollLine[], key: keyof PayrollLine) =>
    lines.reduce((n, l) => n + (l[key] as number), 0);

  beforeAll(async () => {
    ({ app } = await createAppAsTestUser());
    db = app.get(DatabaseService);
    stageId = (await db.stage.create({ data: { nameEn: 'Primary', nameAr: 'ابتدائي' } })).id;
    const mk = async (path: string) =>
      (
        await http(app)
          .post(path)
          .send({ nameEn: unique('x'), nameAr: unique('س') })
          .expect(201)
      ).body.data.id as string;
    departmentId = await mk('/hr/departments');
    otherDepartmentId = await mk('/hr/departments');
    jobTitleId = await mk('/hr/job-titles');
    groupId = (
      await http(app)
        .post('/hr/penalty-groups')
        .send({ nameEn: 'General table A', nameAr: 'الجدول العام أ' })
        .expect(201)
    ).body.data.id as string;
  });

  afterEach(async () => {
    await db.schoolSetting.deleteMany({ where: { key: { startsWith: 'hr.' } } });
  });

  afterAll(async () => {
    const current = monthOf(todayIsoDate());
    await db.payrollRun.deleteMany({ where: { month: { in: [...usedMonths, current] } } });
    await db.latenessEntry.deleteMany({});
    await db.penaltyRecord.deleteMany({});
    await db.violationLevel.deleteMany({});
    await db.violation.deleteMany({});
    await db.penaltyGroup.deleteMany({});
    await db.employee.deleteMany({});
    await db.department.deleteMany({});
    await db.jobTitle.deleteMany({});
    await db.stage.deleteMany({});
    await db.schoolSetting.deleteMany({ where: { key: { startsWith: 'hr.' } } });
    await app.close();
  });

  // ── runs ──────────────────────────────────────────────────────────────────

  it('Create a run → one line per active employee only', async () => {
    const active = await employee();
    const inactive = await employee();
    await http(app).post(`/hr/employees/${inactive}/deactivate`).expect(200);

    const run = await createRun(nextMonth());
    expect(run.status).toBe('DRAFT');
    const activeIds = (await db.employee.findMany({ where: { status: 'ACTIVE' } })).map(
      (e) => e.id,
    );
    expect(run.lines.map((l) => l.employeeId).sort()).toEqual(activeIds.sort());
    expect(run.lines.some((l) => l.employeeId === active)).toBe(true);
    expect(run.lines.some((l) => l.employeeId === inactive)).toBe(false);
  });

  it('Second run for the same month → 409', async () => {
    const month = nextMonth();
    await createRun(month);
    const res = await http(app).post('/hr/payroll-runs').send({ month }).expect(409);
    expect(res.body.error).toBe(ErrorCode.PAYROLL_RUN_EXISTS);
  });

  it('Line: penalties counted only if APPROVED, DEDUCT_DAYS (or investigation with days), dated in the month', async () => {
    const month = nextMonth();
    const next = nextMonth();
    const emp = await employee();
    await approvedPenalty(emp, day(month, 3), DEDUCT(1)); // counts
    await approvedPenalty(emp, day(month, 4), [{ level: 1, action: 'INVESTIGATION', days: 0.5 }]); // counts
    await approvedPenalty(emp, day(month, 5), [{ level: 1, action: 'WARNING' }]); // recorded only
    const cancelled = await recordPenalty(emp, await violation(DEDUCT(2)), day(month, 6));
    await http(app).post(`/hr/penalties/${cancelled}/cancel`).send({ reason: 'error' }).expect(200);
    await approvedPenalty(emp, day(next, 1), DEDUCT(3)); // other month
    await recordPenalty(emp, await violation(DEDUCT(4)), day(month, 7)); // pending: flag only

    const line = lineOf(await createRun(month), emp);
    expect(line.penaltyDays).toBe(1.5);
    expect(line.penaltyAmount).toBe(60_000); // 1.5 × 1,200,000 ÷ 30
    expect(line.flags).toEqual(['PENDING_PENALTIES']);
  });

  it('Line: lateness days × day value; adjustments added / subtracted', async () => {
    const month = nextMonth();
    const emp = await employee();
    await setLateness(month, emp, 75).expect(200); // 61–120 min → 0.75 day
    const run = await createRun(month);
    let line = lineOf(run, emp);
    expect(line.latenessMinutes).toBe(75);
    expect(line.latenessDays).toBe(0.75);
    expect(line.latenessAmount).toBe(30_000); // 0.75 × 1,200,000 ÷ 30
    expect(line.dayValue).toBe(40_000);

    await addAdjustment(run.id, {
      employeeId: emp,
      type: 'ADDITION',
      amount: 25_000,
      reason: 'Overtime',
    }).expect(201);
    const after = (
      await addAdjustment(run.id, {
        employeeId: emp,
        type: 'DEDUCTION',
        amount: 5_000,
        reason: 'Advance',
      }).expect(201)
    ).body.data as PayrollRun;
    line = lineOf(after, emp);
    expect(line.adjustmentAdditions).toBe(25_000);
    expect(line.adjustmentDeductions).toBe(5_000);
    expect(line.net).toBe(1_200_000 - 30_000 + 25_000 - 5_000);
    expect(after.adjustments.filter((a) => a.employeeId === emp)).toHaveLength(2);
  });

  it('Recalculate after a settings change → new numbers in the draft; employees deactivated since are removed, new ones added', async () => {
    const month = nextMonth();
    const stays = await employee();
    const leaves = await employee();
    const partTimer = await employee({ workSystem: 'PART_TIME_4', basicSalary: 1_000_000 });
    await approvedPenalty(stays, day(month, 2), DEDUCT(1));
    const run = await createRun(month);
    expect(lineOf(run, stays).penaltyAmount).toBe(40_000);
    expect(lineOf(run, partTimer).monthSalary).toBe(800_000);

    await http(app)
      .patch('/hr/settings')
      .send({ payroll: { dayDivisor: 24, partTime: { PART_TIME_4: 90 } } })
      .expect(200);
    await http(app).post(`/hr/employees/${leaves}/deactivate`).expect(200);
    const joins = await employee();

    const res = await recalculate(run.id).expect(200);
    const recalculated = res.body.data as PayrollRun;
    expect(lineOf(recalculated, stays).penaltyAmount).toBe(50_000); // 1,200,000 ÷ 24
    expect(lineOf(recalculated, stays).dayValue).toBe(50_000);
    expect(lineOf(recalculated, partTimer).monthSalary).toBe(900_000);
    expect(recalculated.lines.some((l) => l.employeeId === leaves)).toBe(false);
    expect(recalculated.lines.some((l) => l.employeeId === joins)).toBe(true);
    // A line keeps its id across recalculations.
    expect(lineOf(recalculated, stays).id).toBe(lineOf(run, stays).id);
  });

  it('Adjustment: amount ≤ 0 → 400; reason missing → 400; on an approved run → 409', async () => {
    const emp = await employee();
    const run = await createRun(nextMonth());
    for (const amount of [0, -100]) {
      await addAdjustment(run.id, {
        employeeId: emp,
        type: 'ADDITION',
        amount,
        reason: 'x',
      }).expect(400);
    }
    await addAdjustment(run.id, { employeeId: emp, type: 'ADDITION', amount: 100 }).expect(400);
    await addAdjustment(run.id, {
      employeeId: emp,
      type: 'ADDITION',
      amount: 100,
      reason: '   ',
    }).expect(400);
    await approveOk(run.id);
    const res = await addAdjustment(run.id, {
      employeeId: emp,
      type: 'ADDITION',
      amount: 100,
      reason: 'Bonus',
    }).expect(409);
    expect(res.body.error).toBe(ErrorCode.PAYROLL_APPROVED);
  });

  it('Approve with pending penalties in the month → 409 PENDING_PENALTIES', async () => {
    const month = nextMonth();
    const emp = await employee();
    const pending = await recordPenalty(emp, await violation(), day(month, 10));
    const run = await createRun(month);
    const res = await approve(run.id).expect(409);
    expect(res.body.error).toBe(ErrorCode.PENDING_PENALTIES);
    expect((await getRun(run.id)).status).toBe('DRAFT');
    // Once the penalty is resolved, the month can be approved.
    await approvePenalty(pending);
    expect((await approveOk(run.id)).status).toBe('APPROVED');
  });

  it('pendingPenalties is live: approving the pending penalty drops it to 0 before Recalculate, flags stay', async () => {
    const month = nextMonth();
    const emp = await employee();
    const first = await recordPenalty(emp, await violation(), day(month, 4));
    const second = await recordPenalty(emp, await violation(), day(month, 5));
    await recordPenalty(emp, await violation(), day(nextMonth(), 5)); // another month: not counted
    const run = await createRun(month);
    expect(run.pendingPenalties).toBe(2);
    expect(lineOf(run, emp).flags).toEqual(['PENDING_PENALTIES']);

    await approvePenalty(first);
    expect((await getRun(run.id)).pendingPenalties).toBe(1);
    await approvePenalty(second);
    const after = await getRun(run.id);
    expect(after.pendingPenalties).toBe(0);
    // The lines still carry the last calculation's flag until Recalculate.
    expect(lineOf(after, emp).flags).toEqual(['PENDING_PENALTIES']);
    const recalculated = (await recalculate(run.id).expect(200)).body.data as PayrollRun;
    expect(recalculated.pendingPenalties).toBe(0);
    expect(lineOf(recalculated, emp).flags).toEqual([]);
    expect((await approveOk(run.id)).pendingPenalties).toBe(0);
  });

  it('Approve → locked: recalculate / adjustments → 409; penalties and lateness of that month locked', async () => {
    const month = nextMonth();
    const emp = await employee();
    const run = await createRun(month);
    const adj = (
      await addAdjustment(run.id, {
        employeeId: emp,
        type: 'ADDITION',
        amount: 1_000,
        reason: 'Bonus',
      }).expect(201)
    ).body.data.adjustments[0].id as string;

    const emitted: unknown[] = [];
    app.get(EventEmitter2).on(HrEvent.PAYROLL_APPROVED, (e: unknown) => emitted.push(e));
    const approved = await approveOk(run.id);
    expect(approved.approvedAt).not.toBeNull();
    expect(emitted).toEqual([
      expect.objectContaining({ runId: run.id, month, totals: approved.totals }),
    ]);

    const codes = await Promise.all([
      recalculate(run.id).expect(409),
      addAdjustment(run.id, { employeeId: emp, type: 'ADDITION', amount: 1, reason: 'x' }).expect(
        409,
      ),
      http(app).delete(`/hr/payroll-runs/${run.id}/adjustments/${adj}`).expect(409),
      http(app)
        .post('/hr/penalties')
        .send({ employeeId: emp, violationId: await violation(), date: day(month, 2) })
        .expect(409),
      setLateness(month, emp, 30).expect(409),
    ]);
    for (const res of codes) expect(res.body.error).toBe(ErrorCode.PAYROLL_APPROVED);
  });

  it("Changing settings after approval doesn't change the approved run's numbers", async () => {
    const month = nextMonth();
    const emp = await employee({ workSystem: 'PART_TIME_3' });
    await approvedPenalty(emp, day(month, 2), DEDUCT(1));
    const run = await createRun(month);
    const approved = await approveOk(run.id);

    await http(app)
      .patch('/hr/settings')
      .send({ payroll: { dayDivisor: 20, partTime: { PART_TIME_3: 50 } } })
      .expect(200);
    const after = await getRun(run.id);
    expect(after.lines).toEqual(approved.lines);
    expect(after.totals).toEqual(approved.totals);
  });

  it('Net floored at 0 and flagged; PENDING_PENALTIES flag on lines with pending penalties', async () => {
    const month = nextMonth();
    const floored = await employee({ basicSalary: 300_000 });
    const pending = await employee();
    await approvedPenalty(floored, day(month, 1), DEDUCT(30));
    await approvedPenalty(floored, day(month, 2), DEDUCT(5));
    await recordPenalty(pending, await violation(), day(month, 3));
    const run = await createRun(month);
    expect(lineOf(run, floored)).toMatchObject({ net: 0, flags: ['NET_FLOORED'] });
    expect(lineOf(run, pending).flags).toEqual(['PENDING_PENALTIES']);
    expect(lineOf(run, pending).net).toBe(1_200_000);
  });

  it('Bank sheet on a draft run → 409; on an approved run → xlsx with code, names, national ID, net', async () => {
    const emp = await employee({ nationalId: nationalId() });
    const run = await createRun(nextMonth());
    const draft = await http(app).get(`/hr/payroll-runs/${run.id}/bank-sheet`).expect(409);
    expect(draft.body.error).toBe(ErrorCode.PAYROLL_NOT_APPROVED);

    const approved = await approveOk(run.id);
    const res = await bankSheet(run.id).set('Accept-Language', 'en').expect(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.headers['content-disposition']).toContain(`bank-sheet-${run.month}.xlsx`);
    const sheet = await readSheet(res.body as Buffer);
    expect(sheet.getRow(1).values).toEqual([
      undefined,
      'Employee code',
      'Name (English)',
      'Name (Arabic)',
      'National ID',
      'Net (EGP)',
    ]);
    const line = lineOf(approved, emp);
    const row = sheet.getColumn(1).values.indexOf(line.employeeCode);
    expect(sheet.getRow(row).values).toEqual([
      undefined,
      line.employeeCode,
      line.nameEn,
      line.nameAr,
      line.nationalId,
      line.net! / 100,
    ]);
  });

  // ── review edge cases ─────────────────────────────────────────────────────

  it('Approved INVESTIGATION with 1 day in the month → penaltyDays 1', async () => {
    const month = nextMonth();
    const emp = await employee();
    await approvedPenalty(emp, day(month, 9), [{ level: 1, action: 'INVESTIGATION', days: 1 }]);
    const line = lineOf(await createRun(month), emp);
    expect(line.penaltyDays).toBe(1);
    expect(line.penaltyAmount).toBe(40_000);
  });

  it('Approved NOTICE / WARNING / RAISE_* / PAY_CUT / DEMOTION / DISMISSAL / INVESTIGATION without days → penaltyDays 0', async () => {
    const month = nextMonth();
    const emp = await employee();
    const actions = [
      'NOTICE',
      'WARNING',
      'RAISE_HALF_LOSS',
      'RAISE_LOSS',
      'RAISE_DEFER_3M',
      'PAY_CUT',
      'DEMOTION',
      'DISMISSAL',
      'INVESTIGATION',
    ] as const;
    for (const [i, action] of actions.entries()) {
      await approvedPenalty(emp, day(month, i + 1), [{ level: 1, action }]);
    }
    const line = lineOf(await createRun(month), emp);
    expect(line.penaltyDays).toBe(0);
    expect(line.penaltyAmount).toBe(0);
    expect(line.net).toBe(1_200_000);
  });

  it('Edit catalogue days after a penalty is APPROVED → recalculate → penaltyDays unchanged', async () => {
    const month = nextMonth();
    const emp = await employee();
    const violationId = await violation(DEDUCT(1));
    await approvePenalty(await recordPenalty(emp, violationId, day(month, 5)));
    const run = await createRun(month);
    await http(app)
      .patch(`/hr/violations/${violationId}`)
      .send({ levels: DEDUCT(3) })
      .expect(200);
    const line = lineOf((await recalculate(run.id).expect(200)).body.data as PayrollRun, emp);
    expect(line.penaltyDays).toBe(1);
  });

  it('Two approved penalties (1 + 0.5 days) → 1.5 days, amount = round(1.5 × month salary ÷ divisor)', async () => {
    const month = nextMonth();
    const emp = await employee({ basicSalary: 1_000_001 });
    await approvedPenalty(emp, day(month, 1), DEDUCT(1));
    await approvedPenalty(emp, day(month, 2), DEDUCT(0.5));
    const line = lineOf(await createRun(month), emp);
    expect(line.penaltyDays).toBe(1.5);
    expect(line.penaltyAmount).toBe(Math.round((1.5 * 1_000_001) / 30)); // 50,000.05 → 50,000
  });

  it('Penalty dated 31 Oct not in November; one dated 1 Nov is', async () => {
    // Use a real October/November pair from this suite's months.
    while (!usedMonths.at(-1)?.endsWith('-09')) nextMonth();
    const october = nextMonth();
    const november = nextMonth();
    const emp = await employee();
    await approvedPenalty(emp, day(october, 31), DEDUCT(2));
    await approvedPenalty(emp, day(november, 1), DEDUCT(0.25));
    expect(lineOf(await createRun(november), emp).penaltyDays).toBe(0.25);
    expect(lineOf(await createRun(october), emp).penaltyDays).toBe(2);
  });

  it('Employee hired 20 Nov → full month salary', async () => {
    while (!usedMonths.at(-1)?.endsWith('-10')) nextMonth();
    const november = nextMonth();
    const emp = await employee({ hireDate: day(november, 20) });
    const line = lineOf(await createRun(november), emp);
    expect(line.monthSalary).toBe(1_200_000);
    expect(line.net).toBe(1_200_000);
  });

  it('Adjustments survive recalculate; adjustment for an employee not in the run → 400; non-integer amount → 400; DELETE on a draft → net restored; on an approved run → 409', async () => {
    const emp = await employee();
    const run = await createRun(nextMonth());
    const outsider = await employee(); // hired after the run was created: no line yet

    const notInRun = await addAdjustment(run.id, {
      employeeId: outsider,
      type: 'ADDITION',
      amount: 100,
      reason: 'x',
    }).expect(400);
    expect(notInRun.body.error).toBe(ErrorCode.EMPLOYEE_NOT_IN_RUN);
    await addAdjustment(run.id, {
      employeeId: emp,
      type: 'ADDITION',
      amount: 10.5,
      reason: 'x',
    }).expect(400);

    const withAdj = (
      await addAdjustment(run.id, {
        employeeId: emp,
        type: 'DEDUCTION',
        amount: 7_000,
        reason: 'Advance',
      }).expect(201)
    ).body.data as PayrollRun;
    const adjId = withAdj.adjustments.find((a) => a.employeeId === emp)!.id;

    const recalculated = (await recalculate(run.id).expect(200)).body.data as PayrollRun;
    expect(lineOf(recalculated, emp)).toMatchObject({
      adjustmentDeductions: 7_000,
      net: 1_193_000,
    });
    expect(recalculated.adjustments.some((a) => a.id === adjId)).toBe(true);

    const restored = (
      await http(app).delete(`/hr/payroll-runs/${run.id}/adjustments/${adjId}`).expect(200)
    ).body.data as PayrollRun;
    expect(lineOf(restored, emp)).toMatchObject({ adjustmentDeductions: 0, net: 1_200_000 });

    const again = (
      await addAdjustment(run.id, {
        employeeId: emp,
        type: 'ADDITION',
        amount: 1_000,
        reason: 'Bonus',
      }).expect(201)
    ).body.data as PayrollRun;
    await approveOk(run.id);
    const res = await http(app)
      .delete(`/hr/payroll-runs/${run.id}/adjustments/${again.adjustments[0].id}`)
      .expect(409);
    expect(res.body.error).toBe(ErrorCode.PAYROLL_APPROVED);
  });

  it('Approve an APPROVED run → 409; no DELETE route for runs; malformed month → 400', async () => {
    const run = await createRun(nextMonth());
    await approveOk(run.id);
    const res = await approve(run.id).expect(409);
    expect(res.body.error).toBe(ErrorCode.PAYROLL_APPROVED);
    await http(app).delete(`/hr/payroll-runs/${run.id}`).expect(404);
    expect((await getRun(run.id)).status).toBe('APPROVED');
    for (const month of ['2026-13', '2026-1', 'nov', '', undefined]) {
      await http(app).post('/hr/payroll-runs').send({ month }).expect(400);
    }
  });

  it('Additions count before the floor: salary 1,000, deductions 1,500, addition 800 → net 300, no flag', async () => {
    const emp = await employee({ basicSalary: 100_000 });
    const run = await createRun(nextMonth());
    await addAdjustment(run.id, {
      employeeId: emp,
      type: 'DEDUCTION',
      amount: 150_000,
      reason: 'Loan',
    }).expect(201);
    const after = (
      await addAdjustment(run.id, {
        employeeId: emp,
        type: 'ADDITION',
        amount: 80_000,
        reason: 'Exam bonus',
      }).expect(201)
    ).body.data as PayrollRun;
    expect(lineOf(after, emp)).toMatchObject({ net: 30_000, flags: [] });
  });

  it('Totals equal the sum of the lines; `flagged` counts both flag types', async () => {
    const month = nextMonth();
    const floored = await employee({ basicSalary: 100_000 });
    const pending = await employee();
    await approvedPenalty(floored, day(month, 1), DEDUCT(30));
    await approvedPenalty(floored, day(month, 2), DEDUCT(1));
    await recordPenalty(pending, await violation(), day(month, 3));
    const run = await createRun(month);
    for (const key of [
      'monthSalary',
      'penaltyAmount',
      'latenessAmount',
      'adjustmentAdditions',
      'adjustmentDeductions',
      'net',
    ] as const) {
      expect(run.totals[key]).toBe(sumOf(run.lines, key));
    }
    expect(run.totals.employees).toBe(run.lines.length);
    expect(run.totals.flagged).toBe(run.lines.filter((l) => l.flags.length > 0).length);
    expect(run.totals.flagged).toBeGreaterThanOrEqual(2);

    // The list endpoint carries the same totals, paginated.
    const list = await http(app).get('/hr/payroll-runs').query({ limit: 100 }).expect(200);
    const summary = (list.body.data as PayrollRunSummary[]).find((r) => r.id === run.id)!;
    expect(summary.totals).toEqual(run.totals);
    expect(list.body.meta).toMatchObject({ page: 1, limit: 100 });

    // flagged=true / false split the lines; totals stay the run's.
    const flaggedOnly = await getRun(run.id, { flagged: 'true' });
    expect(flaggedOnly.lines.every((l) => l.flags.length > 0)).toBe(true);
    expect(flaggedOnly.lines).toHaveLength(run.totals.flagged);
    expect(flaggedOnly.totals).toEqual(run.totals);
    const clean = await getRun(run.id, { flagged: 'false' });
    expect(clean.lines.every((l) => l.flags.length === 0)).toBe(true);
  });

  it('Payslip on a DRAFT run → 409; on an APPROVED run → itemised penalties and adjustments', async () => {
    const month = nextMonth();
    const emp = await employee();
    await approvedPenalty(emp, day(month, 4), DEDUCT(1));
    await approvedPenalty(emp, day(month, 2), DEDUCT(0.5));
    await approvedPenalty(emp, day(month, 6), [{ level: 1, action: 'WARNING' }]);
    const run = await createRun(month);
    await addAdjustment(run.id, {
      employeeId: emp,
      type: 'ADDITION',
      amount: 12_345,
      reason: 'Overtime',
    }).expect(201);
    const lineId = lineOf(run, emp).id;

    const draft = await payslip(run.id, lineId).expect(409);
    expect(draft.body.error).toBe(ErrorCode.PAYROLL_NOT_APPROVED);

    await approveOk(run.id);
    const slip = (await payslip(run.id, lineId).expect(200)).body.data as Payslip;
    expect(slip.month).toBe(month);
    expect(slip.school).toEqual(
      expect.objectContaining({ nameEn: expect.any(String), nameAr: expect.any(String) }),
    );
    expect(slip.penalties.map((p) => [p.date, p.action, p.days, p.amount])).toEqual([
      [day(month, 2), 'DEDUCT_DAYS', 0.5, 20_000],
      [day(month, 4), 'DEDUCT_DAYS', 1, 40_000],
      [day(month, 6), 'WARNING', null, 0],
    ]);
    expect(slip.penalties[0]).toEqual(
      expect.objectContaining({
        violationNameEn: expect.any(String),
        violationNameAr: expect.any(String),
        level: 1,
      }),
    );
    expect(slip.adjustments).toEqual([{ type: 'ADDITION', amount: 12_345, reason: 'Overtime' }]);
    expect(slip).toMatchObject({
      penaltyDays: 1.5,
      penaltyAmount: 60_000,
      net: 1_200_000 - 60_000 + 12_345,
    });

    // A line of another run is not found through this run.
    const other = await createRun(nextMonth());
    await payslip(run.id, lineOf(other, emp).id).expect(404);
  });

  it('Bank sheet: employee without a national ID → empty cell; rows = lines; net in EGP with 2 decimals', async () => {
    const month = nextMonth();
    const noId = await employee({ basicSalary: 1_234_567 });
    await setLateness(month, noId, 10).expect(200);
    const run = await createRun(month);
    const approved = await approveOk(run.id);
    const sheet = await readSheet(
      (await bankSheet(run.id).set('Accept-Language', 'ar').expect(200)).body as Buffer,
    );

    expect(sheet.getRow(1).getCell(1).value).toBe('كود الموظف');
    expect(sheet.actualRowCount - 1).toBe(approved.lines.length);
    const line = lineOf(approved, noId);
    const row = sheet.getRow(sheet.getColumn(1).values.indexOf(line.employeeCode));
    expect(row.getCell(4).value).toBeNull();
    expect(row.getCell(5).value).toBe(line.net! / 100);
    expect(row.getCell(5).numFmt).toBe('0.00');
    // 1,234,567 − round(0.25 × 1,234,567 ÷ 30) = 1,234,567 − 10,288 → EGP 12,242.79
    expect(line.net).toBe(1_224_279);
  });

  it('After APPROVE: edit the employee (salary, name, national ID) or deactivate them → line, payslip and bank sheet unchanged', async () => {
    const emp = await employee({ nationalId: nationalId() });
    const run = await createRun(nextMonth());
    const approved = await approveOk(run.id);
    const line = lineOf(approved, emp);
    const slipBefore = (await payslip(run.id, line.id).expect(200)).body.data as Payslip;
    const sheetBefore = (
      await readSheet((await bankSheet(run.id).expect(200)).body as Buffer)
    ).getSheetValues();

    await http(app)
      .patch(`/hr/employees/${emp}`)
      .send({
        basicSalary: 9_999_900,
        nameEn: 'Renamed',
        nameAr: 'اسم جديد',
        nationalId: nationalId(),
      })
      .expect(200);
    await http(app).post(`/hr/employees/${emp}/deactivate`).expect(200);

    expect(lineOf(await getRun(run.id), emp)).toEqual(line);
    expect((await payslip(run.id, line.id).expect(200)).body.data).toEqual(slipBefore);
    expect(
      (await readSheet((await bankSheet(run.id).expect(200)).body as Buffer)).getSheetValues(),
    ).toEqual(sheetBefore);
  });

  it('Change the divisor → a DRAFT run changes only after recalculate; an APPROVED run never changes', async () => {
    const draftMonth = nextMonth();
    const approvedMonth = nextMonth();
    const emp = await employee();
    await approvedPenalty(emp, day(draftMonth, 1), DEDUCT(1));
    await approvedPenalty(emp, day(approvedMonth, 1), DEDUCT(1));
    const draft = await createRun(draftMonth);
    const approved = await approveOk((await createRun(approvedMonth)).id);

    await setDivisor(25);
    expect(lineOf(await getRun(draft.id), emp).penaltyAmount).toBe(40_000);
    expect(
      lineOf((await recalculate(draft.id).expect(200)).body.data as PayrollRun, emp).penaltyAmount,
    ).toBe(48_000);
    // The approved run's money, lines and totals never change. Its `rules` are TODAY's HR rules
    // (a run keeps no snapshot; the screen labels them "Current rules … may differ", §6), so they
    // follow the new divisor and are compared apart.
    const { rules: rulesNow, ...approvedNow } = await getRun(approved.id);
    const { rules: rulesAtApproval, ...approvedThen } = approved;
    expect(approvedNow).toEqual(approvedThen);
    expect(rulesAtApproval.payroll.dayDivisor).toBe(30);
    expect(rulesNow.payroll.dayDivisor).toBe(25);
  });

  it("Move an employee to another department after APPROVE → the approved run's department filter still lists them under the old department", async () => {
    const emp = await employee();
    const run = await createRun(nextMonth());
    await approveOk(run.id);
    await http(app)
      .patch(`/hr/employees/${emp}`)
      .send({ departmentId: otherDepartmentId })
      .expect(200);

    const underOld = await getRun(run.id, { departmentId });
    expect(underOld.lines.some((l) => l.employeeId === emp)).toBe(true);
    expect(underOld.lines.every((l) => l.departmentId === departmentId)).toBe(true);
    const underNew = await getRun(run.id, { departmentId: otherDepartmentId });
    expect(underNew.lines.some((l) => l.employeeId === emp)).toBe(false);
  });

  it("Cancel an APPROVED penalty in an open month, then recalculate → penaltyDays drops; other penalties' levels unchanged", async () => {
    const month = nextMonth();
    const emp = await employee();
    const violationId = await violation([
      { level: 1, action: 'DEDUCT_DAYS', days: 1 },
      { level: 2, action: 'DEDUCT_DAYS', days: 2 },
    ]);
    const first = await recordPenalty(emp, violationId, day(month, 1));
    await approvePenalty(first);
    const second = await recordPenalty(emp, violationId, day(month, 8));
    await approvePenalty(second);
    const run = await createRun(month);
    expect(lineOf(run, emp).penaltyDays).toBe(3);

    await http(app)
      .post(`/hr/penalties/${first}/cancel`)
      .send({ reason: 'Recorded by mistake' })
      .expect(200);
    const line = lineOf((await recalculate(run.id).expect(200)).body.data as PayrollRun, emp);
    expect(line.penaltyDays).toBe(2);
    const kept = (await http(app).get(`/hr/penalties/${second}`).expect(200)).body.data;
    expect(kept).toMatchObject({ level: 2, days: 2, status: 'APPROVED' });
  });

  it('Dashboard: headcount counts ACTIVE only; penalties this month by violation date; currentRun null when there is no run', async () => {
    const current = monthOf(todayIsoDate());
    await db.payrollRun.deleteMany({ where: { month: current } });
    const dashboard = async () =>
      (await http(app).get('/hr/dashboard').expect(200)).body.data as HrDashboard;

    const before = await dashboard();
    expect(before.currentRun).toBeNull();
    expect(before.headcount!.active).toBe(await db.employee.count({ where: { status: 'ACTIVE' } }));
    expect(before.headcount!.active).toBe(before.headcount!.byStage.reduce((n, s) => n + s.count, 0));

    const emp = await employee();
    const leaver = await employee();
    await http(app).post(`/hr/employees/${leaver}/deactivate`).expect(200);
    await recordPenalty(emp, await violation(), todayIsoDate()); // pending, this month
    await approvedPenalty(emp, todayIsoDate()); // approved, this month
    await approvedPenalty(emp, day(nextMonth(), 1)); // another month: not counted

    const after = await dashboard();
    expect(after.headcount!.active).toBe(before.headcount!.active + 1);
    expect(after.headcount!.byStage).toEqual([
      {
        stage: { id: stageId, nameEn: 'Primary', nameAr: 'ابتدائي' },
        count: after.headcount!.active,
      },
    ]);
    expect(after.penaltiesThisMonth).toEqual({
      pending: before.penaltiesThisMonth!.pending + 1,
      approved: before.penaltiesThisMonth!.approved + 1,
    });
    expect(after.currentRun).toBeNull();

    const run = await createRun(current);
    expect((await dashboard()).currentRun).toEqual({
      id: run.id,
      month: current,
      status: 'DRAFT',
      salaryVisible: true,
      net: run.totals.net,
    });
  });

  it('Adjustment whose employee left the run → applied false, with the employee code and names; others applied true', async () => {
    const month = nextMonth();
    const stays = await employee();
    const leaves = await employee();
    const run = await createRun(month);
    await addAdjustment(run.id, {
      employeeId: stays,
      type: 'ADDITION',
      amount: 10_000,
      reason: 'Bonus',
    }).expect(201);
    await addAdjustment(run.id, {
      employeeId: leaves,
      type: 'DEDUCTION',
      amount: 5_000,
      reason: 'Advance',
    }).expect(201);
    await http(app).post(`/hr/employees/${leaves}/deactivate`).expect(200);
    await recalculate(run.id).expect(200);

    // Filtering the lines must not make an adjustment look unapplied.
    const filtered = await getRun(run.id, { search: 'no-such-employee' });
    const byEmployee = new Map(filtered.adjustments.map((a) => [a.employeeId, a]));
    const leaver = await db.employee.findUniqueOrThrow({ where: { id: leaves } });
    expect(byEmployee.get(stays)?.applied).toBe(true);
    expect(byEmployee.get(leaves)).toMatchObject({
      applied: false,
      employeeCode: leaver.code,
      nameEn: leaver.nameEn,
      nameAr: leaver.nameAr,
    });
  });

  it('Employee payroll history: one line per run, newest month first, with run id, month, status and the snapshot net; paginated', async () => {
    const emp = await employee({ basicSalary: 1_000_000 });
    const older = nextMonth();
    const newer = nextMonth();
    const olderRun = await createRun(older);
    await approveOk(olderRun.id);
    // A salary change after approval: the approved line keeps its snapshot net.
    await http(app).patch(`/hr/employees/${emp}`).send({ basicSalary: 2_000_000 }).expect(200);
    const newerRun = await createRun(newer);

    const list = async (query: Record<string, string | number> = {}) =>
      (await http(app).get(`/hr/employees/${emp}/payroll-lines`).query(query).expect(200)).body;

    const all = await list();
    expect(all.data as EmployeePayrollLine[]).toEqual([
      {
        runId: newerRun.id,
        lineId: lineOf(newerRun, emp).id,
        month: newer,
        status: 'DRAFT',
        salaryVisible: true,
        net: 2_000_000,
      },
      {
        runId: olderRun.id,
        lineId: lineOf(olderRun, emp).id,
        month: older,
        status: 'APPROVED',
        salaryVisible: true,
        net: 1_000_000,
      },
    ]);
    expect(all.meta).toMatchObject({ total: 2, page: 1 });

    const page2 = await list({ page: 2, limit: 1 });
    expect((page2.data as EmployeePayrollLine[]).map((l) => l.month)).toEqual([older]);
    expect(page2.meta).toMatchObject({ total: 2, hasNextPage: false, hasPreviousPage: true });
  });

  it('Employee payroll history: no runs → empty list; unknown employee → 404; malformed id → 400; limit over the max → 400', async () => {
    const fresh = await employee();
    await http(app).post(`/hr/employees/${fresh}/deactivate`).expect(200);
    const empty = await http(app).get(`/hr/employees/${fresh}/payroll-lines`).expect(200);
    expect(empty.body.data).toEqual([]);
    expect(empty.body.meta).toMatchObject({ total: 0 });

    await http(app)
      .get('/hr/employees/00000000-0000-4000-8000-000000000000/payroll-lines')
      .expect(404);
    await http(app).get('/hr/employees/not-a-uuid/payroll-lines').expect(400);
    await http(app).get(`/hr/employees/${fresh}/payroll-lines`).query({ limit: 1000 }).expect(400);
  });

  // ── full flow ─────────────────────────────────────────────────────────────

  it('Full flow: employee + penalty + lateness + adjustment → draft → approve → payslip numbers match by hand', async () => {
    const month = nextMonth();
    const id = nationalId();
    const emp = await employee({ basicSalary: 1_200_000, nationalId: id }); // EGP 12,000
    const penalty = await recordPenalty(emp, await violation(DEDUCT(1)), day(month, 12));
    await setLateness(month, emp, 75).expect(200); // 0.75 day

    const draft = await createRun(month);
    expect(lineOf(draft, emp).flags).toEqual(['PENDING_PENALTIES']);
    expect((await approve(draft.id).expect(409)).body.error).toBe(ErrorCode.PENDING_PENALTIES);
    await approvePenalty(penalty);

    await addAdjustment(draft.id, {
      employeeId: emp,
      type: 'ADDITION',
      amount: 50_000,
      reason: 'Exam bonus',
    }).expect(201);
    await addAdjustment(draft.id, {
      employeeId: emp,
      type: 'DEDUCTION',
      amount: 10_000,
      reason: 'Advance',
    }).expect(201);
    const approved = await approveOk(draft.id);
    expect(approved.status).toBe('APPROVED');

    const line = lineOf(approved, emp);
    const slip = (await payslip(approved.id, line.id).expect(200)).body.data as Payslip;
    // By hand: day value 12,000 ÷ 30 = EGP 400. Penalty 1 day = 400; lateness 0.75 day = 300;
    // net = 12,000 − 400 − 300 + 500 − 100 = EGP 11,700.
    expect(slip).toMatchObject({
      employeeId: emp,
      nationalId: id,
      departmentId,
      basicSalary: 1_200_000,
      workSystem: 'FULL_TIME',
      monthSalary: 1_200_000,
      dayValue: 40_000,
      penaltyDays: 1,
      penaltyAmount: 40_000,
      latenessMinutes: 75,
      latenessDays: 0.75,
      latenessAmount: 30_000,
      adjustmentAdditions: 50_000,
      adjustmentDeductions: 10_000,
      net: 1_170_000,
      flags: [],
      month,
    });
    expect(slip.penalties).toEqual([
      expect.objectContaining({ days: 1, amount: 40_000, action: 'DEDUCT_DAYS' }),
    ]);
    expect(slip.adjustments).toEqual([
      { type: 'ADDITION', amount: 50_000, reason: 'Exam bonus' },
      { type: 'DEDUCTION', amount: 10_000, reason: 'Advance' },
    ]);
  });
});
