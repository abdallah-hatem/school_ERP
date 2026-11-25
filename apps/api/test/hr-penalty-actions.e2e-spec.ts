import { INestApplication } from '@nestjs/common';
import {
  AUDIT_SALARY_FIELDS,
  BuiltInRole,
  type AuthUser,
  ErrorCode,
  type AuditChange,
  type CreatePenaltyActionRequest,
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
 * Penalty actions (spec 2026-11-25-penalty-actions, owner approved 2026-11-26): the list's API, the
 * catalogue levels that use it, the snapshot a penalty keeps, and payroll's pricing of each effect.
 * One test per edge case the API owns (named after it) and the spec's timeline walks A–F. "Today"
 * can't move in a test: each walk runs its steps in order on past dates in a month of its own.
 */

/** Months this suite puts payroll runs in (one run per month, §6): 2013, one per walk. */
let monthSeq = 0;
const nextMonth = () => `2013-${String(++monthSeq).padStart(2, '0')}`;
const day = (month: string, d: number) => `${month}-${String(d).padStart(2, '0')}`;

describe('Penalty actions (e2e)', () => {
  let app: INestApplication;
  let user: AuthUser;
  const extraUsers: string[] = [];
  let db: DatabaseService;
  let stageId: string;
  let departmentId: string;
  let jobTitleId: string;
  let groupId: string;
  let mark = BigInt(0);

  // ── helpers ───────────────────────────────────────────────────────────────

  const createAction = (body: Partial<CreatePenaltyActionRequest> & Record<string, unknown>) =>
    http(app)
      .post('/hr/penalty-actions')
      .send({ nameEn: unique('Action'), nameAr: unique('إجراء'), effect: 'RECORD_ONLY', ...body });
  const actionOk = async (body: Partial<CreatePenaltyActionRequest> & Record<string, unknown>) =>
    (await createAction(body).expect(201)).body.data as PenaltyActionItem;
  const percentAction = (percentBase: 'MONTH_SALARY' | 'BASIC_SALARY' = 'MONTH_SALARY', names = {}) =>
    actionOk({ effect: 'DEDUCT_PERCENT', percentBase, ...names });
  const amountAction = () => actionOk({ effect: 'DEDUCT_AMOUNT' });
  const patchAction = (id: string, body: Record<string, unknown>) => http(app).patch(`/hr/penalty-actions/${id}`).send(body);

  const newViolation = (levels: ViolationLevelInput[]) =>
    http(app)
      .post(`/hr/penalty-groups/${groupId}/violations`)
      .send({ nameEn: unique('Violation'), nameAr: unique('مخالفة'), oncePerDay: false, levels });
  const violation = async (levels: ViolationLevelInput[]) => (await newViolation(levels).expect(201)).body.data as Violation;
  const setLevels = (id: string, levels: ViolationLevelInput[], extra: Record<string, unknown> = {}) =>
    http(app).patch(`/hr/violations/${id}`).send({ levels, ...extra });

  const employee = async (basicSalary = 900_000, workSystem = 'FULL_TIME') =>
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
          stageId,
          departmentId,
          jobTitleId,
          workSystem,
          basicSalary,
        })
        .expect(201)
    ).body.data.id as string;

  const record = async (employeeId: string, violationId: string, date: string) =>
    (await http(app).post('/hr/penalties').send({ employeeId, violationId, date }).expect(201)).body.data as PenaltyRecord;
  const getRecord = async (id: string) => (await http(app).get(`/hr/penalties/${id}`).expect(200)).body.data as PenaltyRecord;
  /** Approves, confirming whatever recount the record shows (the screen's list). */
  const approve = async (id: string) => {
    const shown = await getRecord(id);
    const acknowledgedRecount = shown.recount.map((c) => ({
      id: c.id,
      level: c.after.level,
      actionId: c.after.action.id,
      days: c.after.days,
      percent: c.after.percent,
      amount: c.after.amount,
    }));
    return (
      await http(app)
        .post(`/hr/penalties/${id}/approve`)
        .send(acknowledgedRecount.length ? { acknowledgedRecount } : {})
        .expect(200)
    ).body.data as PenaltyRecord;
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

  const entries = (action: string) =>
    db.auditEntry.findMany({ where: { seq: { gt: mark }, action }, orderBy: { seq: 'asc' } });
  const changesOf = (e: { changes: unknown }) => e.changes as AuditChange[];

  const pct = (actionId: string, percent: number | null, level = 1): ViolationLevelInput => ({ level, actionId, percent });

  beforeAll(async () => {
    ({ app, user } = await createAppAsTestUser());
    db = app.get(DatabaseService);
    stageId = (await db.stage.create({ data: { nameEn: unique('Primary'), nameAr: unique('ابتدائي') } })).id;
    const mk = async (path: string) =>
      (await http(app).post(path).send({ nameEn: unique('x'), nameAr: unique('س') }).expect(201)).body.data.id as string;
    departmentId = await mk('/hr/departments');
    jobTitleId = await mk('/hr/job-titles');
    groupId = (await http(app).post('/hr/penalty-groups').send({ nameEn: unique('Group'), nameAr: unique('مجموعة') }).expect(201)).body
      .data.id as string;
  });

  beforeEach(async () => {
    mark = (await db.auditEntry.aggregate({ _max: { seq: true } }))._max.seq ?? BigInt(0);
  });

  afterAll(async () => {
    const months = Array.from({ length: monthSeq }, (_, i) => `2013-${String(i + 1).padStart(2, '0')}`);
    const runIds = (await db.payrollRun.findMany({ where: { month: { in: months } }, select: { id: true } })).map((r) => r.id);
    await db.accountingPayrollRun.deleteMany({ where: { OR: [{ hrRunId: { in: runIds } }, { month: { in: months } }] } });
    await db.payrollRun.deleteMany({ where: { month: { in: months } } });
    await db.penaltyRecord.deleteMany({});
    await db.violationLevel.deleteMany({});
    await db.violation.deleteMany({});
    await db.penaltyGroup.deleteMany({});
    // The school's own actions this suite added; the seeded ten stay (the migration's rows).
    await db.penaltyAction.deleteMany({ where: { code: null } });
    await db.penaltyAction.updateMany({ where: { code: { not: null } }, data: { isActive: true } });
    await db.notification.deleteMany({ where: { recipientKind: 'user', recipientId: { in: extraUsers } } });
    await db.user.deleteMany({ where: { id: { in: extraUsers } } });
    await deleteEmployees(db);
    await db.department.deleteMany({});
    await db.jobTitle.deleteMany({});
    await db.stage.deleteMany({});
    await app.close();
  });

  // ── the list ──────────────────────────────────────────────────────────────

  it('S64 — the migration seeded today’s ten, with today’s names, effects and order', async () => {
    const list = (await http(app).get('/hr/penalty-actions').expect(200)).body.data as PenaltyActionItem[];
    const seeded = list.filter((a) => a.code !== null);
    expect(seeded.map((a) => [a.code, a.nameEn, a.effect])).toEqual([
      ['NOTICE', 'Notice', 'RECORD_ONLY'],
      ['WARNING', 'Warning', 'RECORD_ONLY'],
      ['DEDUCT_DAYS', 'Deduct days', 'DEDUCT_DAYS'],
      ['INVESTIGATION', 'Referral to investigation', 'INVESTIGATION'],
      ['RAISE_HALF_LOSS', 'Loss of half the annual raise', 'RECORD_ONLY'],
      ['RAISE_LOSS', 'Loss of the annual raise', 'RECORD_ONLY'],
      ['RAISE_DEFER_3M', 'Annual raise deferred 3 months', 'RECORD_ONLY'],
      ['PAY_CUT', 'Pay cut by one annual raise', 'RECORD_ONLY'],
      ['DEMOTION', 'Demotion', 'RECORD_ONLY'],
      ['DISMISSAL', 'Dismissal', 'RECORD_ONLY'],
    ]);
    expect(seeded.map((a) => a.id)).toEqual(Object.values(ACTION_ID));
  });

  it('a page: searched and paged by the API, hidden ones only with includeHidden, each with how many levels use it', async () => {
    const a = await percentAction('MONTH_SALARY', { nameEn: unique('Paged action'), nameAr: unique('إجراء مصفح') });
    await violation([pct(a.id, 10), { level: 2, actionId: a.id, percent: 20 }]);
    const page = await http(app).get('/hr/penalty-actions').query({ search: a.nameEn, page: '1', limit: '5' }).expect(200);
    expect(page.body.meta).toMatchObject({ total: 1, page: 1, limit: 5 });
    expect(page.body.data[0]).toMatchObject({ id: a.id, levelsUsing: 2, violationsUsing: 1, percentBase: 'MONTH_SALARY' });
    await patchAction(a.id, { isActive: false }).expect(200);
    expect((await http(app).get('/hr/penalty-actions').query({ search: a.nameEn }).expect(200)).body.data).toEqual([]);
    expect((await http(app).get('/hr/penalty-actions').query({ search: a.nameEn, includeHidden: 'true' }).expect(200)).body.data).toHaveLength(1);
  });

  it('every write is audited: hr.penalty_action.create / .update on the action, names as its label; Settings history lists them', async () => {
    const a = await actionOk({ effect: 'DEDUCT_AMOUNT' });
    await patchAction(a.id, { nameEn: `${a.nameEn} renamed`, isActive: false }).expect(200);
    const [created] = await entries('hr.penalty_action.create');
    expect(created).toMatchObject({ module: 'hr', entityType: 'penalty_action', entityId: a.id, entityLabel: a.nameEn, entityLabelAr: a.nameAr });
    const [updated] = await entries('hr.penalty_action.update');
    const change = changesOf(updated)[0];
    expect(change.field).toBe('hr.penaltyActions');
    expect(change.before).toMatchObject({ nameEn: a.nameEn, isActive: true, effect: 'DEDUCT_AMOUNT' });
    expect(change.after).toMatchObject({ nameEn: `${a.nameEn} renamed`, isActive: false });
  });

  it('S60 (a, b) + edge case 6: a % base sent for an action that isn’t Deduct % → 400; Deduct % without a base → 400', async () => {
    await createAction({ effect: 'DEDUCT_AMOUNT', percentBase: 'MONTH_SALARY' }).expect(400);
    await createAction({ effect: 'DEDUCT_PERCENT' }).expect(400);
    await createAction({ effect: 'DEDUCT_PERCENT', percentBase: null }).expect(400);
    await createAction({ effect: 'DEDUCT_PERCENT', percentBase: 'BASIC_SALARY' }).expect(201);
  });

  it('S60 (c, d) + edge case 7: a PATCH that tries to change an action’s effect or base → 400 PENALTY_ACTION_EFFECT_LOCKED', async () => {
    const a = await percentAction();
    expect((await patchAction(a.id, { effect: 'DEDUCT_AMOUNT' }).expect(400)).body.error).toBe(ErrorCode.PENALTY_ACTION_EFFECT_LOCKED);
    expect((await patchAction(a.id, { percentBase: 'BASIC_SALARY' }).expect(400)).body.error).toBe(ErrorCode.PENALTY_ACTION_EFFECT_LOCKED);
    expect((await db.penaltyAction.findUniqueOrThrow({ where: { id: a.id }, select: { effect: true, percentBase: true } }))).toEqual({
      effect: 'DEDUCT_PERCENT',
      percentBase: 'MONTH_SALARY',
    });
  });

  it('S60 (e, f) + edge case 8: two actions with the same English (or Arabic) name, any case, hidden ones included → 409 PENALTY_ACTION_NAME_TAKEN', async () => {
    const a = await actionOk({ nameEn: unique('Written warning') });
    await patchAction(a.id, { isActive: false }).expect(200);
    const sameEn = await createAction({ nameEn: a.nameEn.toUpperCase() }).expect(409);
    expect(sameEn.body.error).toBe(ErrorCode.PENALTY_ACTION_NAME_TAKEN);
    expect((await createAction({ nameAr: a.nameAr }).expect(409)).body.error).toBe(ErrorCode.PENALTY_ACTION_NAME_TAKEN);
    // A rename onto another action's name too; nothing was written.
    const b = await actionOk({});
    expect((await patchAction(b.id, { nameEn: a.nameEn.toLowerCase() }).expect(409)).body.error).toBe(ErrorCode.PENALTY_ACTION_NAME_TAKEN);
    expect(await db.penaltyAction.count({ where: { nameEn: { equals: a.nameEn.toUpperCase() } } })).toBe(0);
  });

  it('S60 (i) + edge case 29: two people adding an action with the same name at once → the unique index lets one win; the other gets PENALTY_ACTION_NAME_TAKEN', async () => {
    const names = { nameEn: unique('Race'), nameAr: unique('سباق') };
    const [x, y] = await Promise.all([createAction(names), createAction(names)]);
    expect([x.status, y.status].sort()).toEqual([201, 409]);
    expect([x, y].find((r) => r.status === 409)!.body.error).toBe(ErrorCode.PENALTY_ACTION_NAME_TAKEN);
    expect(await db.penaltyAction.count({ where: { nameEn: names.nameEn } })).toBe(1);
  });

  it('S61 (no delete) + edge case 11: deleting an action → no endpoint; the foreign keys are RESTRICT', async () => {
    const a = await amountAction();
    await violation([{ level: 1, actionId: a.id, amount: 20_000 }]);
    await http(app).delete(`/hr/penalty-actions/${a.id}`).expect(404);
    await expect(db.penaltyAction.delete({ where: { id: a.id } })).rejects.toThrow();
  });

  // ── catalogue levels ──────────────────────────────────────────────────────

  it('S59 (a) + edge case 1: a Record-only level with a number sent by the API → 400 INVALID_LEVELS (VALUE_NOT_ALLOWED)', async () => {
    const res = await newViolation([{ level: 1, actionId: ACTION_ID.WARNING, days: 1 }]).expect(400);
    expect(res.body).toMatchObject({ error: ErrorCode.INVALID_LEVELS, params: { problem: 'VALUE_NOT_ALLOWED' } });
  });

  it('S58 + edge case 2: Deduct days with 0, a negative, 0.3 or 31 days → DAYS_INVALID; missing → DAYS_REQUIRED', async () => {
    expect((await newViolation([{ level: 1, actionId: ACTION_ID.DEDUCT_DAYS, days: 0 }]).expect(400)).body.params).toEqual({ problem: 'DAYS_INVALID' });
    // -1, 0.3 and 31 aren't day counts at all (quarter steps 0–30, §7): refused by the DTO.
    for (const days of [-1, 0.3, 31]) await newViolation([{ level: 1, actionId: ACTION_ID.DEDUCT_DAYS, days }]).expect(400);
    expect((await newViolation([{ level: 1, actionId: ACTION_ID.DEDUCT_DAYS }]).expect(400)).body.params).toEqual({ problem: 'DAYS_REQUIRED' });
  });

  it('S56 + edge case 3: Deduct % with 0, -5, 100.01 or 12.345 → PERCENT_INVALID; 100 → allowed; missing → PERCENT_REQUIRED', async () => {
    const a = await percentAction();
    for (const percent of [0, -5, 100.01, 12.345]) {
      expect((await newViolation([pct(a.id, percent)]).expect(400)).body.params).toEqual({ problem: 'PERCENT_INVALID' });
    }
    expect((await newViolation([pct(a.id, null)]).expect(400)).body.params).toEqual({ problem: 'PERCENT_REQUIRED' });
    const ok = await violation([pct(a.id, 100)]);
    expect(ok.levels[0]).toMatchObject({ percent: 100, days: null, amount: null, action: { id: a.id, effect: 'DEDUCT_PERCENT', percentBase: 'MONTH_SALARY', isActive: true } });
  });

  it('S57 + edge case 4: Deduct amount with 0, a negative, a fraction of a piastre, or above EGP 1,000,000 → AMOUNT_INVALID; missing → AMOUNT_REQUIRED', async () => {
    const a = await amountAction();
    for (const amount of [0, -100, 10.5, 100_000_001]) {
      expect((await newViolation([{ level: 1, actionId: a.id, amount }]).expect(400)).body.params).toEqual({ problem: 'AMOUNT_INVALID' });
    }
    expect((await newViolation([{ level: 1, actionId: a.id }]).expect(400)).body.params).toEqual({ problem: 'AMOUNT_REQUIRED' });
    expect((await violation([{ level: 1, actionId: a.id, amount: 100_000_000 }])).levels[0].amount).toBe(100_000_000);
  });

  it('S61 (missing) + edge case 10: a level naming an action id that doesn’t exist → 400 PENALTY_ACTION_NOT_FOUND', async () => {
    const res = await newViolation([{ level: 1, actionId: '00000000-0000-4000-8000-000000000000' }]).expect(400);
    expect(res.body.error).toBe(ErrorCode.PENALTY_ACTION_NOT_FOUND);
  });

  it('S70 — hr.violation.update keeps each level’s action by name and its number, before → after', async () => {
    const a = await percentAction();
    const v = await violation([{ level: 1, actionId: ACTION_ID.DEDUCT_DAYS, days: 1 }]);
    await setLevels(v.id, [pct(a.id, 10)]).expect(200);
    const [entry] = await entries('hr.violation.update');
    const change = changesOf(entry)[0];
    expect((change.before as Violation).levels[0]).toMatchObject({ action: { nameEn: 'Deduct days', nameAr: 'خصم أيام' }, days: 1 });
    expect((change.after as Violation).levels[0]).toMatchObject({ action: { nameEn: a.nameEn, nameAr: a.nameAr, effect: 'DEDUCT_PERCENT' }, percent: 10 });
  });

  // ── penalties ─────────────────────────────────────────────────────────────

  it('edge case 12: an action renamed while a penalty waits → the waiting penalty shows the new name; fixed at approval', async () => {
    const a = await percentAction();
    const v = await violation([pct(a.id, 10)]);
    const waiting = await record(await employee(), v.id, '2013-01-05');
    await patchAction(a.id, { nameEn: `${a.nameEn} (new)` }).expect(200);
    expect((await getRecord(waiting.id)).action.nameEn).toBe(`${a.nameEn} (new)`);
    const fixed = await approve(waiting.id);
    expect(fixed.action).toEqual({ id: a.id, nameEn: `${a.nameEn} (new)`, nameAr: a.nameAr, effect: 'DEDUCT_PERCENT', percentBase: 'MONTH_SALARY' });
    expect(await db.penaltyRecord.findUniqueOrThrow({ where: { id: waiting.id }, select: { actionNameEn: true } })).toEqual({ actionNameEn: `${a.nameEn} (new)` });
  });

  it('S36 (days → % while waiting) + edge case 15: a level’s action switched from Deduct days to Deduct % while a penalty waits → it shows the % now and gets it at approval', async () => {
    const a = await percentAction();
    const v = await violation([{ level: 1, actionId: ACTION_ID.DEDUCT_DAYS, days: 1 }]);
    const waiting = await record(await employee(), v.id, '2013-01-06');
    expect(waiting).toMatchObject({ action: { id: ACTION_ID.DEDUCT_DAYS }, days: 1, percent: null });
    await setLevels(v.id, [pct(a.id, 10)]).expect(200);
    expect(await getRecord(waiting.id)).toMatchObject({ action: { id: a.id, effect: 'DEDUCT_PERCENT' }, days: null, percent: 10 });
    expect(await approve(waiting.id)).toMatchObject({ status: 'APPROVED', action: { id: a.id }, percent: 10 });
  });

  it('edge case 19: a fixed amount shows on the penalty (catalogue data) and is never a salary field in its History', async () => {
    const a = await amountAction();
    const v = await violation([{ level: 1, actionId: a.id, amount: 30_000 }]);
    const rec = await record(await employee(), v.id, '2013-01-07');
    expect(rec).toMatchObject({ amount: 30_000, action: { effect: 'DEDUCT_AMOUNT' } });
    const [entry] = await entries('hr.penalty.record');
    expect(changesOf(entry).find((c) => c.field === 'fixedAmount')).toMatchObject({ after: 30_000 });
    expect((AUDIT_SALARY_FIELDS as readonly string[]).includes('fixedAmount')).toBe(false);
  });

  it('edge case 23: a recount into a level whose action is now hidden takes that action (levels keep hidden actions)', async () => {
    const v = await violation([
      { level: 1, actionId: ACTION_ID.NOTICE },
      { level: 2, actionId: ACTION_ID.INVESTIGATION, days: 2 },
    ]);
    const emp = await employee();
    const later = await approved(emp, v.id, '2013-01-20');
    await patchAction(ACTION_ID.INVESTIGATION, { isActive: false }).expect(200);
    try {
      await approved(emp, v.id, '2013-01-18');
      expect(await getRecord(later.id)).toMatchObject({ level: 2, action: { id: ACTION_ID.INVESTIGATION }, days: 2 });
    } finally {
      await patchAction(ACTION_ID.INVESTIGATION, { isActive: true }).expect(200);
    }
  });

  it('edge case 24: an employee deactivated before the run’s calculation → off the run; their % penalty never priced', async () => {
    const month = nextMonth();
    const a = await percentAction();
    const emp = await employee();
    await approved(emp, (await violation([pct(a.id, 10)])).id, day(month, 3));
    await http(app).post(`/hr/employees/${emp}/deactivate`).expect(200);
    const run = await createRun(month);
    expect(run.lines.find((l) => l.employeeId === emp)).toBeUndefined();
  });

  // ── timeline walks ────────────────────────────────────────────────────────

  it('S33 + walk A + edge cases 13, 14: approved, then the action renamed and its % changed — the penalty, its payslip and the approved run keep 10% and the old name', async () => {
    const month = nextMonth();
    // 1 Nov: Mona adds "Salary deduction %" (Deduct a %, of the salary for the month).
    const a = await percentAction('MONTH_SALARY', { nameEn: unique('Salary deduction %'), nameAr: unique('خصم نسبة من الراتب') });
    // 2 Nov: "Absence without notice", level 2 → that action, 10%.
    const v = await violation([
      { level: 1, actionId: ACTION_ID.DEDUCT_DAYS, days: 1 },
      { level: 2, actionId: ACTION_ID.DEDUCT_DAYS, days: 1 },
    ]);
    await setLevels(v.id, [{ level: 1, actionId: ACTION_ID.DEDUCT_DAYS, days: 1 }, pct(a.id, 10, 2)]).expect(200);
    // 10 Nov: Nadia's 2nd absence approved → snapshot "Salary deduction %", 10%.
    const nadia = await employee(900_000);
    await approved(nadia, v.id, day(month, 3));
    const second = await approved(nadia, v.id, day(month, 10));
    expect(second).toMatchObject({ level: 2, action: { id: a.id, nameEn: a.nameEn, effect: 'DEDUCT_PERCENT', percentBase: 'MONTH_SALARY' }, percent: 10 });
    // 20 Nov: renamed, level 2 → 5%.
    await patchAction(a.id, { nameEn: `${a.nameEn} → Pay deduction %` }).expect(200);
    await setLevels(v.id, [{ level: 1, actionId: ACTION_ID.DEDUCT_DAYS, days: 1 }, pct(a.id, 5, 2)]).expect(200);
    // 30 Nov: November approved — 1 day (300.00) + 10% of 9,000 (900.00).
    let run = await createRun(month);
    run = await approveRun(run.id);
    const line = lineOf(run, nadia);
    expect(line).toMatchObject({ penaltyDays: 1, penaltyDaysAmount: 30_000, penaltyAmount: 30_000 + 90_000, net: 900_000 - 120_000 });
    const slip = await payslip(run, nadia);
    expect(slip.penalties.map((p) => [p.action.nameEn, p.percent, p.amount])).toEqual([
      ['Deduct days', null, 30_000],
      [a.nameEn, 10, 90_000],
    ]);
    // Edge case 13: the approved penalty keeps the old name.
    expect((await getRecord(second.id)).action.nameEn).toBe(a.nameEn);
    // 5 Dec (edge case 14): the level goes to 7% — November's run and payslip never change.
    await setLevels(v.id, [{ level: 1, actionId: ACTION_ID.DEDUCT_DAYS, days: 1 }, pct(a.id, 7, 2)]).expect(200);
    expect(lineOf(await getRun(run.id), nadia).penaltyAmount).toBe(120_000);
    expect((await payslip(run, nadia)).penalties[1]).toMatchObject({ percent: 10, amount: 90_000 });
    expect((await getRecord(second.id)).percent).toBe(10);
  });

  it('S37 + S61 (hidden) + walk B + edge case 9: an action hidden while a level still uses it — the level keeps it, penalties still get it, other levels can’t pick it, shown again it is pickable', async () => {
    const month = nextMonth();
    const fighting = await violation([
      { level: 1, actionId: ACTION_ID.WARNING },
      { level: 2, actionId: ACTION_ID.INVESTIGATION, days: 2 },
    ]);
    const leaving = await violation([{ level: 1, actionId: ACTION_ID.NOTICE }]);
    // 1 Dec: hidden; the list says how many levels use it.
    const usage = (await http(app).get('/hr/penalty-actions').query({ search: 'Referral to investigation', includeHidden: 'true' }).expect(200))
      .body.data[0] as PenaltyActionItem;
    expect(usage.levelsUsing).toBeGreaterThanOrEqual(1);
    await patchAction(ACTION_ID.INVESTIGATION, { isActive: false }).expect(200);
    try {
      expect((await entries('hr.penalty_action.update')).length).toBe(1);
      // 3 Dec: Sami's 2nd "Fighting" → the hidden investigation with 2 days; December deducts 2 days.
      const sami = await employee(900_000);
      await approved(sami, fighting.id, day(month, 2));
      const sami2 = await approved(sami, fighting.id, day(month, 3));
      expect(sami2).toMatchObject({ level: 2, action: { id: ACTION_ID.INVESTIGATION }, days: 2 });
      // 4 Dec: renaming "Fighting" with its levels unchanged saves; picking the hidden action elsewhere → 400.
      await setLevels(fighting.id, [{ level: 1, actionId: ACTION_ID.WARNING }, { level: 2, actionId: ACTION_ID.INVESTIGATION, days: 2 }], {
        nameEn: unique('Fighting at school'),
      }).expect(200);
      const refused = await setLevels(leaving.id, [{ level: 1, actionId: ACTION_ID.INVESTIGATION }]).expect(400);
      expect(refused.body.error).toBe(ErrorCode.PENALTY_ACTION_HIDDEN);
      expect((await http(app).get('/hr/penalty-actions').expect(200)).body.data.map((a: PenaltyActionItem) => a.id)).not.toContain(ACTION_ID.INVESTIGATION);
      // 10 Dec: level 2 → Warning; a pending one shows Warning, Sami's approved one keeps the investigation.
      const pending = await record(sami, fighting.id, day(month, 9));
      await setLevels(fighting.id, [{ level: 1, actionId: ACTION_ID.WARNING }, { level: 2, actionId: ACTION_ID.WARNING }]).expect(200);
      expect(await getRecord(pending.id)).toMatchObject({ action: { id: ACTION_ID.WARNING }, days: null });
      expect(await getRecord(sami2.id)).toMatchObject({ action: { id: ACTION_ID.INVESTIGATION }, days: 2 });
      const run = await createRun(month);
      expect(lineOf(run, sami)).toMatchObject({ penaltyDays: 2, penaltyAmount: 60_000 });
    } finally {
      // 11 Dec: shown again → pickable everywhere.
      await patchAction(ACTION_ID.INVESTIGATION, { isActive: true }).expect(200);
    }
    await setLevels(leaving.id, [{ level: 1, actionId: ACTION_ID.INVESTIGATION }]).expect(200);
  });

  it('S31 + S46 (recording) + walk C + edge case 21: a % approved while the month is a draft counts at the next calculation; once approved, recording into it is refused', async () => {
    const month = nextMonth();
    const a = await percentAction();
    const v = await violation([pct(a.id, 10)]);
    const nadia = await employee(900_000);
    // 25 Nov: the draft is calculated with nothing.
    const run = await createRun(month);
    expect(lineOf(run, nadia).penaltyAmount).toBe(0);
    // 28 Nov: a 10% penalty dated 26 Nov approved — the draft doesn't change by itself.
    await approved(nadia, v.id, day(month, 26));
    expect(lineOf(await getRun(run.id), nadia).penaltyAmount).toBe(0);
    // Its next Recalculate deducts EGP 900.00.
    expect(lineOf(await recalculate(run.id), nadia)).toMatchObject({ penaltyAmount: 90_000, penaltyDaysAmount: 0, penaltyDays: 0 });
    // 30 Nov: approved. 2 Dec: recording a 10% dated 29 Nov is refused (the month's payroll is approved).
    await approveRun(run.id);
    const refused = await http(app).post('/hr/penalties').send({ employeeId: nadia, violationId: v.id, date: day(month, 29) });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe(ErrorCode.PAYROLL_APPROVED);
  });

  it('S39 + walk D + edge cases 18, 20: the salary changes before the month’s approval → the % follows the line’s salary at approval; a part-timer’s % of the basic salary', async () => {
    const month = nextMonth();
    const a = await percentAction('MONTH_SALARY');
    const basic = await percentAction('BASIC_SALARY');
    const nadia = await employee(900_000);
    // 10 Nov: 10% (salary for the month) approved — the penalty stores 10%, no money.
    const p = await approved(nadia, (await violation([pct(a.id, 10)])).id, day(month, 10));
    expect(p).toMatchObject({ percent: 10, amount: null });
    // 20 Nov: the draft → EGP 900.00.
    const run = await createRun(month);
    expect(lineOf(run, nadia).penaltyAmount).toBe(90_000);
    // 25 Nov: raised to 10,000. 30 Nov: approving recalculates → EGP 1,000.00.
    await http(app).patch(`/hr/employees/${nadia}`).send({ basicSalary: 1_000_000 }).expect(200);
    const approvedRun = await approveRun(run.id);
    expect(lineOf(approvedRun, nadia)).toMatchObject({ basicSalary: 1_000_000, monthSalary: 1_000_000, penaltyAmount: 100_000 });
    // 5 Dec: cut back to 9,000 — November is frozen.
    await http(app).patch(`/hr/employees/${nadia}`).send({ basicSalary: 900_000 }).expect(200);
    expect(lineOf(await getRun(run.id), nadia).penaltyAmount).toBe(100_000);

    // Part-timer variant: Huda, 3 days (60%), basic 10,000 — 10% of the month = 600.00; of the basic = 1,000.00.
    const month2 = nextMonth();
    const huda = await employee(1_000_000, 'PART_TIME_3');
    await approved(huda, (await violation([pct(a.id, 10)])).id, day(month2, 4));
    await approved(huda, (await violation([pct(basic.id, 10)])).id, day(month2, 5));
    const line = lineOf(await createRun(month2), huda);
    expect(line).toMatchObject({ monthSalary: 600_000, penaltyAmount: 60_000 + 100_000 });
  });

  it('S40 + walk E + edge case 22: a backdated penalty moves levels with different effects; each recount entry shows its action change; 0.5 day + 5% + EGP 300 = EGP 900.00', async () => {
    const month = nextMonth();
    const five = await percentAction();
    const three = await amountAction();
    // "Late to class": Notice, Deduct 0.5 day, Deduct 5% of the salary for the month, Deduct EGP 300.
    const late = await violation([
      { level: 1, actionId: ACTION_ID.NOTICE },
      { level: 2, actionId: ACTION_ID.DEDUCT_DAYS, days: 0.5 },
      { level: 3, actionId: five.id, percent: 5 },
      { level: 4, actionId: three.id, amount: 30_000 },
    ]);
    const omar = await employee(900_000);
    const d19 = await approved(omar, late.id, day(month, 19));
    const d20 = await approved(omar, late.id, day(month, 20));
    const d21 = await approved(omar, late.id, day(month, 21));
    expect([d19.action.effect, d20.action.effect, d21.action.effect]).toEqual(['RECORD_ONLY', 'DEDUCT_DAYS', 'DEDUCT_PERCENT']);
    let run = await createRun(month);
    // Before: 0.5 day 150.00 + 5% 450.00 = 600.00.
    expect(lineOf(run, omar).penaltyAmount).toBe(60_000);
    // 24 Nov: a late dated 18 Nov — the preview names the three moves.
    const d18 = await record(omar, late.id, day(month, 18));
    expect(d18.recount.map((c) => [c.before.action.effect, c.after.action.effect])).toEqual([
      ['RECORD_ONLY', 'DEDUCT_DAYS'],
      ['DEDUCT_DAYS', 'DEDUCT_PERCENT'],
      ['DEDUCT_PERCENT', 'DEDUCT_AMOUNT'],
    ]);
    // 25 Nov: approved with the confirmation — each moved one gets today's action and number.
    await approve(d18.id);
    expect(await getRecord(d21.id)).toMatchObject({ level: 4, action: { id: three.id }, amount: 30_000, percent: null });
    const recounts = await entries('hr.penalty.recount');
    expect(recounts).toHaveLength(3);
    // Edge case 22: "Notice → Deduct 0.5 day" … "5% → Deduct EGP 300": names, effect and number before → after.
    const first = changesOf(recounts[0]);
    expect(first.find((c) => c.field === 'action')).toEqual({ field: 'action', before: { nameEn: 'Notice', nameAr: 'لفت نظر' }, after: { nameEn: 'Deduct days', nameAr: 'خصم أيام' } });
    const last = changesOf(recounts[2]);
    expect(last.find((c) => c.field === 'effect')).toMatchObject({ before: 'DEDUCT_PERCENT', after: 'DEDUCT_AMOUNT' });
    expect(last.find((c) => c.field === 'fixedAmount')).toMatchObject({ before: null, after: 30_000 });
    // November's draft asks to recalculate; recalculated: 150.00 + 450.00 + 300.00 = 900.00.
    run = await recalculate(run.id);
    expect(lineOf(run, omar)).toMatchObject({ penaltyDaysAmount: 15_000, penaltyAmount: 90_000 });
  });

  it('S43, S45 + walk F: the violation’s month decides, whatever day it is approved; a new contract year starts the levels again', async () => {
    const month = nextMonth();
    const next = nextMonth();
    const a = await percentAction();
    const v = await violation([pct(a.id, 10)]);
    const nadia = await employee(900_000);
    // Dated the month's last day, approved "on the 1st": it belongs to its own month.
    const lastDay = new Date(Date.UTC(2013, Number(month.slice(5)), 0)).getUTCDate();
    await approved(nadia, v.id, day(month, lastDay));
    expect(lineOf(await createRun(month), nadia).penaltyAmount).toBe(90_000);
    expect(lineOf(await createRun(next), nadia).penaltyAmount).toBe(0);
    // 31 May → 1 June (contract-year window): the same violation on 1 June starts at level 1.
    const steps = await violation([
      { level: 1, actionId: ACTION_ID.NOTICE },
      { level: 2, actionId: ACTION_ID.WARNING },
      pct(a.id, 5, 3),
    ]);
    await approved(nadia, steps.id, '2012-05-29');
    await approved(nadia, steps.id, '2012-05-30');
    expect(await approved(nadia, steps.id, '2012-05-31')).toMatchObject({ level: 3, percent: 5 });
    expect(await approved(nadia, steps.id, '2012-06-01')).toMatchObject({ level: 1, action: { id: ACTION_ID.NOTICE } });
    // 31 Jan vs 28 Feb (a % takes the same EGP in both) and 00:10 Cairo are the pure rules' and the
    // Cairo date column's: payroll-line.spec.ts (walk F) and the existing date tests.
  });

  // ── the whole flow, as people do it ───────────────────────────────────────

  /** Acts as another user for the length of `fn` (the e2e guard signs every request in as `user`). */
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
    extraUsers.push(id);
    await giveRoles(db, id, roleKeys);
    return id;
  };

  it('S25 + S71 (two steps) — end to end: an HR officer records a % and a fixed-amount penalty → the stage head reviews → HR approves → the draft prices them → approved → the payslip lists each with its own amount, in English and Arabic', async () => {
    const month = nextMonth();
    // A stage with its own head, so recording waits for the stage review (§4 two steps).
    const flowStage = (await db.stage.create({ data: { nameEn: unique('Prep'), nameAr: unique('إعدادي') } })).id;
    const headEmployee = (
      await http(app)
        .post('/hr/employees')
        .send({
          nameEn: unique('Head'), nameAr: unique('رئيس'), gender: 'MALE', dateOfBirth: '1980-01-01', phone: '01000000000',
          hireDate: '2010-09-01', stageId: flowStage, departmentId, jobTitleId, workSystem: 'FULL_TIME', basicSalary: 1_500_000,
        })
        .expect(201)
    ).body.data.id as string;
    const head = await newUser('flow-head', [BuiltInRole.STAGE_HEAD], headEmployee);
    const officer = await newUser('flow-officer', [BuiltInRole.HR_OFFICER]);
    const nadia = (
      await http(app)
        .post('/hr/employees')
        .send({
          nameEn: unique('Nadia'), nameAr: unique('نادية'), gender: 'FEMALE', dateOfBirth: '1990-01-01', phone: '01000000000',
          hireDate: '2012-09-01', stageId: flowStage, departmentId, jobTitleId, workSystem: 'FULL_TIME', basicSalary: 900_000,
        })
        .expect(201)
    ).body.data.id as string;
    const pctAction = await percentAction('MONTH_SALARY', { nameEn: unique('Salary deduction %'), nameAr: unique('خصم نسبة') });
    const fixed = await actionOk({ effect: 'DEDUCT_AMOUNT', nameEn: unique('Fixed deduction'), nameAr: unique('خصم ثابت') });
    const absence = await violation([pct(pctAction.id, 10)]);
    const phone = await violation([{ level: 1, actionId: fixed.id, amount: 20_000 }]);

    const flow = async (violationId: string, date: string) => {
      // Recorded by HR's officer → Pending stage review.
      const recorded = (
        await as(officer, () => http(app).post('/hr/penalties').send({ employeeId: nadia, violationId, date }).expect(201))
      ).body.data as PenaltyRecord;
      expect(recorded.status).toBe('PENDING_REVIEW');
      // The stage head approves their stage's penalty → Waiting for HR.
      const reviewed = (await as(head, () => http(app).post(`/hr/penalties/${recorded.id}/review/approve`).send({}).expect(200)))
        .body.data as PenaltyRecord;
      expect(reviewed.status).toBe('WAITING_HR');
      // HR approves → the snapshot is fixed.
      return approve(recorded.id);
    };
    const p1 = await flow(absence.id, day(month, 4));
    const p2 = await flow(phone.id, day(month, 5));
    expect(p1).toMatchObject({ status: 'APPROVED', action: { id: pctAction.id, nameEn: pctAction.nameEn, nameAr: pctAction.nameAr, effect: 'DEDUCT_PERCENT', percentBase: 'MONTH_SALARY' }, percent: 10, amount: null });
    expect(p2).toMatchObject({ status: 'APPROVED', action: { id: fixed.id, effect: 'DEDUCT_AMOUNT' }, amount: 20_000, percent: null });

    // The draft prices them: 10% of 9,000 = 900.00, plus 200.00 — net 7,900.00.
    const draft = await createRun(month);
    expect(lineOf(draft, nadia)).toMatchObject({ monthSalary: 900_000, penaltyDays: 0, penaltyDaysAmount: 0, penaltyAmount: 110_000, net: 790_000 });
    const run = await approveRun(draft.id);
    expect(run.status).toBe('APPROVED');
    expect(lineOf(run, nadia)).toMatchObject({ penaltyAmount: 110_000, net: 790_000 });

    // The payslip, read in each language: the same snapshot (both names) and the same amounts.
    for (const lang of ['en', 'ar']) {
      const res = await http(app).get(`/hr/payroll-runs/${run.id}/lines/${lineOf(run, nadia).id}`).set('Accept-Language', lang).expect(200);
      const slip = res.body.data as Payslip;
      expect(slip.penalties.map((p) => [p.action.nameEn, p.action.nameAr, p.action.effect, p.percent, p.fixedAmount, p.amount])).toEqual([
        [pctAction.nameEn, pctAction.nameAr, 'DEDUCT_PERCENT', 10, null, 90_000],
        [fixed.nameEn, fixed.nameAr, 'DEDUCT_AMOUNT', null, 20_000, 20_000],
      ]);
      expect(slip.penaltyAmount).toBe(slip.penalties.reduce((n, p) => n + (p.amount ?? 0), 0));
      expect(slip.net).toBe(790_000);
    }

    // The new refusals read in both languages.
    await patchAction(pctAction.id, { isActive: false }).expect(200);
    const other = await violation([{ level: 1, actionId: ACTION_ID.NOTICE }]);
    const en = await setLevels(other.id, [pct(pctAction.id, 5)]).set('Accept-Language', 'en').expect(400);
    const ar = await setLevels(other.id, [pct(pctAction.id, 5)]).set('Accept-Language', 'ar').expect(400);
    expect(en.body.error).toBe(ErrorCode.PENALTY_ACTION_HIDDEN);
    expect(en.body.message).toBe('This action is hidden. Show it in Penalty actions first, or pick another.');
    expect(ar.body.message).toBe('هذا الإجراء مخفي. أظهره من إجراءات الجزاءات أولًا، أو اختر إجراءً آخر.');
  });
});
