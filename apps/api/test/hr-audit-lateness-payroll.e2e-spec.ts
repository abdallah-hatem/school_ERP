import { INestApplication } from '@nestjs/common';
import {
  HrEvent,
  type AuditActor,
  type AuditChange,
  type AuditEntry,
  type AuthUser,
  type CreateEmployeeRequest,
  type PayrollRun,
} from '@school-erp/shared';
import { DatabaseService } from '../src/database/database.service';
import { http, unique } from './helpers';
import { outboxEvents } from './helpers/events';
import { outboxIdle } from './helpers/events';
import { createAppAsTestUser } from './helpers/as-test-user';
import { historyMark } from './helpers/history';
import { deleteEmployees } from './helpers/employees';

/*
 * T29 — lateness and payroll write their audit entries in the same transaction as the
 * change (audit spec D2, D6): one test per action checks the entry's action, record, label, actor
 * and changed fields; a refused change leaves no entry.
 */

/** A fresh past month per test (penalties can't be dated ahead), away from the payroll suite's. */
let monthSeq = 0;
const usedMonths: string[] = [];
const nextMonth = () => {
  const n = monthSeq++;
  const month = `${2003 + Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`;
  usedMonths.push(month);
  return month;
};

describe('HR audit wiring — lateness and payroll (T29, e2e)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let userId: string;
  let user: AuthUser;
  let stageId: string;
  let departmentId: string;
  let jobTitleId: string;
  let mark = BigInt(0);
  const tempUserIds: string[] = [];
  const tempRoleIds: string[] = [];

  /** Runs `fn` signed in as another user (the test user's id swapped for the call). */
  async function asUser<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const own = user.id;
    user.id = id;
    try {
      return await fn();
    } finally {
      user.id = own;
    }
  }

  /** A user holding only these keys, each at its scope (`all` unless given). */
  async function viewerWith(keys: Record<string, string>): Promise<string> {
    const role = await db.role.create({
      data: {
        key: unique('custom_viewer'),
        nameEn: 'Viewer',
        nameAr: 'مشاهد',
        permissions: {
          create: Object.entries(keys).map(([permissionKey, scope]) => ({ permissionKey, scope: scope as 'all' })),
        },
      },
      select: { id: true },
    });
    tempRoleIds.push(role.id);
    const viewer = await db.user.create({
      data: { email: `${unique('viewer')}@school.test`.toLowerCase(), name: 'Viewer', passwordHash: 'x' },
      select: { id: true },
    });
    tempUserIds.push(viewer.id);
    await db.userRoleAssignment.create({ data: { userId: viewer.id, roleId: role.id } });
    return viewer.id;
  }

  const employee = async (overrides: Partial<CreateEmployeeRequest> = {}) =>
    (
      await http(app)
        .post('/hr/employees')
        .send({
          nameEn: unique('Mona'),
          nameAr: unique('منى'),
          gender: 'FEMALE',
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
        .expect(201)
    ).body.data as { id: string; nameEn: string; nameAr: string };

  /** The entries written since the test began, oldest first, optionally one action's. */
  const entries = (action?: string) =>
    db.auditEntry.findMany({
      where: { seq: { gt: mark }, ...(action ? { action } : {}) },
      orderBy: { seq: 'asc' },
    });
  const changesOf = (e: { changes: unknown }) => e.changes as AuditChange[];
  /**
   * Approves a run, then waits for accounting's listener (§10) to work out the month: it runs in
   * the nudge after the approval returns and writes its own `accounting.payroll.record` entry,
   * which would otherwise land inside a later "no entry" window.
   */
  const approve = async (run: PayrollRun) => {
    const res = await http(app).post(`/hr/payroll-runs/${run.id}/approve`).expect(200);
    await outboxIdle(app);
    return res.body.data as PayrollRun;
  };
  const field = (e: { changes: unknown }, name: string) => changesOf(e).find((c) => c.field === name);

  beforeAll(async () => {
    ({ app, user } = await createAppAsTestUser());
    userId = user.id;
    db = app.get(DatabaseService);
    stageId = (await db.stage.create({ data: { nameEn: 'Primary', nameAr: 'ابتدائي' } })).id;
    const mk = async (path: string) =>
      (await http(app).post(path).send({ nameEn: unique('x'), nameAr: unique('س') }).expect(201)).body.data
        .id as string;
    departmentId = await mk('/hr/departments');
    jobTitleId = await mk('/hr/job-titles');
  });

  beforeEach(async () => {
    mark = await historyMark(db);
  });

  afterAll(async () => {
    await db.userRoleAssignment.deleteMany({ where: { userId: { in: tempUserIds } } });
    await db.user.deleteMany({ where: { id: { in: tempUserIds } } });
    await db.rolePermission.deleteMany({ where: { roleId: { in: tempRoleIds } } });
    await db.role.deleteMany({ where: { id: { in: tempRoleIds } } });
    await db.accountingPayrollRun.deleteMany({ where: { month: { in: usedMonths } } });
    await db.payrollRun.deleteMany({ where: { month: { in: usedMonths } } });
    await db.latenessEntry.deleteMany({});
    await db.penaltyRecord.deleteMany({});
    await db.violationLevel.deleteMany({});
    await db.violation.deleteMany({});
    await db.penaltyGroup.deleteMany({});
    await deleteEmployees(db);
    await db.department.deleteMany({});
    await db.jobTitle.deleteMany({});
    await db.stage.deleteMany({});
    await app.close();
  });

  // ── lateness ──────────────────────────────────────────────────────────────

  it('hr.lateness.save — one entry for the month, one line per employee whose minutes changed (spec 7)', async () => {
    const month = nextMonth();
    const a = await employee();
    const b = await employee();
    const c = await employee();
    await http(app)
      .put(`/hr/lateness/${month}`)
      .send({ entries: [{ employeeId: a.id, minutes: 30 }, { employeeId: b.id, minutes: 60 }] })
      .expect(200);
    mark = await historyMark(db);

    // a unchanged, b 60 → 0, c new 90.
    await http(app)
      .put(`/hr/lateness/${month}`)
      .send({
        entries: [
          { employeeId: a.id, minutes: 30 },
          { employeeId: b.id, minutes: 0 },
          { employeeId: c.id, minutes: 90 },
        ],
      })
      .expect(200);

    const saved = await entries('hr.lateness.save');
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ entityType: 'lateness_month', entityId: month, entityLabel: month, actorId: userId });
    expect(changesOf(saved[0])).toEqual([
      { field: 'minutes', before: 60, after: 0, subject: { en: b.nameEn, ar: b.nameAr } },
      { field: 'minutes', before: 0, after: 90, subject: { en: c.nameEn, ar: c.nameAr } },
    ]);
  });

  it('a lateness save refused for an approved month leaves no entry', async () => {
    const month = nextMonth();
    const emp = await employee();
    const run = (await http(app).post('/hr/payroll-runs').send({ month }).expect(201)).body.data as PayrollRun;
    await approve(run);
    mark = await historyMark(db);
    await http(app).put(`/hr/lateness/${month}`).send({ entries: [{ employeeId: emp.id, minutes: 30 }] }).expect(409);
    expect(await entries()).toHaveLength(0);
  });

  // ── payroll ───────────────────────────────────────────────────────────────

  it('hr.payroll.create / recalculate / approve — the run by its month, with the whole run’s totals; approve once, with the status (spec 6)', async () => {
    const month = nextMonth();
    await employee();
    const run = (await http(app).post('/hr/payroll-runs').send({ month }).expect(201)).body.data as PayrollRun;
    const [created] = await entries('hr.payroll.create');
    expect(created).toMatchObject({ entityType: 'payroll_run', entityId: run.id, entityLabel: month, actorId: userId });
    expect(field(created, 'totals')).toMatchObject({ before: null, after: run.totals });

    await employee({ basicSalary: 900_000 });
    const recalculated = (await http(app).post(`/hr/payroll-runs/${run.id}/recalculate`).expect(200)).body
      .data as PayrollRun;
    const [recalc] = await entries('hr.payroll.recalculate');
    expect(field(recalc, 'totals')).toMatchObject({ before: run.totals, after: recalculated.totals });

    const approved = await approve(run);
    const approvals = await entries('hr.payroll.approve');
    expect(approvals).toHaveLength(1);
    expect(field(approvals[0], 'totals')).toMatchObject({ before: null, after: approved.totals });
    expect(field(approvals[0], 'status')).toMatchObject({ before: 'DRAFT', after: 'APPROVED' });
    // The event is in the outbox with the approval (must-deliver).
    expect(await outboxEvents(db, HrEvent.PAYROLL_APPROVED, { runId: run.id })).toHaveLength(1);
  });

  it('hr.payroll.adjustment_add / adjustment_remove — the employee by both names, type, amount, reason', async () => {
    const month = nextMonth();
    const emp = await employee();
    const run = (await http(app).post('/hr/payroll-runs').send({ month }).expect(201)).body.data as PayrollRun;
    const added = (
      await http(app)
        .post(`/hr/payroll-runs/${run.id}/adjustments`)
        .send({ employeeId: emp.id, type: 'ADDITION', amount: 25_000, reason: 'Exam supervision' })
        .expect(201)
    ).body.data as PayrollRun;
    const [add] = await entries('hr.payroll.adjustment_add');
    expect(add).toMatchObject({ entityType: 'payroll_run', entityId: run.id, entityLabel: month, actorId: userId });
    expect(field(add, 'employeeId')?.after).toEqual({ nameEn: emp.nameEn, nameAr: emp.nameAr });
    expect(field(add, 'type')?.after).toBe('ADDITION');
    expect(field(add, 'amount')?.after).toBe(25_000);
    expect(field(add, 'reason')?.after).toBe('Exam supervision');

    const adjustment = added.adjustments.find((a) => a.employeeId === emp.id)!;
    await http(app).delete(`/hr/payroll-runs/${run.id}/adjustments/${adjustment.id}`).expect(200);
    const [remove] = await entries('hr.payroll.adjustment_remove');
    expect(field(remove, 'amount')).toMatchObject({ before: 25_000, after: null });
    expect(field(remove, 'employeeId')?.before).toEqual({ nameEn: emp.nameEn, nameAr: emp.nameAr });
  });

  it('a refused payroll change leaves no entry (a second run for the month → 409; a bad adjustment → 400)', async () => {
    const month = nextMonth();
    const emp = await employee();
    const run = (await http(app).post('/hr/payroll-runs').send({ month }).expect(201)).body.data as PayrollRun;
    mark = await historyMark(db);
    await http(app).post('/hr/payroll-runs').send({ month }).expect(409);
    await http(app)
      .post(`/hr/payroll-runs/${run.id}/adjustments`)
      .send({ employeeId: emp.id, type: 'ADDITION', amount: 0, reason: 'x' })
      .expect(400);
    expect(await entries()).toHaveLength(0);
  });

  // ── the run's History tab (2026-11-20) ────────────────────────────────────

  it('a run’s History: create → adjust → approve, newest first, with its field and person filters', async () => {
    const month = nextMonth();
    const emp = await employee();
    const run = (await http(app).post('/hr/payroll-runs').send({ month }).expect(201)).body.data as PayrollRun;
    await http(app)
      .post(`/hr/payroll-runs/${run.id}/adjustments`)
      .send({ employeeId: emp.id, type: 'ADDITION', amount: 25_000, reason: 'Exam supervision' })
      .expect(201);
    await approve(run);
    // Another month's run stays off this History.
    const other = (await http(app).post('/hr/payroll-runs').send({ month: nextMonth() }).expect(201)).body
      .data as PayrollRun;

    const list = (await http(app).get(`/audit/records/payroll_run/${run.id}`).expect(200)).body.data as AuditEntry[];
    expect(list.map((x) => x.action)).toEqual(['hr.payroll.approve', 'hr.payroll.adjustment_add', 'hr.payroll.create']);
    expect(list.every((x) => x.entityId === run.id && x.entityLabel.en === month)).toBe(true);
    expect(list.map((x) => x.entityId)).not.toContain(other.id);
    // The whole-school payroll viewer reads the amounts.
    expect(list[1]?.changes.find((c) => c.field === 'amount')).toMatchObject({ before: null, after: 25_000 });

    const byField = (
      await http(app).get(`/audit/records/payroll_run/${run.id}`).query({ field: 'amount' }).expect(200)
    ).body.data as AuditEntry[];
    expect(byField.map((x) => x.action)).toEqual(['hr.payroll.adjustment_add']);
    const byPerson = (
      await http(app).get(`/audit/records/payroll_run/${run.id}`).query({ actorId: userId }).expect(200)
    ).body;
    expect(byPerson.meta.total).toBe(3);

    const fields = (await http(app).get(`/audit/records/payroll_run/${run.id}/fields`).expect(200)).body.data as string[];
    expect(fields).toEqual(expect.arrayContaining(['amount', 'reason', 'status', 'totals', 'type']));
    const people = (
      await http(app).get('/audit/actors').query({ entityType: 'payroll_run', entityId: run.id }).expect(200)
    ).body.data as AuditActor[];
    expect(people.map((p) => p.id)).toEqual([userId]);
  });

  it('P4 — a run’s History needs the activity log and the whole school’s payroll; a part of it is not found', async () => {
    const month = nextMonth();
    await employee();
    const run = (await http(app).post('/hr/payroll-runs').send({ month }).expect(201)).body.data as PayrollRun;

    const noLog = await viewerWith({ 'hr.payroll.view': 'all' });
    await asUser(noLog, () => http(app).get(`/audit/records/payroll_run/${run.id}`).expect(403));

    const partOfSchool = await viewerWith({ 'core.audit.view': 'all', 'hr.payroll.view': 'own_stage' });
    await asUser(partOfSchool, async () => {
      await http(app).get(`/audit/records/payroll_run/${run.id}`).expect(404);
      await http(app).get(`/audit/records/payroll_run/${run.id}/fields`).expect(404);
    });

    const wholeSchool = await viewerWith({ 'core.audit.view': 'all', 'hr.payroll.view': 'all' });
    const seen = await asUser(wholeSchool, async () =>
      (await http(app).get(`/audit/records/payroll_run/${run.id}`).expect(200)).body.data as AuditEntry[],
    );
    expect(seen.map((x) => x.action)).toEqual(['hr.payroll.create']);
  });
});
