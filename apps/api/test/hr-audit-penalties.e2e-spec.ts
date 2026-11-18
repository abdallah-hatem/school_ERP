import { INestApplication } from '@nestjs/common';
import type {
  AuditActor,
  AuditChange,
  AuditEntry,
  AuthUser,
  PenaltyRecord,
  ViolationLevelInput,
} from '@school-erp/shared';
import { DatabaseService } from '../src/database/database.service';
import { http, unique } from './helpers';
import { createAppAsTestUser } from './helpers/as-test-user';
import { historyMark } from './helpers/history';

/*
 * T29 — recording, approving and cancelling a penalty each write one audit entry in the same
 * transaction as the change (audit spec D2, D6): on the penalty, labelled with the employee's two
 * names, the employee and violation by name. A refused write leaves no entry. The employee's
 * History lists their penalties' entries; Activity's search finds them by the employee's code (T31).
 */

const LEVELS: ViolationLevelInput[] = [
  { level: 1, action: 'NOTICE' },
  { level: 2, action: 'DEDUCT_DAYS', days: 1 },
];

/** A fresh past date per test (open months, far from other suites' data). */
let daySeq = 0;
const nextDate = () => {
  const n = daySeq++;
  return `2002-${String((n % 12) + 1).padStart(2, '0')}-${String(10 + Math.floor(n / 12)).padStart(2, '0')}`;
};

describe('HR audit wiring — penalties (T29, e2e)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let user: AuthUser;
  let stageId: string;
  let departmentId: string;
  let jobTitleId: string;
  let groupId: string;
  let mark = BigInt(0);
  const tempUserIds: string[] = [];
  const tempRoleIds: string[] = [];

  const entries = (action?: string) =>
    db.auditEntry.findMany({
      where: { seq: { gt: mark }, ...(action ? { action } : {}) },
      orderBy: { seq: 'asc' },
    });
  const changesOf = (e: { changes: unknown }) => e.changes as AuditChange[];
  const field = (e: { changes: unknown }, name: string) => changesOf(e).find((c) => c.field === name);

  async function asUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const own = user.id;
    user.id = userId;
    try {
      return await fn();
    } finally {
      user.id = own;
    }
  }

  /** A signed-in-able user holding only these keys (scope all). */
  async function viewerWith(keys: string[]): Promise<string> {
    const role = await db.role.create({
      data: {
        key: unique('custom_viewer'),
        nameEn: 'Viewer',
        nameAr: 'مشاهد',
        permissions: { create: keys.map((permissionKey) => ({ permissionKey, scope: 'all' })) },
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

  const employee = async () =>
    (
      await http(app)
        .post('/hr/employees')
        .send({
          nameEn: unique('Omar'),
          nameAr: unique('عمر'),
          gender: 'MALE',
          dateOfBirth: '1980-01-01',
          phone: '01000000000',
          hireDate: '2000-01-01',
          stageId,
          departmentId,
          jobTitleId,
          workSystem: 'FULL_TIME',
          basicSalary: 1_000_000,
        })
        .expect(201)
    ).body.data as { id: string; code: string; nameEn: string; nameAr: string };

  const violation = async () => {
    const nameEn = unique('Late');
    const nameAr = unique('تأخير');
    const id = (
      await http(app)
        .post(`/hr/penalty-groups/${groupId}/violations`)
        .send({ nameEn, nameAr, levels: LEVELS })
        .expect(201)
    ).body.data.id as string;
    return { id, nameEn, nameAr };
  };

  const record = (employeeId: string, violationId: string, date: string, note?: string) =>
    http(app).post('/hr/penalties').send({ employeeId, violationId, date, note });
  const recordOk = async (employeeId: string, violationId: string, date: string, note?: string) =>
    (await record(employeeId, violationId, date, note).expect(201)).body.data as PenaltyRecord;

  beforeAll(async () => {
    ({ app, user } = await createAppAsTestUser());
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
    await db.userRoleAssignment.deleteMany({ where: { userId: { in: tempUserIds } } });
    await db.user.deleteMany({ where: { id: { in: tempUserIds } } });
    await db.rolePermission.deleteMany({ where: { roleId: { in: tempRoleIds } } });
    await db.role.deleteMany({ where: { id: { in: tempRoleIds } } });
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

  it('hr.penalty.record — one entry on the penalty, the employee’s two names as label, every field by name', async () => {
    const emp = await employee();
    const v = await violation();
    const date = nextDate();
    const penalty = await recordOk(emp.id, v.id, date, 'Came at 9');

    const recorded = await entries('hr.penalty.record');
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      module: 'hr',
      entityType: 'penalty',
      entityId: penalty.id,
      entityLabel: emp.nameEn,
      entityLabelAr: emp.nameAr,
      actorId: user.id,
    });
    expect(changesOf(recorded[0])).toEqual(
      expect.arrayContaining([
        { field: 'violationId', before: null, after: { nameEn: v.nameEn, nameAr: v.nameAr } },
        { field: 'date', before: null, after: date },
        { field: 'level', before: null, after: 1 },
        { field: 'action', before: null, after: 'NOTICE' },
        { field: 'status', before: null, after: 'PENDING' },
        { field: 'note', before: null, after: 'Came at 9' },
      ]),
    );
    // The employee is the label, not a line repeating it; no raw ids anywhere in the values.
    expect(field(recorded[0], 'employeeId')).toBeUndefined();
    expect(JSON.stringify(recorded[0].changes)).not.toContain(emp.id);
    expect(JSON.stringify(recorded[0].changes)).not.toContain(v.id);
  });

  it('hr.penalty.approve — once, with the status and the level fixed at approval', async () => {
    const emp = await employee();
    const v = await violation();
    // The first approved one makes the second one level 2 (a day's deduction) at its approval.
    const first = await recordOk(emp.id, v.id, nextDate());
    await http(app).post(`/hr/penalties/${first.id}/approve`).expect(200);
    const second = await recordOk(emp.id, v.id, nextDate());
    mark = await historyMark(db);

    await http(app).post(`/hr/penalties/${second.id}/approve`).expect(200);
    const approvals = await entries('hr.penalty.approve');
    expect(approvals).toHaveLength(1);
    expect(approvals[0]).toMatchObject({ entityType: 'penalty', entityId: second.id, entityLabel: emp.nameEn, actorId: user.id });
    // Level 2 (a day) both when recorded and when fixed at approval: only the status changed.
    expect(changesOf(approvals[0])).toEqual([{ field: 'status', before: 'PENDING', after: 'APPROVED' }]);
    expect(await entries()).toHaveLength(1);
  });

  it('hr.penalty.cancel — the status and the reason', async () => {
    const emp = await employee();
    const v = await violation();
    const p = await recordOk(emp.id, v.id, nextDate());
    mark = await historyMark(db);
    await http(app).post(`/hr/penalties/${p.id}/cancel`).send({ reason: 'Recorded twice' }).expect(200);
    const [cancel] = await entries('hr.penalty.cancel');
    expect(cancel).toMatchObject({ entityType: 'penalty', entityId: p.id, entityLabel: emp.nameEn, actorId: user.id });
    expect(changesOf(cancel)).toEqual([
      { field: 'status', before: 'PENDING', after: 'CANCELLED' },
      { field: 'cancelReason', before: null, after: 'Recorded twice' },
    ]);
  });

  it('a refused write leaves no entry (same day twice, approve or cancel a cancelled one)', async () => {
    const emp = await employee();
    const v = await violation();
    const date = nextDate();
    const p = await recordOk(emp.id, v.id, date);
    await http(app).post(`/hr/penalties/${p.id}/cancel`).send({ reason: 'x' }).expect(200);
    const q = await recordOk(emp.id, v.id, date);
    mark = await historyMark(db);

    await record(emp.id, v.id, date).expect(409);
    await http(app).post(`/hr/penalties/${p.id}/approve`).expect(409);
    await http(app).post(`/hr/penalties/${p.id}/cancel`).send({ reason: 'again' }).expect(409);
    expect(await entries()).toHaveLength(0);
    // …and nothing changed either.
    expect((await db.penaltyRecord.findUnique({ where: { id: q.id } }))?.status).toBe('PENDING');
  });

  it('the employee’s History lists their penalties (record, approve, cancel), with the people and fields', async () => {
    const emp = await employee();
    const v = await violation();
    const a = await recordOk(emp.id, v.id, nextDate());
    await http(app).post(`/hr/penalties/${a.id}/approve`).expect(200);
    const b = await recordOk(emp.id, v.id, nextDate());
    await http(app).post(`/hr/penalties/${b.id}/cancel`).send({ reason: 'Wrong person' }).expect(200);
    // Someone else's penalty stays off this History.
    const other = await employee();
    await recordOk(other.id, v.id, nextDate());

    const list = (await http(app).get(`/audit/records/employee/${emp.id}`).expect(200)).body.data as AuditEntry[];
    expect(list.map((x) => [x.action, x.entityType])).toEqual([
      ['hr.penalty.cancel', 'penalty'],
      ['hr.penalty.record', 'penalty'],
      ['hr.penalty.approve', 'penalty'],
      ['hr.penalty.record', 'penalty'],
      ['hr.employee.create', 'employee'],
    ]);
    expect(list[0]?.entityLabel).toEqual({ en: emp.nameEn, ar: emp.nameAr });

    const status = (
      await http(app).get(`/audit/records/employee/${emp.id}`).query({ field: 'cancelReason' }).expect(200)
    ).body.data as AuditEntry[];
    expect(status.map((x) => x.action)).toEqual(['hr.penalty.cancel']);
    const fields = (await http(app).get(`/audit/records/employee/${emp.id}/fields`).expect(200)).body.data as string[];
    expect(fields).toEqual(expect.arrayContaining(['basicSalary', 'cancelReason', 'violationId']));
    expect(fields).not.toContain('employeeId');
    const people = (
      await http(app).get('/audit/actors').query({ entityType: 'employee', entityId: emp.id }).expect(200)
    ).body.data as AuditActor[];
    expect(people.map((p) => p.id)).toContain(user.id);
  });

  it('P4 — the penalties need hr.penalties.view; salary stays hidden without view_salary, penalty days do not', async () => {
    const emp = await employee();
    const v = await violation();
    await recordOk(emp.id, v.id, nextDate());

    const noPenalties = await viewerWith(['core.audit.view', 'hr.employees.view']);
    const seen = await asUser(noPenalties, async () =>
      (await http(app).get(`/audit/records/employee/${emp.id}`).expect(200)).body.data as AuditEntry[],
    );
    expect(seen.map((x) => x.action)).toEqual(['hr.employee.create']);
    expect(seen[0]?.changes.find((c) => c.field === 'basicSalary')).toEqual({ field: 'basicSalary', hidden: true });

    const withPenalties = await viewerWith(['core.audit.view', 'hr.employees.view', 'hr.penalties.view']);
    const both = await asUser(withPenalties, async () =>
      (await http(app).get(`/audit/records/employee/${emp.id}`).expect(200)).body.data as AuditEntry[],
    );
    expect(both.map((x) => x.action)).toEqual(['hr.penalty.record', 'hr.employee.create']);
    expect(both[0]?.changes.some((c) => c.hidden)).toBe(false);
    expect(both[1]?.changes.find((c) => c.field === 'basicSalary')).toEqual({ field: 'basicSalary', hidden: true });
  });

  it('T31 — Activity’s search finds an employee’s entries and their penalties’ by the employee’s code, any case', async () => {
    const emp = await employee();
    const v = await violation();
    const p = await recordOk(emp.id, v.id, nextDate());

    const found = (await http(app).get('/audit').query({ q: emp.code.toLowerCase(), limit: 100 }).expect(200)).body
      .data as AuditEntry[];
    expect(found.map((x) => [x.action, x.entityId])).toEqual(
      expect.arrayContaining([
        ['hr.penalty.record', p.id],
        ['hr.employee.create', emp.id],
      ]),
    );
    // Only this employee's entries (codes are unique; the number is long enough to be exact).
    expect(found.every((x) => x.entityId === emp.id || x.entityId === p.id)).toBe(true);
    // Names still match as before.
    const byName = (await http(app).get('/audit').query({ q: emp.nameAr, limit: 100 }).expect(200)).body
      .data as AuditEntry[];
    expect(byName.map((x) => x.entityId)).toEqual(expect.arrayContaining([emp.id, p.id]));
    // The day headers count the same matches.
    const now = new Date();
    const from = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const to = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    const totals = (
      await http(app).get('/audit/day-totals').query({ q: emp.code, periods: `${from}/${to}` }).expect(200)
    ).body.data as number[];
    expect(totals).toEqual([found.length]);
  });
});
