import { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  HrEvent,
  type AuditChange,
  type CreateEmployeeRequest,
  type PayrollRun,
} from '@school-erp/shared';
import { DatabaseService } from '../src/database/database.service';
import { http, unique } from './helpers';
import { createAppAsTestUser } from './helpers/as-test-user';
import { historyMark } from './helpers/history';

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
  let stageId: string;
  let departmentId: string;
  let jobTitleId: string;
  let mark = BigInt(0);

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
  const field = (e: { changes: unknown }, name: string) => changesOf(e).find((c) => c.field === name);

  beforeAll(async () => {
    let user;
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
    await db.payrollRun.deleteMany({ where: { month: { in: usedMonths } } });
    await db.latenessEntry.deleteMany({});
    await db.penaltyRecord.deleteMany({});
    await db.violationLevel.deleteMany({});
    await db.violation.deleteMany({});
    await db.penaltyGroup.deleteMany({});
    await db.employee.deleteMany({});
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
    await http(app).post(`/hr/payroll-runs/${run.id}/approve`).expect(200);
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

    const events: unknown[] = [];
    app.get(EventEmitter2).once(HrEvent.PAYROLL_APPROVED, (e) => events.push(e));
    const approved = (await http(app).post(`/hr/payroll-runs/${run.id}/approve`).expect(200)).body.data as PayrollRun;
    const approvals = await entries('hr.payroll.approve');
    expect(approvals).toHaveLength(1);
    expect(field(approvals[0], 'totals')).toMatchObject({ before: null, after: approved.totals });
    expect(field(approvals[0], 'status')).toMatchObject({ before: 'DRAFT', after: 'APPROVED' });
    // The event still goes out — after the commit.
    expect(events).toHaveLength(1);
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
});
