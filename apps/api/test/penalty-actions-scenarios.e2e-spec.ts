import { INestApplication } from '@nestjs/common';
import {
  BuiltInRole,
  ErrorCode,
  PayrollFlag,
  type AuditChange,
  type AuthUser,
  type PayrollRun,
  type PenaltyActionItem,
  type PenaltyRecord,
  type Payslip,
  type Violation,
  type ViolationLevelInput,
} from '@school-erp/shared';
import { DatabaseService } from '../src/database/database.service';
import { http, unique } from './helpers';
import { createAppAsTestUser, giveRoles } from './helpers/as-test-user';
import { deleteEmployees } from './helpers/employees';
import { outboxIdle } from './helpers/events';
import { ACTION_ID } from './helpers/penalty-actions';

/*
 * The blind scenarios of `docs/specs/2026-11-25-penalty-actions-scenarios.md` that need the whole
 * system — flows, time, permissions, bad input and History — one test per scenario, named after its
 * S-number. (The money maths S1–S24 / S63 are pure-rule tests in `penalty-scenarios.spec.ts`; the
 * labels in the web app; the walks the spec itself states in `hr-penalty-actions.e2e-spec.ts`,
 * which carry the S-numbers they cover.) Each runs in a payroll month of its own, in 2014.
 */

let monthSeq = 0;
/** A fresh month per scenario, rolling into the next year after December (one run per month, §6). */
const usedMonths: string[] = [];
const nextMonth = () => {
  const n = monthSeq++;
  const month = `${2014 + Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`;
  usedMonths.push(month);
  return month;
};
const day = (month: string, d: number) => `${month}-${String(d).padStart(2, '0')}`;

describe('Penalty actions — the blind scenarios (e2e)', () => {
  let app: INestApplication;
  let user: AuthUser;
  let db: DatabaseService;
  /** Primary (head: Hany) and Prep (head: Dina) review penalties; Plain has no head (HR alone decides). */
  let primary: string;
  let prep: string;
  let plain: string;
  let departmentId: string;
  let jobTitleId: string;
  let managingTitleId: string;
  let groupId: string;
  let mark = BigInt(0);
  const users: string[] = [];
  /** People of the scenarios: users (ids) and the employees they are. */
  const who = { hany: '', dina: '', adel: '', salma: '', tarek: '', rami: '', mona: '' };
  const emp = { hany: '', dina: '', adel: '', rami: '', mona: '' };

  // ── helpers ───────────────────────────────────────────────────────────────

  async function as<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const me = user.id;
    user.id = id;
    try {
      return await fn();
    } finally {
      user.id = me;
    }
  }
  const newUser = async (label: string, roleKeys: string[], employeeId: string | null = null) => {
    const id = (
      await db.user.create({
        data: { email: `${unique(label)}@example.test`, name: unique(label), passwordHash: 'x', employeeId },
        select: { id: true },
      })
    ).id;
    users.push(id);
    await giveRoles(db, id, roleKeys);
    return id;
  };
  const employee = async (over: Record<string, unknown> = {}) =>
    (
      await http(app)
        .post('/hr/employees')
        .send({
          nameEn: unique('Nadia'),
          nameAr: unique('نادية'),
          gender: 'FEMALE',
          dateOfBirth: '1990-01-01',
          phone: '01000000000',
          hireDate: '2010-09-01',
          stageId: plain,
          departmentId,
          jobTitleId,
          workSystem: 'FULL_TIME',
          basicSalary: 900_000,
          ...over,
        })
        .expect(201)
    ).body.data.id as string;

  const actionOk = async (body: Record<string, unknown>) =>
    (
      await http(app)
        .post('/hr/penalty-actions')
        .send({ nameEn: unique('Action'), nameAr: unique('إجراء'), effect: 'RECORD_ONLY', ...body })
        .expect(201)
    ).body.data as PenaltyActionItem;
  const pctAction = (percentBase: 'MONTH_SALARY' | 'BASIC_SALARY' = 'MONTH_SALARY') => actionOk({ effect: 'DEDUCT_PERCENT', percentBase });
  const amtAction = () => actionOk({ effect: 'DEDUCT_AMOUNT' });
  const newViolation = (levels: ViolationLevelInput[]) =>
    http(app)
      .post(`/hr/penalty-groups/${groupId}/violations`)
      .send({ nameEn: unique('Violation'), nameAr: unique('مخالفة'), oncePerDay: false, levels });
  const violation = async (levels: ViolationLevelInput[]) => (await newViolation(levels).expect(201)).body.data as Violation;
  const setLevels = (id: string, levels: ViolationLevelInput[]) => http(app).patch(`/hr/violations/${id}`).send({ levels });
  const pct = (actionId: string, percent: number, level = 1): ViolationLevelInput => ({ level, actionId, percent });

  const recordReq = (employeeId: string, violationId: string, date: string, stageId?: string) =>
    http(app).post('/hr/penalties').send({ employeeId, violationId, date, ...(stageId ? { stageId } : {}) });
  const record = async (employeeId: string, violationId: string, date: string) =>
    (await recordReq(employeeId, violationId, date).expect(201)).body.data as PenaltyRecord;
  const getRecord = async (id: string) => (await http(app).get(`/hr/penalties/${id}`).expect(200)).body.data as PenaltyRecord;
  const approveReq = async (id: string) => {
    const shown = await getRecord(id);
    const acknowledgedRecount = shown.recount.map((c) => ({
      id: c.id,
      level: c.after.level,
      actionId: c.after.action.id,
      days: c.after.days,
      percent: c.after.percent,
      amount: c.after.amount,
    }));
    return http(app).post(`/hr/penalties/${id}/approve`).send(acknowledgedRecount.length ? { acknowledgedRecount } : {});
  };
  const approve = async (id: string) => {
    const res = await approveReq(id);
    expect(res.status).toBe(200);
    return res.body.data as PenaltyRecord;
  };
  const approved = async (employeeId: string, violationId: string, date: string) => approve((await record(employeeId, violationId, date)).id);

  const getRun = async (id: string) =>
    (await http(app).get(`/hr/payroll-runs/${id}`).query({ limit: '500' }).expect(200)).body.data as PayrollRun;
  const createRun = async (month: string) => getRun((await http(app).post('/hr/payroll-runs').send({ month }).expect(201)).body.data.id);
  const recalculate = async (id: string) => {
    await http(app).post(`/hr/payroll-runs/${id}/recalculate`).expect(200);
    return getRun(id);
  };
  const approveRun = async (id: string) => {
    await http(app).post(`/hr/payroll-runs/${id}/approve`).expect(200);
    await outboxIdle(app);
    return getRun(id);
  };
  const lineOf = (run: PayrollRun, employeeId: string) => {
    const line = run.lines.find((l) => l.employeeId === employeeId);
    if (!line) throw new Error(`no line for ${employeeId}`);
    return line;
  };
  const payslip = async (run: PayrollRun, employeeId: string) =>
    (await http(app).get(`/hr/payroll-runs/${run.id}/lines/${lineOf(run, employeeId).id}`).expect(200)).body.data as Payslip;
  const entries = (action: string, entityId?: string) =>
    db.auditEntry.findMany({ where: { seq: { gt: mark }, action, ...(entityId ? { entityId } : {}) }, orderBy: { seq: 'asc' } });
  const changesOf = (e: { changes: unknown }) => e.changes as AuditChange[];

  beforeAll(async () => {
    ({ app, user } = await createAppAsTestUser());
    db = app.get(DatabaseService);
    primary = (await db.stage.create({ data: { nameEn: unique('Primary'), nameAr: unique('ابتدائي') } })).id;
    prep = (await db.stage.create({ data: { nameEn: unique('Prep'), nameAr: unique('إعدادي') } })).id;
    plain = (await db.stage.create({ data: { nameEn: unique('Plain'), nameAr: unique('عادي') } })).id;
    const mk = async (path: string, extra = {}) =>
      (await http(app).post(path).send({ nameEn: unique('x'), nameAr: unique('س'), ...extra }).expect(201)).body.data.id as string;
    departmentId = await mk('/hr/departments');
    jobTitleId = await mk('/hr/job-titles');
    managingTitleId = await mk('/hr/job-titles', { managesPeople: true });
    groupId = (await http(app).post('/hr/penalty-groups').send({ nameEn: unique('Group'), nameAr: unique('مجموعة') }).expect(201)).body.data
      .id as string;
    // Hany heads Primary, Dina heads Prep; Adel the principal; Salma an HR officer; Tarek the
    // accountant; Rami a direct manager; Mona the HR manager (with an employee record of her own).
    emp.hany = await employee({ stageId: primary, basicSalary: 1_500_000 });
    emp.dina = await employee({ stageId: prep, basicSalary: 1_500_000 });
    emp.adel = await employee({ stageId: primary, basicSalary: 2_000_000 });
    emp.rami = await employee({ stageId: primary, jobTitleId: managingTitleId });
    emp.mona = await employee({ stageId: plain });
    who.hany = await newUser('hany', [BuiltInRole.STAGE_HEAD], emp.hany);
    who.dina = await newUser('dina', [BuiltInRole.STAGE_HEAD], emp.dina);
    who.adel = await newUser('adel', [BuiltInRole.PRINCIPAL], emp.adel);
    who.salma = await newUser('salma', [BuiltInRole.HR_OFFICER]);
    who.tarek = await newUser('tarek', [BuiltInRole.ACCOUNTANT]);
    who.rami = await newUser('rami', [BuiltInRole.DIRECT_MANAGER], emp.rami);
    who.mona = await newUser('mona', [BuiltInRole.HR_MANAGER], emp.mona);
  });

  beforeEach(async () => {
    mark = (await db.auditEntry.aggregate({ _max: { seq: true } }))._max.seq ?? BigInt(0);
  });

  afterAll(async () => {
    const months = usedMonths;
    const runIds = (await db.payrollRun.findMany({ where: { month: { in: months } }, select: { id: true } })).map((r) => r.id);
    await db.accountingPayrollRun.deleteMany({ where: { OR: [{ hrRunId: { in: runIds } }, { month: { in: months } }] } });
    await db.payrollRun.deleteMany({ where: { month: { in: months } } });
    await db.notification.deleteMany({ where: { recipientKind: 'user', recipientId: { in: users } } });
    await db.penaltyRecord.deleteMany({});
    await db.violationLevel.deleteMany({});
    await db.violation.deleteMany({});
    await db.penaltyGroup.deleteMany({});
    await db.penaltyAction.deleteMany({ where: { code: null } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.employeeStage.deleteMany({});
    await db.employee.updateMany({ data: { managerId: null } });
    await deleteEmployees(db);
    await db.department.deleteMany({});
    await db.jobTitle.deleteMany({});
    await db.stage.deleteMany({});
    await app.close();
  });

  // ── B. Flows ──────────────────────────────────────────────────────────────

  it('S26 — recorded by the stage head: straight to Waiting for HR; the principal approves; he sees the label, never the line’s money; the month deducts 300.00', async () => {
    const month = nextMonth();
    const fine = await amtAction();
    const v = await violation([{ level: 1, actionId: fine.id, amount: 30_000 }]);
    const nadia = await employee({ stageId: primary });
    const rec = (await as(who.hany, () => recordReq(nadia, v.id, day(month, 3)).expect(201))).body.data as PenaltyRecord;
    expect(rec).toMatchObject({ status: 'WAITING_HR', reviewSkip: 'RECORDER_IS_HEAD', amount: 30_000 });
    const fixed = (await as(who.adel, () => http(app).post(`/hr/penalties/${rec.id}/approve`).send({}).expect(200))).body.data as PenaltyRecord;
    expect(fixed).toMatchObject({ status: 'APPROVED', action: { id: fine.id, effect: 'DEDUCT_AMOUNT' }, amount: 30_000 });
    const run = await approveRun((await createRun(month)).id);
    expect(lineOf(run, nadia)).toMatchObject({ penaltyAmount: 30_000, net: 870_000 });
    const asAdel = (await as(who.adel, () => http(app).get(`/hr/payroll-runs/${run.id}`).query({ limit: '500' }).expect(200))).body.data as PayrollRun;
    const line = lineOf(asAdel, nadia);
    expect(line.salaryVisible).toBe(false);
    expect(line.penaltyAmount).toBeUndefined();
    expect(line.net).toBeUndefined();
  });

  it('S27 — rejected at the stage review: final, costs nothing, never counts toward the next level, not on the payslip', async () => {
    const month = nextMonth();
    const v = await violation([
      { level: 1, actionId: ACTION_ID.DEDUCT_DAYS, days: 2 },
      { level: 2, actionId: ACTION_ID.DEDUCT_DAYS, days: 3 },
    ]);
    const nadia = await employee({ stageId: primary });
    const pending = (await as(who.salma, () => recordReq(nadia, v.id, day(month, 5)).expect(201))).body.data as PenaltyRecord;
    expect(pending.status).toBe('PENDING_REVIEW');
    const rejected = (await as(who.hany, () =>
      http(app).post(`/hr/penalties/${pending.id}/review/reject`).send({ reason: 'Was on an approved errand' }).expect(200),
    )).body.data as PenaltyRecord;
    expect(rejected).toMatchObject({ status: 'REJECTED', rejectionReason: 'Was on an approved errand', rejectedStep: 'REVIEW' });
    // Recorded by the stage head himself: no review, straight to HR.
    const next = (await as(who.hany, () => recordReq(nadia, v.id, day(month, 6)).expect(201))).body.data as PenaltyRecord;
    expect(next.level).toBe(1);
    await approve(next.id);
    const run = await approveRun((await createRun(month)).id);
    expect((await payslip(run, nadia)).penalties.map((p) => p.date)).toEqual([day(month, 6)]);
    expect(lineOf(run, nadia).penaltyDays).toBe(2);
  });

  it('S28 — rejected at HR: an empty reason is refused; with a reason → Rejected, no deduction, one rejection entry', async () => {
    const pctA = await pctAction();
    const v = await violation([pct(pctA.id, 5)]);
    const rec = await record(await employee(), v.id, day(nextMonth(), 4));
    await http(app).post(`/hr/penalties/${rec.id}/reject`).send({ reason: '   ' }).expect(400);
    const done = (await http(app).post(`/hr/penalties/${rec.id}/reject`).send({ reason: 'Duplicate of 4 Jan' }).expect(200)).body.data as PenaltyRecord;
    expect(done).toMatchObject({ status: 'REJECTED', rejectedStep: 'HR', percent: 5 });
    expect(await entries('hr.penalty.reject', rec.id)).toHaveLength(1);
  });

  it('S29 — approved, then cancelled before the month is approved: the approval recalculates, net 9,000.00, no payslip line', async () => {
    const month = nextMonth();
    const fine = await amtAction();
    const v = await violation([{ level: 1, actionId: fine.id, amount: 30_000 }]);
    const nadia = await employee();
    const p = await approved(nadia, v.id, day(month, 7));
    const draft = await createRun(month);
    expect(lineOf(draft, nadia).net).toBe(870_000);
    await http(app).post(`/hr/penalties/${p.id}/cancel`).send({ reason: 'Wrong employee' }).expect(200);
    // Owner Q6: the draft says the penalties changed since its calculation.
    expect((await getRun(draft.id)).penaltiesRecounted).toBe(true);
    const run = await approveRun(draft.id);
    expect(lineOf(run, nadia)).toMatchObject({ penaltyAmount: 0, net: 900_000 });
    expect((await payslip(run, nadia)).penalties).toEqual([]);
  });

  it('S30, S47 — a month can’t be approved while a penalty dated in it waits (owner Q1); once approved it deducts 900.00', async () => {
    const month = nextMonth();
    const pctA = await pctAction();
    const v = await violation([pct(pctA.id, 10)]);
    const nadia = await employee();
    const waiting = await record(nadia, v.id, day(month, 20));
    const draft = await createRun(month);
    expect(lineOf(draft, nadia).flags).toContain(PayrollFlag.PENDING_PENALTIES);
    const refused = await http(app).post(`/hr/payroll-runs/${draft.id}/approve`).expect(409);
    expect(refused.body.error).toBe(ErrorCode.PENDING_PENALTIES);
    await approve(waiting.id);
    expect(lineOf(await approveRun(draft.id), nadia)).toMatchObject({ penaltyAmount: 90_000, net: 810_000 });
  });

  it('S32 — Accounting returns the month: the next calculation reprices the % from the line’s new salary (owner Q15)', async () => {
    const month = nextMonth();
    const pctA = await pctAction();
    const nadia = await employee();
    await approved(nadia, (await violation([pct(pctA.id, 10)])).id, day(month, 6));
    const run = await approveRun((await createRun(month)).id);
    expect(lineOf(run, nadia).penaltyAmount).toBe(90_000);
    await http(app).patch(`/hr/employees/${nadia}`).send({ basicSalary: 950_000 }).expect(200);
    await http(app).post(`/accounting/payroll/${month}/return`).send({ reason: 'Recheck the penalties' }).expect(204);
    expect((await getRun(run.id)).status).toBe('DRAFT');
    expect(lineOf(await recalculate(run.id), nadia)).toMatchObject({ penaltyAmount: 95_000, net: 855_000 });
  });

  // ── C. Time ───────────────────────────────────────────────────────────────

  it('S34 — re-pricing a level never touches a draft: the approved 10% stays 900.00 after recalculating, no stale notice', async () => {
    const month = nextMonth();
    const pctA = await pctAction();
    const v = await violation([pct(pctA.id, 10)]);
    const nadia = await employee();
    await approved(nadia, v.id, day(month, 4));
    const draft = await createRun(month);
    await setLevels(v.id, [pct(pctA.id, 20)]).expect(200);
    expect((await getRun(draft.id)).penaltiesRecounted).toBe(false);
    expect(lineOf(await recalculate(draft.id), nadia).penaltyAmount).toBe(90_000);
  });

  it('S35 — re-priced after the stage review: HR approves today’s catalogue (EGP 500), payroll deducts 500.00; the approval entry shows the change (owner Q5)', async () => {
    const month = nextMonth();
    const fine = await amtAction();
    const v = await violation([{ level: 1, actionId: ACTION_ID.DEDUCT_DAYS, days: 0.5 }]);
    const nadia = await employee({ stageId: primary });
    const rec = (await as(who.salma, () => recordReq(nadia, v.id, day(month, 8)).expect(201))).body.data as PenaltyRecord;
    await as(who.hany, () => http(app).post(`/hr/penalties/${rec.id}/review/approve`).send({}).expect(200));
    await setLevels(v.id, [{ level: 1, actionId: fine.id, amount: 50_000 }]).expect(200);
    expect(await getRecord(rec.id)).toMatchObject({ status: 'WAITING_HR', action: { id: fine.id }, amount: 50_000, days: null });
    expect(await approve(rec.id)).toMatchObject({ amount: 50_000 });
    const [entry] = await entries('hr.penalty.approve', rec.id);
    const action = changesOf(entry).find((c) => c.field === 'action');
    expect(action).toMatchObject({ before: { nameEn: 'Deduct days' }, after: { nameEn: fine.nameEn } });
    expect(lineOf(await createRun(month), nadia).penaltyAmount).toBe(50_000);
  });

  it('S36 — a level switched from 1 day to 10% of the basic salary while waiting: fixed as 10% of basic, the month deducts 900.00 not 300.00', async () => {
    const month = nextMonth();
    const basic = await pctAction('BASIC_SALARY');
    const v = await violation([{ level: 1, actionId: ACTION_ID.DEDUCT_DAYS, days: 1 }]);
    const nadia = await employee();
    const rec = await record(nadia, v.id, day(month, 9));
    await setLevels(v.id, [pct(basic.id, 10)]).expect(200);
    expect(await approve(rec.id)).toMatchObject({ action: { effect: 'DEDUCT_PERCENT', percentBase: 'BASIC_SALARY' }, percent: 10 });
    expect(lineOf(await createRun(month), nadia).penaltyAmount).toBe(90_000);
  });

  it('S38 — the salary raised between the penalty’s approval and the month’s: 10% = 1,000.00, 1 day = 333.33, net 8,666.67', async () => {
    const month = nextMonth();
    const pctA = await pctAction();
    const nadia = await employee();
    await approved(nadia, (await violation([pct(pctA.id, 10)])).id, day(month, 10));
    await approved(nadia, (await violation([{ level: 1, actionId: ACTION_ID.DEDUCT_DAYS, days: 1 }])).id, day(month, 11));
    const draft = await createRun(month);
    expect(lineOf(draft, nadia).penaltyAmount).toBe(120_000);
    await http(app).patch(`/hr/employees/${nadia}`).send({ basicSalary: 1_000_000 }).expect(200);
    const run = await approveRun(draft.id);
    expect(lineOf(run, nadia)).toMatchObject({ monthSalary: 1_000_000, penaltyDaysAmount: 33_333, penaltyAmount: 133_333, net: 866_667 });
    // S39: a later cut changes nothing in the approved month.
    await http(app).patch(`/hr/employees/${nadia}`).send({ basicSalary: 900_000 }).expect(200);
    expect((await payslip(await getRun(run.id), nadia)).penalties.map((p) => p.amount)).toEqual([100_000, 33_333]);
  });

  it('S41 — a recount takes today’s numbers: level 3 changed to 7% before the backdated approval → 150.00 + 630.00 + 300.00 = 1,080.00', async () => {
    const month = nextMonth();
    const five = await pctAction();
    const three = await amtAction();
    const levels = (third: number): ViolationLevelInput[] => [
      { level: 1, actionId: ACTION_ID.NOTICE },
      { level: 2, actionId: ACTION_ID.DEDUCT_DAYS, days: 0.5 },
      pct(five.id, third, 3),
      { level: 4, actionId: three.id, amount: 30_000 },
    ];
    const late = await violation(levels(5));
    const omar = await employee();
    await approved(omar, late.id, day(month, 19));
    await approved(omar, late.id, day(month, 20));
    await approved(omar, late.id, day(month, 21));
    await setLevels(late.id, levels(7)).expect(200);
    await approved(omar, late.id, day(month, 18));
    expect(await entries('hr.penalty.recount')).toHaveLength(3);
    expect(lineOf(await createRun(month), omar)).toMatchObject({ penaltyAmount: 15_000 + 63_000 + 30_000, net: 900_000 - 108_000 });
  });

  it('S42 — a recount into an approved month is refused: recording a late dated 27 Oct when October is approved; a 5 Nov one is level 3 (5%)', async () => {
    const oct = nextMonth();
    const nov = nextMonth();
    const five = await pctAction();
    const late = await violation([
      { level: 1, actionId: ACTION_ID.NOTICE },
      { level: 2, actionId: ACTION_ID.DEDUCT_DAYS, days: 0.5 },
      pct(five.id, 5, 3),
    ]);
    const omar = await employee();
    await approved(omar, late.id, day(oct, 28));
    await approved(omar, late.id, day(nov, 3));
    await approveRun((await createRun(oct)).id);
    const refused = await recordReq(omar, late.id, day(oct, 27)).expect(409);
    expect([ErrorCode.PAYROLL_APPROVED, ErrorCode.PENALTY_RECOUNT_MONTH_LOCKED]).toContain(refused.body.error);
    expect(await approved(omar, late.id, day(nov, 5))).toMatchObject({ level: 3, percent: 5 });
  });

  it('S44 — dates are the violation’s calendar date: the last day of a month in that month’s run, the 1st of the next never', async () => {
    const jan = nextMonth();
    const feb = nextMonth();
    const pctA = await pctAction();
    const v = await violation([pct(pctA.id, 10)]);
    const nadia = await employee();
    const last = new Date(Date.UTC(Number(jan.slice(0, 4)), Number(jan.slice(5)), 0)).getUTCDate();
    await approved(nadia, v.id, day(jan, last));
    await approved(nadia, v.id, day(feb, 1));
    expect((await payslip(await approveRun((await createRun(jan)).id), nadia)).penalties.map((p) => p.date)).toEqual([day(jan, last)]);
  });

  it('S46 — the month’s payroll is approved: recording and cancelling a penalty dated in it are refused, and leave no History', async () => {
    const month = nextMonth();
    const fine = await amtAction();
    const v = await violation([{ level: 1, actionId: fine.id, amount: 30_000 }]);
    const nadia = await employee();
    const p = await approved(nadia, v.id, day(month, 12));
    await approveRun((await createRun(month)).id);
    mark = (await db.auditEntry.aggregate({ _max: { seq: true } }))._max.seq ?? BigInt(0);
    expect((await recordReq(nadia, v.id, day(month, 29)).expect(409)).body.error).toBe(ErrorCode.PAYROLL_APPROVED);
    expect((await http(app).post(`/hr/penalties/${p.id}/cancel`).send({ reason: 'Late correction' }).expect(409)).body.error).toBe(
      ErrorCode.PAYROLL_APPROVED,
    );
    expect(await db.auditEntry.count({ where: { seq: { gt: mark }, entityType: 'penalty' } })).toBe(0);
  });

  // ── D. Permissions ────────────────────────────────────────────────────────

  it('S48 — who manages penalty actions: the HR manager adds (audited); the HR officer and the principal are refused', async () => {
    const res = await as(who.mona, () => http(app).post('/hr/penalty-actions').send({ nameEn: unique('Mona add'), nameAr: unique('منى'), effect: 'RECORD_ONLY' }));
    expect(res.status).toBe(201);
    expect(await entries('hr.penalty_action.create', res.body.data.id)).toHaveLength(1);
    for (const id of [who.salma, who.adel]) {
      await as(id, () => http(app).post('/hr/penalty-actions').send({ nameEn: unique('No'), nameAr: unique('لا'), effect: 'RECORD_ONLY' }).expect(403));
      await as(id, () => http(app).patch(`/hr/penalty-actions/${res.body.data.id}`).send({ isActive: false }).expect(403));
      // They see the list (read-only).
      await as(id, () => http(app).get('/hr/penalty-actions').expect(200));
    }
  });

  it('S49 — a stage head sees "Deduct EGP 300" and a % on levels and penalties (catalogue data, owner Q7), never the pay', async () => {
    const month = nextMonth();
    const fine = await amtAction();
    const pctA = await pctAction();
    const nadia = await employee({ stageId: primary });
    // Recorded by Hany (no review needed), approved by HR.
    const byHany = async (violationId: string, date: string) =>
      approve(((await as(who.hany, () => recordReq(nadia, violationId, date).expect(201))).body.data as PenaltyRecord).id);
    const a = await byHany((await violation([{ level: 1, actionId: fine.id, amount: 30_000 }])).id, day(month, 3));
    const b = await byHany((await violation([pct(pctA.id, 10)])).id, day(month, 4));
    expect((await as(who.hany, () => http(app).get(`/hr/penalties/${a.id}`).expect(200))).body.data).toMatchObject({ amount: 30_000 });
    expect((await as(who.hany, () => http(app).get(`/hr/penalties/${b.id}`).expect(200))).body.data).toMatchObject({ percent: 10 });
    const run = await createRun(month);
    const res = await as(who.hany, () => http(app).get(`/hr/payroll-runs/${run.id}`).query({ limit: '500' }));
    // A stage head holds no payroll view: the run isn't theirs to see at all.
    expect([403, 404]).toContain(res.status);
    expect(JSON.stringify((await as(who.hany, () => http(app).get('/hr/penalties').query({ month }).expect(200))).body)).not.toContain('900000');
  });

  it('S50 — the principal approves a % at the HR step; on the run’s line: kinds, no money, no NET_FLOORED (owner Q9)', async () => {
    const month = nextMonth();
    const pctA = await pctAction();
    const fine = await amtAction();
    const nadia = await employee();
    const rec = await record(nadia, (await violation([pct(pctA.id, 10)])).id, day(month, 5));
    await as(who.adel, () => http(app).post(`/hr/penalties/${rec.id}/approve`).send({}).expect(200));
    await approved(nadia, (await violation([{ level: 1, actionId: fine.id, amount: 900_000 }])).id, day(month, 6));
    const run = await createRun(month);
    expect(lineOf(run, nadia).flags).toContain(PayrollFlag.NET_FLOORED);
    const asAdel = (await as(who.adel, () => http(app).get(`/hr/payroll-runs/${run.id}`).query({ limit: '500' }).expect(200))).body.data as PayrollRun;
    const line = lineOf(asAdel, nadia);
    expect(line).toMatchObject({ salaryVisible: false, penaltyDays: 0 });
    expect(line.penaltyAmount).toBeUndefined();
    expect(line.flags).not.toContain(PayrollFlag.NET_FLOORED);
    expect(line.deductingPenalties?.map((p) => [p.effect, p.percent, p.amount])).toEqual([
      ['DEDUCT_PERCENT', 10, null],
      ['DEDUCT_AMOUNT', null, 900_000],
    ]);
  });

  it('S50 (review) — neither the flagged filter nor the flagged count gives a floored line away to a viewer without its pay', async () => {
    const month = nextMonth();
    const fine = await amtAction();
    const nadia = await employee();
    await approved(nadia, (await violation([{ level: 1, actionId: fine.id, amount: 1_000_000 }])).id, day(month, 6));
    const run = await createRun(month);
    // HR (every salary) sees it flagged and counted.
    expect(run.totals.flagged).toBe(1);
    const flaggedForHr = (await http(app).get(`/hr/payroll-runs/${run.id}`).query({ limit: '500', flagged: 'true' }).expect(200)).body.data as PayrollRun;
    expect(flaggedForHr.lines.map((l) => l.employeeId)).toEqual([nadia]);
    // The principal: not counted, not in "flagged", and in "not flagged" like any other line.
    const asAdel = (q: Record<string, string>) =>
      as(who.adel, () => http(app).get(`/hr/payroll-runs/${run.id}`).query({ limit: '500', ...q }).expect(200)).then((r) => r.body.data as PayrollRun);
    expect((await asAdel({})).totals.flagged).toBe(0);
    expect((await asAdel({ flagged: 'true' })).lines.map((l) => l.employeeId)).not.toContain(nadia);
    expect((await asAdel({ flagged: 'false' })).lines.map((l) => l.employeeId)).toContain(nadia);
  });

  it('S51 — the accountant: each label and priced amount on the payslip; the penalty catalogue isn’t theirs', async () => {
    const month = nextMonth();
    const basic = await pctAction('BASIC_SALARY');
    const nadia = await employee({ basicSalary: 1_234_567 });
    await approved(nadia, (await violation([pct(basic.id, 3)])).id, day(month, 2));
    const run = await approveRun((await createRun(month)).id);
    const slip = (await as(who.tarek, () => http(app).get(`/hr/payroll-runs/${run.id}/lines/${lineOf(run, nadia).id}`).expect(200))).body
      .data as Payslip;
    expect(slip.penalties.map((p) => [p.action.effect, p.percent, p.amount])).toEqual([['DEDUCT_PERCENT', 3, 37_037]]);
    await as(who.tarek, () => http(app).get('/hr/penalty-actions').expect(403));
  });

  it('S52 — a direct manager sees his team’s fixed amount; another team’s penalty is not found', async () => {
    const month = nextMonth();
    const fine = await amtAction();
    const v = await violation([{ level: 1, actionId: fine.id, amount: 30_000 }]);
    const nadia = await employee({ managerId: emp.rami });
    const sami = await employee();
    const mine = await approved(nadia, v.id, day(month, 3));
    const other = await approved(sami, v.id, day(month, 3));
    expect((await as(who.rami, () => http(app).get(`/hr/penalties/${mine.id}`).expect(200))).body.data).toMatchObject({ amount: 30_000 });
    await as(who.rami, () => http(app).get(`/hr/penalties/${other.id}`).expect(404));
  });

  it('S53 — the other stage’s head doesn’t see a penalty recorded in the employee’s other stage', async () => {
    const pctA = await pctAction();
    const nadia = await employee({ stageId: primary, otherStageIds: [prep] });
    const rec = (await recordReq(nadia, (await violation([pct(pctA.id, 5)])).id, day(nextMonth(), 3), primary).expect(201)).body.data as PenaltyRecord;
    await as(who.dina, () => http(app).get(`/hr/penalties/${rec.id}`).expect(404));
    await as(who.hany, () => http(app).get(`/hr/penalties/${rec.id}`).expect(200));
  });

  it('S54 — the Activity log without salary access: a penalty’s fixed amount reads in full (catalogue data), a salary edit is hidden', async () => {
    const fine = await amtAction();
    const nadia = await employee();
    const rec = await record(nadia, (await violation([{ level: 1, actionId: fine.id, amount: 30_000 }])).id, day(nextMonth(), 3));
    await http(app).patch(`/hr/employees/${nadia}`).send({ basicSalary: 950_000 }).expect(200);
    const res = await as(who.adel, () => http(app).get(`/audit/records/employee/${nadia}`).query({ limit: 50 }).expect(200));
    const list = res.body.data as { action: string; entityId: string; changes: (AuditChange & { hidden?: boolean })[] }[];
    const recorded = list.find((e) => e.action === 'hr.penalty.record' && e.entityId === rec.id)!;
    expect(recorded.changes.find((c) => c.field === 'fixedAmount')).toMatchObject({ after: 30_000 });
    const salary = list.find((e) => e.action === 'hr.employee.update')!.changes.find((c) => c.field === 'basicSalary')!;
    expect(salary.hidden).toBe(true);
  });

  it('S55 — nobody approves or cancels their own penalty, whatever its effect', async () => {
    const fine = await amtAction();
    const rec = await record(emp.mona, (await violation([{ level: 1, actionId: fine.id, amount: 100_000 }])).id, day(nextMonth(), 3));
    expect((await as(who.mona, () => http(app).post(`/hr/penalties/${rec.id}/approve`).send({}).expect(403))).body.error).toBe(ErrorCode.PENALTY_OWN);
    await as(who.mona, () => http(app).post(`/hr/penalties/${rec.id}/cancel`).send({ reason: 'Mine' }).expect(403));
    await as(who.adel, () => http(app).post(`/hr/penalties/${rec.id}/approve`).send({}).expect(200));
  });

  // ── E. Bad input ──────────────────────────────────────────────────────────

  it('S59 (b–e) — the wrong number for an action: refused; an investigation without days saved; with 0 days saved as none (owner Q11)', async () => {
    const pctA = await pctAction();
    expect((await newViolation([{ level: 1, actionId: pctA.id, days: 1, percent: 10 }]).expect(400)).body.params).toEqual({ problem: 'VALUE_NOT_ALLOWED' });
    expect((await newViolation([{ level: 1, actionId: ACTION_ID.DEDUCT_DAYS, days: 1, amount: 30_000 }]).expect(400)).body.params).toEqual({
      problem: 'VALUE_NOT_ALLOWED',
    });
    expect((await violation([{ level: 1, actionId: ACTION_ID.INVESTIGATION }])).levels[0]).toMatchObject({ days: null });
    expect((await violation([{ level: 1, actionId: ACTION_ID.INVESTIGATION, days: 0 }])).levels[0]).toMatchObject({ days: null });
  });

  it('S60 (g, h) — a 101-character or blank name is refused, and a refusal leaves no History', async () => {
    await http(app).post('/hr/penalty-actions').send({ nameEn: 'x'.repeat(101), nameAr: 'س', effect: 'RECORD_ONLY' }).expect(400);
    await http(app).post('/hr/penalty-actions').send({ nameEn: '   ', nameAr: 'س', effect: 'RECORD_ONLY' }).expect(400);
    expect(await entries('hr.penalty_action.create')).toHaveLength(0);
  });

  it('S60 (Q16) — names are unique with Arabic letter variants and spaces folded: "إنذار  نهائي" after "انذار نهائي" is taken', async () => {
    await actionOk({ nameAr: 'انذار نهائي تجريبي', nameEn: unique('Final warning') });
    const res = await http(app).post('/hr/penalty-actions').send({ nameEn: unique('Other'), nameAr: 'إنذار  نهائي تجريبي', effect: 'RECORD_ONLY' }).expect(409);
    expect(res.body.error).toBe(ErrorCode.PENALTY_ACTION_NAME_TAKEN);
  });

  // ── G. Audit ──────────────────────────────────────────────────────────────

  it('S69 — add, rename, reorder, hide, show: five entries on the action, in the Settings change history’s catalogue scope', async () => {
    const a = await actionOk({ effect: 'DEDUCT_PERCENT', percentBase: 'MONTH_SALARY', sortOrder: 11 });
    const patch = (body: Record<string, unknown>) => http(app).patch(`/hr/penalty-actions/${a.id}`).send(body).expect(200);
    await patch({ nameEn: `${a.nameEn} renamed` });
    await patch({ sortOrder: 3 });
    await patch({ isActive: false });
    await patch({ isActive: true });
    const created = await entries('hr.penalty_action.create', a.id);
    const updated = await entries('hr.penalty_action.update', a.id);
    expect(created).toHaveLength(1);
    expect(changesOf(created[0])[0].after).toMatchObject({ effect: 'DEDUCT_PERCENT', percentBase: 'MONTH_SALARY', sortOrder: 11 });
    expect(updated.map((e) => changesOf(e)[0].after)).toEqual([
      expect.objectContaining({ nameEn: `${a.nameEn} renamed` }),
      expect.objectContaining({ sortOrder: 3 }),
      expect.objectContaining({ isActive: false }),
      expect.objectContaining({ isActive: true }),
    ]);
  });

  it('S70 (as then) — an old violation entry keeps the action’s name after the action is renamed', async () => {
    const pctA = await pctAction();
    const v = await violation([{ level: 1, actionId: ACTION_ID.DEDUCT_DAYS, days: 1 }]);
    await setLevels(v.id, [pct(pctA.id, 10)]).expect(200);
    await http(app).patch(`/hr/penalty-actions/${pctA.id}`).send({ nameEn: `${pctA.nameEn} new` }).expect(200);
    const [entry] = await entries('hr.violation.update', v.id);
    expect((changesOf(entry)[0].after as Violation).levels[0].action.nameEn).toBe(pctA.nameEn);
  });

  it('S71 (recount) + S72 — the recount entries hold names and numbers, never money; the run’s History: recalculated totals, then Draft → Approved', async () => {
    const month = nextMonth();
    const five = await pctAction();
    const three = await amtAction();
    const late = await violation([
      { level: 1, actionId: ACTION_ID.NOTICE },
      { level: 2, actionId: ACTION_ID.DEDUCT_DAYS, days: 0.5 },
      pct(five.id, 5, 3),
      { level: 4, actionId: three.id, amount: 30_000 },
    ]);
    const omar = await employee();
    await approved(omar, late.id, day(month, 19));
    await approved(omar, late.id, day(month, 20));
    await approved(omar, late.id, day(month, 21));
    const draft = await createRun(month);
    await approved(omar, late.id, day(month, 18));
    const recounts = await entries('hr.penalty.recount');
    expect(recounts).toHaveLength(3);
    for (const e of recounts) {
      const fields = changesOf(e).map((c) => c.field);
      expect(fields).toEqual(expect.arrayContaining(['penaltyDate', 'level', 'recountedAfter']));
      expect(fields).not.toContain('amount');
      expect(JSON.stringify(e.changes)).not.toMatch(/45000|15000|90000/);
    }
    await recalculate(draft.id);
    await approveRun(draft.id);
    const [recalc] = await entries('hr.payroll.recalculate', draft.id);
    const totals = changesOf(recalc).find((c) => c.field === 'totals')!;
    expect((totals.after as { penaltyAmount: number }).penaltyAmount - (totals.before as { penaltyAmount: number }).penaltyAmount).toBe(30_000);
    expect(await entries('hr.payroll.approve', draft.id)).toHaveLength(1);
  });
});
