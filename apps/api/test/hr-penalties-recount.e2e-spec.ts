import { INestApplication } from '@nestjs/common';
import {
  ErrorCode,
  type AuditEntry,
  type PayrollRun,
  type PenaltyPreview,
  type PenaltyRecord,
  type PenaltyRecountChange,
  type ViolationLevelInput,
} from '@school-erp/shared';
import { DatabaseService } from '../src/database/database.service';
import { http, unique } from './helpers';
import { createAppAsTestUser } from './helpers/as-test-user';
import { historyMark } from './helpers/history';
import { deleteEmployees } from './helpers/employees';
import { ACTION, ACTION_ID } from './helpers/penalty-actions';

/*
 * §4 backdated penalty (owner 2026-11-20): approving a penalty dated before approved ones of the
 * same employee and violation moves those up one level — listed before recording, confirmed at
 * approval, refused when one sits in an approved payroll month. This suite cleans up only what it
 * created (its employees, their penalties, its catalogue and lists, its payroll runs).
 */

const LEVELS: ViolationLevelInput[] = [
  { level: 1, actionId: ACTION_ID.DEDUCT_DAYS, days: 0.5 },
  { level: 2, actionId: ACTION_ID.DEDUCT_DAYS, days: 1 },
  { level: 3, actionId: ACTION_ID.DEDUCT_DAYS, days: 2 },
  { level: 4, actionId: ACTION_ID.DEDUCT_DAYS, days: 3 },
  { level: 5, actionId: ACTION_ID.DEDUCT_DAYS, days: 5 },
];

/** Months only this suite uses (in the past: penalties can't be dated ahead). */
const MONTH = '2017-11';
const LOCKED = '2017-12';
const DRAFT = '2017-10';
const RUN_MONTHS = [MONTH, LOCKED, DRAFT];

const day = (month: string, d: number) => `${month}-${String(d).padStart(2, '0')}`;

describe('HR penalties — backdated penalty recount (e2e, §4 owner 2026-11-20)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let stageId: string;
  let departmentId: string;
  let jobTitleId: string;
  let groupId: string;
  const employeeIds: string[] = [];
  const violationIds: string[] = [];

  const employee = async () => {
    const res = await http(app)
      .post('/hr/employees')
      .send({
        nameEn: unique('Recount'),
        nameAr: unique('إعادة'),
        gender: 'FEMALE',
        dateOfBirth: '1990-01-01',
        phone: '01000000000',
        hireDate: '2015-09-01',
        stageId,
        departmentId,
        jobTitleId,
        workSystem: 'FULL_TIME',
        basicSalary: 1_000_000,
      })
      .expect(201);
    employeeIds.push(res.body.data.id);
    return res.body.data.id as string;
  };

  const violation = async () => {
    const id = (
      await http(app)
        .post(`/hr/penalty-groups/${groupId}/violations`)
        .send({ nameEn: unique('Late'), nameAr: unique('تأخر'), levels: LEVELS })
        .expect(201)
    ).body.data.id as string;
    violationIds.push(id);
    return id;
  };

  const record = (employeeId: string, violationId: string, date: string) =>
    http(app).post('/hr/penalties').send({ employeeId, violationId, date });
  const recordOk = async (employeeId: string, violationId: string, date: string) =>
    (await record(employeeId, violationId, date).expect(201)).body.data as PenaltyRecord;
  const preview = (employeeId: string, violationId: string, date: string) =>
    http(app).get('/hr/penalties/preview').query({ employeeId, violationId, date });
  const getRecord = async (id: string) =>
    (await http(app).get(`/hr/penalties/${id}`).expect(200)).body.data as PenaltyRecord;
  const ackOf = (recount: PenaltyRecountChange[]) => recount.map((c) => ({ id: c.id, ...c.after }));
  const approve = (id: string, acknowledgedRecount?: ReturnType<typeof ackOf>) =>
    http(app)
      .post(`/hr/penalties/${id}/approve`)
      .send(acknowledgedRecount === undefined ? {} : { acknowledgedRecount });
  const approvedOn = async (employeeId: string, violationId: string, date: string) => {
    const rec = await recordOk(employeeId, violationId, date);
    return (await approve(rec.id).expect(200)).body.data as PenaltyRecord;
  };
  const summary = (recount: PenaltyRecountChange[]) =>
    recount.map((c) => [c.date, c.before.level, c.after.level, c.before.days, c.after.days]);

  beforeAll(async () => {
    ({ app } = await createAppAsTestUser());
    db = app.get(DatabaseService);
    await db.payrollRun.deleteMany({ where: { month: { in: RUN_MONTHS } } });
    stageId = (await db.stage.create({ data: { nameEn: unique('Stage'), nameAr: unique('مرحلة') } })).id;
    const mk = async (path: string) =>
      (await http(app).post(path).send({ nameEn: unique('x'), nameAr: unique('س') }).expect(201)).body.data
        .id as string;
    departmentId = await mk('/hr/departments');
    jobTitleId = await mk('/hr/job-titles');
    groupId = await mk('/hr/penalty-groups');
  });

  afterAll(async () => {
    await db.payrollRun.deleteMany({ where: { month: { in: RUN_MONTHS } } });
    await db.penaltyRecord.deleteMany({ where: { employeeId: { in: employeeIds } } });
    await db.violationLevel.deleteMany({ where: { violationId: { in: violationIds } } });
    await db.violation.deleteMany({ where: { id: { in: violationIds } } });
    await db.penaltyGroup.deleteMany({ where: { id: groupId } });
    await deleteEmployees(db, { where: { id: { in: employeeIds } } });
    await db.department.deleteMany({ where: { id: departmentId } });
    await db.jobTitle.deleteMany({ where: { id: jobTitleId } });
    await db.stage.deleteMany({ where: { id: stageId } });
    await app.close();
  });

  it("the owner's scenario: 19 L1 and 20 L2 approved; 18 recorded → heads-up; approve unconfirmed → 409; confirmed → 1/2/3, deductions, audit, History", async () => {
    const emp = await employee();
    const v = await violation();
    const d19 = await approvedOn(emp, v, day(MONTH, 19));
    const d20 = await approvedOn(emp, v, day(MONTH, 20));
    expect([d19.level, d20.level]).toEqual([1, 2]);

    // Before saving: the preview lists both changes with their new deductions.
    const heads = (await preview(emp, v, day(MONTH, 18)).set('Accept-Language', 'en').expect(200)).body
      .data as PenaltyPreview;
    expect(heads).toMatchObject({ level: 1, days: 0.5, priorCount: 0 });
    expect(summary(heads.recount)).toEqual([
      [day(MONTH, 19), 1, 2, 0.5, 1],
      [day(MONTH, 20), 2, 3, 1, 2],
    ]);
    expect(heads.recount.map((c) => c.id)).toEqual([d19.id, d20.id]);

    // Recording changes nothing; the record carries the same list.
    const d18 = await recordOk(emp, v, day(MONTH, 18));
    expect((await getRecord(d19.id)).level).toBe(1);
    expect((await getRecord(d20.id)).level).toBe(2);
    expect(d18.recount).toEqual(heads.recount);
    expect(d18.recountLockedMonth).toBeNull();

    // Approve without confirming → 409 with the list; nothing written.
    const before = await historyMark(db);
    const refused = await approve(d18.id).set('Accept-Language', 'en').expect(409);
    expect(refused.body.error).toBe(ErrorCode.PENALTY_RECOUNT_UNCONFIRMED);
    expect(refused.body.params).toEqual({ count: 2 });
    expect(refused.body.data.recount).toEqual(heads.recount);
    expect(refused.body.message).toBe(
      'Approving this penalty raises the level of 2 approved penalties. Check them and confirm.',
    );
    expect((await getRecord(d18.id)).status).toBe('WAITING_HR');
    expect((await getRecord(d20.id)).level).toBe(2);
    expect(await db.auditEntry.count({ where: { seq: { gt: before } } })).toBe(0);

    // Confirmed → 18 L1, 19 L2, 20 L3, deductions from the catalogue's levels.
    const approved = (await approve(d18.id, ackOf(d18.recount)).expect(200)).body.data as PenaltyRecord;
    expect(approved).toMatchObject({ status: 'APPROVED', level: 1, days: 0.5, recount: [] });
    expect(await getRecord(d19.id)).toMatchObject({ status: 'APPROVED', level: 2, action: ACTION.DEDUCT_DAYS, days: 1 });
    expect(await getRecord(d20.id)).toMatchObject({ status: 'APPROVED', level: 3, action: ACTION.DEDUCT_DAYS, days: 2 });

    // Audit: the approval, plus one entry per recounted penalty — in the employee's History.
    const recounts = await db.auditEntry.findMany({
      where: { seq: { gt: before }, action: 'hr.penalty.recount' },
      orderBy: { seq: 'asc' },
    });
    expect(recounts.map((e) => e.entityId)).toEqual([d19.id, d20.id]);
    expect(recounts[1]?.changes).toEqual([
      { field: 'penaltyDate', before: null, after: day(MONTH, 20) },
      { field: 'level', before: 2, after: 3 },
      { field: 'days', before: 1, after: 2 },
      { field: 'recountedAfter', before: null, after: day(MONTH, 18) },
    ]);
    expect(await db.auditEntry.count({ where: { seq: { gt: before }, action: 'hr.penalty.approve' } })).toBe(1);
    const history = (await http(app).get(`/audit/records/employee/${emp}`).query({ limit: 50 }).expect(200)).body
      .data as AuditEntry[];
    const recountedInHistory = history.filter((e) => e.action === 'hr.penalty.recount');
    expect(recountedInHistory.map((e) => e.entityId).sort()).toEqual([d19.id, d20.id].sort());

    // The pair is consistent now: the next one is level 4.
    expect((await preview(emp, v, day(MONTH, 21)).expect(200)).body.data).toMatchObject({ level: 4, recount: [] });
  });

  it('a stale confirmation → 409 PENALTY_RECOUNT_CHANGED with the fresh list; the fresh one approves', async () => {
    const emp = await employee();
    const v = await violation();
    const d10 = await approvedOn(emp, v, day(MONTH, 10));
    const d12 = await approvedOn(emp, v, day(MONTH, 12));
    const d5 = await recordOk(emp, v, day(MONTH, 5));
    const shown = d5.recount;
    expect(shown.map((c) => c.id)).toEqual([d10.id, d12.id]);
    // Meanwhile a later one is cancelled: the screen's list is out of date. (A later one can't be
    // approved meanwhile — the pending 5th comes first, §4 approve in date order.)
    await http(app).post(`/hr/penalties/${d12.id}/cancel`).send({ reason: 'recorded twice' }).expect(200);

    const stale = await approve(d5.id, ackOf(shown)).expect(409);
    expect(stale.body.error).toBe(ErrorCode.PENALTY_RECOUNT_CHANGED);
    expect(stale.body.params).toEqual({ count: 1 });
    const fresh = stale.body.data.recount as PenaltyRecountChange[];
    expect(fresh.map((c) => c.id)).toEqual([d10.id]);
    expect((await getRecord(d5.id)).status).toBe('WAITING_HR');
    expect((await getRecord(d10.id)).level).toBe(1);

    // Confirming changes that aren't there (another level) is stale too.
    await approve(d5.id, fresh.map((c) => ({ id: c.id, ...c.after, level: c.after.level + 1 }))).expect(409);
    await approve(d5.id, ackOf(fresh)).expect(200);
    expect((await getRecord(d10.id)).level).toBe(2);
    // The cancelled one keeps the level it had.
    expect(await getRecord(d12.id)).toMatchObject({ status: 'CANCELLED', level: 2 });
  });

  it('a later approved penalty in an approved payroll month: preview, recording and approval are refused naming the month', async () => {
    const emp = await employee();
    const v = await violation();
    await approvedOn(emp, v, day(LOCKED, 3));
    // Recorded while the month was still open…
    const d28 = await recordOk(emp, v, day(MONTH, 28));
    expect(d28.recount).toHaveLength(1);
    await db.payrollRun.create({ data: { month: LOCKED, status: 'APPROVED', approvedAt: new Date() } });
    try {
      const p = await preview(emp, v, day(MONTH, 27)).set('Accept-Language', 'en').expect(409);
      expect(p.body.error).toBe(ErrorCode.PENALTY_RECOUNT_MONTH_LOCKED);
      expect(p.body.params).toEqual({ month: LOCKED });
      expect(p.body.message).toContain('December 2017');
      const r = await record(emp, v, day(MONTH, 27)).expect(409);
      expect(r.body.error).toBe(ErrorCode.PENALTY_RECOUNT_MONTH_LOCKED);
      expect(await db.penaltyRecord.count({ where: { employeeId: emp, date: new Date(`${day(MONTH, 27)}T00:00:00Z`) } })).toBe(0);

      // …the pending one says so, and its approval is refused even when confirmed.
      expect((await getRecord(d28.id)).recountLockedMonth).toBe(LOCKED);
      const a = await approve(d28.id, ackOf(d28.recount)).expect(409);
      expect(a.body.error).toBe(ErrorCode.PENALTY_RECOUNT_MONTH_LOCKED);
      expect((await getRecord(d28.id)).status).toBe('WAITING_HR');
      // Cancelling it is still allowed (its own month is open).
      await http(app).post(`/hr/penalties/${d28.id}/cancel`).send({ reason: 'goes to December as an adjustment' }).expect(200);
    } finally {
      await db.payrollRun.deleteMany({ where: { month: LOCKED } });
    }
  });

  it('a draft run of a recounted month is due a Recalculate', async () => {
    const emp = await employee();
    const v = await violation();
    await approvedOn(emp, v, day(DRAFT, 20));
    const run = await db.payrollRun.create({ data: { month: DRAFT, status: 'DRAFT', calculatedAt: new Date() } });
    try {
      const getRun = async () => (await http(app).get(`/hr/payroll-runs/${run.id}`).expect(200)).body.data as PayrollRun;
      expect((await getRun()).penaltiesRecounted).toBe(false);
      const d5 = await recordOk(emp, v, day(DRAFT, 5));
      await approve(d5.id, ackOf(d5.recount)).expect(200);
      expect((await getRun()).penaltiesRecounted).toBe(true);
      const recalculated = (await http(app).post(`/hr/payroll-runs/${run.id}/recalculate`).expect(200)).body
        .data as PayrollRun;
      expect(recalculated.penaltiesRecounted).toBe(false);
    } finally {
      await db.payrollRun.deleteMany({ where: { month: DRAFT } });
    }
  });

  it('concurrent approvals of the same backdated penalty: one succeeds and the later ones move up exactly once', async () => {
    const emp = await employee();
    const v = await violation();
    const d19 = await approvedOn(emp, v, day(MONTH, 19));
    const d20 = await approvedOn(emp, v, day(MONTH, 20));
    const d18 = await recordOk(emp, v, day(MONTH, 18));
    const ack = ackOf(d18.recount);
    const results = await Promise.all([approve(d18.id, ack), approve(d18.id, ack), approve(d18.id, ack)]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    for (const r of results.filter((x) => x.status !== 200)) {
      expect(r.status).toBe(409);
      expect(r.body.error).toBe(ErrorCode.PENALTY_WRONG_STEP);
    }
    expect((await getRecord(d19.id)).level).toBe(2);
    expect((await getRecord(d20.id)).level).toBe(3);
  });

  it('concurrent: approving the backdated one while a later one is cancelled — never a lost or half recount', async () => {
    const emp = await employee();
    const v = await violation();
    const d19 = await approvedOn(emp, v, day(MONTH, 19));
    const d20 = await approvedOn(emp, v, day(MONTH, 20));
    const d18 = await recordOk(emp, v, day(MONTH, 18));
    const [approval] = await Promise.all([
      approve(d18.id, ackOf(d18.recount)),
      http(app).post(`/hr/penalties/${d20.id}/cancel`).send({ reason: 'recorded twice' }).expect(200),
    ]);
    if (approval.status === 200) {
      // The approval ran first: 20 was recounted (L3), then cancelled.
      expect(await getRecord(d20.id)).toMatchObject({ status: 'CANCELLED', level: 3 });
    } else {
      // The cancel ran first: the confirmation is stale; the fresh one names only 19.
      expect(approval.body.error).toBe(ErrorCode.PENALTY_RECOUNT_CHANGED);
      expect((approval.body.data.recount as PenaltyRecountChange[]).map((c) => c.id)).toEqual([d19.id]);
      await approve(d18.id, ackOf(approval.body.data.recount)).expect(200);
      expect(await getRecord(d20.id)).toMatchObject({ status: 'CANCELLED', level: 2 });
    }
    expect((await getRecord(d19.id)).level).toBe(2);
  });

  it('other employees, other violations and penalties outside the window are untouched; no confirmation needed', async () => {
    const emp = await employee();
    const other = await employee();
    const v = await violation();
    const otherV = await violation();
    const otherEmp = await approvedOn(other, v, day(MONTH, 20));
    const otherViolation = await approvedOn(emp, otherV, day(MONTH, 20));
    // Next contract year (from 1 June 2018): outside the 2017 one's window.
    const nextYear = await approvedOn(emp, v, '2018-06-04');
    const d18 = await recordOk(emp, v, day(MONTH, 18));
    expect(d18.recount).toEqual([]);
    await approve(d18.id).expect(200);
    for (const r of [otherEmp, otherViolation, nextYear]) expect((await getRecord(r.id)).level).toBe(1);
  });

  it('a same-date penalty recorded later is not backdated: nothing moves', async () => {
    const emp = await employee();
    // Repeats within a day (§4: once per day off).
    const v = (
      await http(app)
        .post(`/hr/penalty-groups/${groupId}/violations`)
        .send({ nameEn: unique('Late'), nameAr: unique('تأخر'), oncePerDay: false, levels: LEVELS })
        .expect(201)
    ).body.data.id as string;
    violationIds.push(v);
    const first = await approvedOn(emp, v, day(MONTH, 15));
    const second = await recordOk(emp, v, day(MONTH, 15));
    expect(second.recount).toEqual([]);
    expect((await approve(second.id).expect(200)).body.data.level).toBe(2);
    expect((await getRecord(first.id)).level).toBe(1);
  });
});
