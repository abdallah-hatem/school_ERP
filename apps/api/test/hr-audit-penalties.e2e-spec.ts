import { INestApplication } from '@nestjs/common';
import {
  type AuditChange,
  type CreateEmployeeRequest,
  type PenaltyRecord,
  type ViolationLevelInput,
} from '@school-erp/shared';
import { DatabaseService } from '../src/database/database.service';
import { http, unique } from './helpers';
import { createAppAsTestUser } from './helpers/as-test-user';
import { historyMark } from './helpers/history';

/*
 * T29 — penalties write their audit entries in the same transaction as the
 * change (audit spec D2, D6): one test per action checks the entry's action, record, label, actor
 * and changed fields; a refused change leaves no entry.
 */

const DEDUCT = (days: number): ViolationLevelInput[] => [{ level: 1, action: 'DEDUCT_DAYS', days }];

/** A fresh past month per test (penalties can't be dated ahead), away from the payroll suite's. */
let monthSeq = 0;
const usedMonths: string[] = [];
const nextMonth = () => {
  const n = monthSeq++;
  const month = `${2001 + Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`;
  usedMonths.push(month);
  return month;
};

describe('HR audit wiring — penalties (T29, e2e)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let userId: string;
  let stageId: string;
  let departmentId: string;
  let jobTitleId: string;
  let groupId: string;
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

  const violation = async (levels = DEDUCT(1)) =>
    (
      await http(app)
        .post(`/hr/penalty-groups/${groupId}/violations`)
        .send({ nameEn: unique('Late'), nameAr: unique('تأخير'), levels })
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
    groupId = await mk('/hr/penalty-groups');
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

  // ── penalties ─────────────────────────────────────────────────────────────

  it('hr.penalty.record — the penalty, labelled with the employee’s two names, its violation, date, level, action, days, status', async () => {
    const month = nextMonth();
    const emp = await employee();
    const v = await violation(DEDUCT(1.5));
    const penalty = (
      await http(app).post('/hr/penalties').send({ employeeId: emp.id, violationId: v.id, date: `${month}-03` }).expect(201)
    ).body.data as PenaltyRecord;

    const [entry] = await entries('hr.penalty.record');
    expect(entry).toMatchObject({
      module: 'hr',
      entityType: 'penalty',
      entityId: penalty.id,
      entityLabel: emp.nameEn,
      entityLabelAr: emp.nameAr,
      actorId: userId,
    });
    expect(field(entry, 'violationId')).toMatchObject({ before: null, after: { nameEn: v.nameEn, nameAr: v.nameAr } });
    expect(field(entry, 'date')?.after).toBe(`${month}-03`);
    expect(field(entry, 'level')?.after).toBe(1);
    expect(field(entry, 'action')?.after).toBe('DEDUCT_DAYS');
    expect(field(entry, 'days')?.after).toBe(1.5);
    expect(field(entry, 'status')?.after).toBe('PENDING');
  });

  it('hr.penalty.approve and hr.penalty.cancel — status before → after, with the reason', async () => {
    const month = nextMonth();
    const emp = await employee();
    const v = await violation();
    const { id } = (
      await http(app).post('/hr/penalties').send({ employeeId: emp.id, violationId: v.id, date: `${month}-04` }).expect(201)
    ).body.data as PenaltyRecord;
    await http(app).post(`/hr/penalties/${id}/approve`).expect(200);
    await http(app).post(`/hr/penalties/${id}/cancel`).send({ reason: 'Recorded by mistake' }).expect(200);

    const [approved] = await entries('hr.penalty.approve');
    expect(approved).toMatchObject({ entityType: 'penalty', entityId: id, entityLabel: emp.nameEn, actorId: userId });
    expect(field(approved, 'status')).toMatchObject({ before: 'PENDING', after: 'APPROVED' });

    const [cancelled] = await entries('hr.penalty.cancel');
    expect(cancelled).toMatchObject({ entityId: id, entityLabelAr: emp.nameAr });
    expect(field(cancelled, 'status')).toMatchObject({ before: 'APPROVED', after: 'CANCELLED' });
    expect(field(cancelled, 'cancelReason')).toMatchObject({ before: null, after: 'Recorded by mistake' });
  });

  it('a refused penalty change leaves no entry (approving a cancelled one → 409)', async () => {
    const month = nextMonth();
    const emp = await employee();
    const v = await violation();
    const { id } = (
      await http(app).post('/hr/penalties').send({ employeeId: emp.id, violationId: v.id, date: `${month}-05` }).expect(201)
    ).body.data as PenaltyRecord;
    await http(app).post(`/hr/penalties/${id}/cancel`).send({ reason: 'No' }).expect(200);
    mark = await historyMark(db);
    await http(app).post(`/hr/penalties/${id}/approve`).expect(409);
    expect(await entries()).toHaveLength(0);
  });
});
