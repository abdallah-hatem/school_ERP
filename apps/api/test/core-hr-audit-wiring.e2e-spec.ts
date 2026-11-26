import { INestApplication } from '@nestjs/common';
import type { AuditChange, AuditEntry, AuthUser, CreateEmployeeRequest } from '@school-erp/shared';
import { DatabaseService } from '../src/database/database.service';
import { http, unique } from './helpers';
import { createAppAsTestUser } from './helpers/as-test-user';
import { historyMark } from './helpers/history';
import { deleteEmployees } from './helpers/employees';
import { ACTION_ID } from './helpers/penalty-actions';

/*
 * T28 — core and HR people write their audit entries in the same transaction as the change (audit
 * spec D2, D6): stages, departments, job titles, HR settings, the penalty catalogue and employees.
 * One test per action checks the entry's action, record, label, actor and changed fields; a refused
 * change leaves none. (Sign-in, sign-out and failed sign-ins: auth.e2e-spec.)
 */

/** A minimal PNG (signature + padding) for the photo upload. */
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1),
]);

describe('core + HR people audit wiring (T28, e2e)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let user: AuthUser;
  let stageId: string;
  let science: { id: string; nameEn: string; nameAr: string };
  let maths: { id: string; nameEn: string; nameAr: string };
  let jobTitleId: string;
  let mark = BigInt(0);
  const tempUserIds: string[] = [];
  const tempRoleIds: string[] = [];

  /** The entries written since the test began, oldest first, optionally one action's. */
  const entries = (action?: string) =>
    db.auditEntry.findMany({
      where: { seq: { gt: mark }, ...(action ? { action } : {}) },
      orderBy: { seq: 'asc' },
    });
  const changesOf = (e: { changes: unknown }) => e.changes as AuditChange[];
  const field = (e: { changes: unknown }, name: string) => changesOf(e).find((c) => c.field === name);

  /** Runs `fn` signed in as `userId` (the test user's id, swapped). */
  async function asUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const own = user.id;
    user.id = userId;
    try {
      return await fn();
    } finally {
      user.id = own;
    }
  }

  const newEmployee = (overrides: Partial<CreateEmployeeRequest> = {}): CreateEmployeeRequest => ({
    nameEn: unique('Mona'),
    nameAr: unique('منى'),
    gender: 'FEMALE',
    dateOfBirth: '1990-01-01',
    phone: '01000000000',
    hireDate: '2010-09-01',
    stageId,
    departmentId: science.id,
    jobTitleId,
    workSystem: 'FULL_TIME',
    basicSalary: 1_200_000,
    ...overrides,
  });
  const createEmployee = async (overrides: Partial<CreateEmployeeRequest> = {}) =>
    (await http(app).post('/hr/employees').send(newEmployee(overrides)).expect(201)).body.data as {
      id: string;
      code: string;
      nameEn: string;
      nameAr: string;
    };

  beforeAll(async () => {
    ({ app, user } = await createAppAsTestUser());
    db = app.get(DatabaseService);
    stageId = (await db.stage.create({ data: { nameEn: 'Primary', nameAr: 'ابتدائي' } })).id;
    const mk = async (path: string, nameEn: string, nameAr: string) =>
      (await http(app).post(path).send({ nameEn, nameAr }).expect(201)).body.data as {
        id: string;
        nameEn: string;
        nameAr: string;
      };
    science = await mk('/hr/departments', unique('Science'), unique('علوم'));
    maths = await mk('/hr/departments', unique('Maths'), unique('رياضيات'));
    jobTitleId = (await mk('/hr/job-titles', unique('Teacher'), unique('معلم'))).id;
  });

  beforeEach(async () => {
    mark = await historyMark(db);
  });

  afterAll(async () => {
    await db.userRoleAssignment.deleteMany({ where: { userId: { in: tempUserIds } } });
    await db.user.deleteMany({ where: { id: { in: tempUserIds } } });
    await db.role.deleteMany({ where: { id: { in: tempRoleIds } } });
    await deleteEmployees(db);
    await db.violationLevel.deleteMany({});
    await db.violation.deleteMany({});
    await db.penaltyGroup.deleteMany({});
    await db.department.deleteMany({});
    await db.jobTitle.deleteMany({});
    await db.stage.deleteMany({});
    await db.schoolSetting.deleteMany({ where: { key: { startsWith: 'hr.' } } });
    await app.close();
  });

  // ── school structure and lists ────────────────────────────────────────────

  it('core.stage.create / update — both names, the test user, the old history shape; an unchanged save records nothing', async () => {
    const created = (await http(app).post('/stages').send({ nameEn: 'KG', nameAr: 'روضة' }).expect(201)).body
      .data as { id: string };
    await http(app).patch(`/stages/${created.id}`).send({ nameAr: 'رياض أطفال' }).expect(200);
    await http(app).patch(`/stages/${created.id}`).send({ nameEn: 'KG' }).expect(200);

    const list = await entries();
    expect(list.map((e) => e.action)).toEqual(['core.stage.create', 'core.stage.update']);
    expect(list[0]).toMatchObject({
      module: 'core',
      entityType: 'stage',
      entityId: created.id,
      entityLabel: 'KG',
      entityLabelAr: 'روضة',
      actorId: user.id,
    });
    expect(changesOf(list[0])).toEqual([
      { field: `lists.stages.${created.id}`, before: null, after: expect.objectContaining({ nameEn: 'KG' }) },
    ]);
    expect(field(list[1], `lists.stages.${created.id}`)).toMatchObject({
      before: expect.objectContaining({ nameAr: 'روضة' }),
      after: expect.objectContaining({ nameAr: 'رياض أطفال' }),
    });
    expect(list[1]?.entityLabelAr).toBe('رياض أطفال');
  });

  it('hr.department.create / update and hr.job_title.create / update — keyed by the list history key', async () => {
    const dept = (await http(app).post('/hr/departments').send({ nameEn: 'Art', nameAr: 'فنون' }).expect(201)).body
      .data as { id: string };
    await http(app).patch(`/hr/departments/${dept.id}`).send({ isActive: false }).expect(200);
    const title = (
      await http(app).post('/hr/job-titles').send({ nameEn: 'Coach', nameAr: 'مدرب' }).expect(201)
    ).body.data as { id: string };
    await http(app).patch(`/hr/job-titles/${title.id}`).send({ managesPeople: true }).expect(200);

    const list = await entries();
    expect(list.map((e) => [e.action, e.entityType, e.entityId])).toEqual([
      ['hr.department.create', 'department', dept.id],
      ['hr.department.update', 'department', dept.id],
      ['hr.job_title.create', 'job_title', title.id],
      ['hr.job_title.update', 'job_title', title.id],
    ]);
    expect(field(list[1], 'hr.departments')).toMatchObject({
      before: expect.objectContaining({ isActive: true }),
      after: expect.objectContaining({ isActive: false }),
    });
    expect(field(list[3], 'hr.jobTitles')).toMatchObject({
      before: expect.objectContaining({ managesPeople: false }),
      after: expect.objectContaining({ managesPeople: true }),
    });
    for (const e of list) expect(e.actorId).toBe(user.id);
  });

  it('a refused list change (unknown id) leaves no entry', async () => {
    await http(app)
      .patch('/hr/departments/00000000-0000-4000-8000-000000000000')
      .send({ nameEn: 'X' })
      .expect(404);
    expect(await entries()).toHaveLength(0);
  });

  // ── HR rules ──────────────────────────────────────────────────────────────

  it('hr.settings.update — one entry listing the changed keys; an unchanged save answers 200 and records nothing', async () => {
    await db.schoolSetting.deleteMany({ where: { key: { startsWith: 'hr.' } } });
    await http(app).patch('/hr/settings').send({ payroll: { dayDivisor: 26 } }).expect(200);
    await http(app).patch('/hr/settings').send({ payroll: { dayDivisor: 26 } }).expect(200);
    await http(app).patch('/hr/settings').send({}).expect(200);

    const list = await entries();
    expect(list.map((e) => e.action)).toEqual(['hr.settings.update']);
    expect(changesOf(list[0])).toEqual([{ field: 'hr.payroll.dayDivisor', before: 30, after: 26 }]);
    expect(list[0]?.actorId).toBe(user.id);
  });

  it('hr.penalty_group.* / hr.violation.* — both names, whole snapshots under the catalogue history key', async () => {
    const group = (
      await http(app).post('/hr/penalty-groups').send({ nameEn: 'Conduct', nameAr: 'السلوك' }).expect(201)
    ).body.data as { id: string };
    await http(app).patch(`/hr/penalty-groups/${group.id}`).send({ nameAr: 'الانضباط' }).expect(200);
    const violation = (
      await http(app)
        .post(`/hr/penalty-groups/${group.id}/violations`)
        .send({ nameEn: 'Late', nameAr: 'تأخر', levels: [{ level: 1, actionId: ACTION_ID.NOTICE }] })
        .expect(201)
    ).body.data as { id: string };
    await http(app).patch(`/hr/violations/${violation.id}`).send({ oncePerDay: false }).expect(200);
    // Invalid levels → 400, nothing recorded.
    await http(app)
      .patch(`/hr/violations/${violation.id}`)
      .send({ levels: [{ level: 2, actionId: ACTION_ID.NOTICE }] })
      .expect(400);

    const list = await entries();
    expect(list.map((e) => [e.action, e.entityId, e.entityLabel, e.entityLabelAr])).toEqual([
      ['hr.penalty_group.create', group.id, 'Conduct', 'السلوك'],
      ['hr.penalty_group.update', group.id, 'Conduct', 'الانضباط'],
      ['hr.violation.create', violation.id, 'Late', 'تأخر'],
      ['hr.violation.update', violation.id, 'Late', 'تأخر'],
    ]);
    expect(field(list[3], 'hr.violations')).toMatchObject({
      before: expect.objectContaining({ oncePerDay: true }),
      after: expect.objectContaining({ oncePerDay: false }),
    });
  });

  // ── employees ─────────────────────────────────────────────────────────────

  it('hr.employee.create — both names, every field given, the department by name, money in piastres', async () => {
    const e = await createEmployee();
    const [entry, ...rest] = await entries('hr.employee.create');
    expect(rest).toHaveLength(0);
    expect(entry).toMatchObject({
      module: 'hr',
      entityType: 'employee',
      entityId: e.id,
      entityLabel: e.nameEn,
      entityLabelAr: e.nameAr,
      actorId: user.id,
    });
    expect(field(entry, 'code')).toEqual({ field: 'code', before: null, after: e.code });
    expect(field(entry, 'basicSalary')).toEqual({ field: 'basicSalary', before: null, after: 1_200_000 });
    expect(field(entry, 'dateOfBirth')?.after).toBe('1990-01-01');
    expect(field(entry, 'departmentId')?.after).toEqual({ nameEn: science.nameEn, nameAr: science.nameAr });
    expect(changesOf(entry).map((c) => c.field)).not.toContain('department');
  });

  it('hr.employee.update — only the changed fields; Department reads Science → Maths by name; a no-op save records nothing', async () => {
    const e = await createEmployee();
    mark = await historyMark(db);
    await http(app).patch(`/hr/employees/${e.id}`).send({ departmentId: maths.id, phone: '01111111111' }).expect(200);
    await http(app).patch(`/hr/employees/${e.id}`).send({ phone: '01111111111' }).expect(200);

    const list = await entries();
    expect(list.map((x) => x.action)).toEqual(['hr.employee.update']);
    // In form order (phone before department), each with before and after.
    expect(changesOf(list[0])).toEqual([
      { field: 'phone', before: '01000000000', after: '01111111111' },
      {
        field: 'departmentId',
        before: { nameEn: science.nameEn, nameAr: science.nameAr },
        after: { nameEn: maths.nameEn, nameAr: maths.nameAr },
      },
    ]);
  });

  it('N0 edge 8 — an edit changing only the probation end is one hr.employee.update with that field; other edits don’t list it', async () => {
    const e = await createEmployee();
    const created = (await entries('hr.employee.create')).find((x) => x.entityId === e.id);
    expect(field(created!, 'probationEnd')).toEqual({ field: 'probationEnd', before: null, after: '2010-11-30' });
    mark = await historyMark(db);
    await http(app).patch(`/hr/employees/${e.id}`).send({ probationEnd: '2010-12-31' }).expect(200);
    await http(app).patch(`/hr/employees/${e.id}`).send({ phone: '01333333333' }).expect(200);
    const list = await entries('hr.employee.update');
    expect(list).toHaveLength(2);
    expect(changesOf(list[0])).toEqual([{ field: 'probationEnd', before: '2010-11-30', after: '2010-12-31' }]);
    expect(changesOf(list[1]).map((c) => c.field)).toEqual(['phone']);
  });

  it('a refused employee edit (duplicate national ID) leaves no entry and no change', async () => {
    const nationalId = String(Date.now()).padStart(14, '2').slice(-14);
    await createEmployee({ nationalId });
    const b = await createEmployee();
    mark = await historyMark(db);
    await http(app).patch(`/hr/employees/${b.id}`).send({ nationalId, phone: '01222222222' }).expect(409);
    expect(await entries()).toHaveLength(0);
    expect((await db.employee.findUniqueOrThrow({ where: { id: b.id } })).phone).toBe('01000000000');
  });

  it('hr.employee.deactivate / reactivate — the status change; repeating one records nothing', async () => {
    const e = await createEmployee();
    mark = await historyMark(db);
    await http(app).post(`/hr/employees/${e.id}/deactivate`).expect(200);
    await http(app).post(`/hr/employees/${e.id}/deactivate`).expect(200);
    await http(app).post(`/hr/employees/${e.id}/reactivate`).expect(200);

    const list = await entries();
    expect(list.map((x) => [x.action, changesOf(x)])).toEqual([
      ['hr.employee.deactivate', [{ field: 'status', before: 'ACTIVE', after: 'INACTIVE' }]],
      ['hr.employee.reactivate', [{ field: 'status', before: 'INACTIVE', after: 'ACTIVE' }]],
    ]);
  });

  it('a photo upload and removal are hr.employee.update entries on the photo; removing no photo records nothing', async () => {
    const e = await createEmployee();
    mark = await historyMark(db);
    await http(app)
      .post(`/hr/employees/${e.id}/photo`)
      .attach('file', PNG, { filename: 'p.png', contentType: 'image/png' })
      .expect(200);
    await http(app).delete(`/hr/employees/${e.id}/photo`).expect(200);
    await http(app).delete(`/hr/employees/${e.id}/photo`).expect(200);

    const list = await entries();
    expect(list.map((x) => [x.action, changesOf(x).map((c) => c.field)])).toEqual([
      ['hr.employee.update', ['photoUrl']],
      ['hr.employee.update', ['photoUrl']],
    ]);
    expect(field(list[0], 'photoUrl')?.after).toMatch(/^\/files\/employee-photos\//);
    expect(field(list[1], 'photoUrl')?.after).toBeNull();
  });

  it("the employee's History lists their entries, newest first", async () => {
    const e = await createEmployee();
    const grade = (await http(app).post('/hr/employee-grades').send({ nameEn: 'B', nameAr: 'ب' }).expect(201)).body.data;
    await http(app).patch(`/hr/employees/${e.id}`).send({ employeeGradeId: grade.id }).expect(200);
    const res = await http(app).get(`/audit/records/employee/${e.id}`).expect(200);
    const list = res.body.data as AuditEntry[];
    // Contracts (2026-11-24): the first contract's entry is on the employee's History too.
    expect(list.map((x) => x.action)).toEqual(['hr.employee.update', 'hr.contract.create', 'hr.employee.create']);
    expect(list[0]?.entityLabel).toEqual({ en: e.nameEn, ar: e.nameAr });
    // The grade by its two names (§3, owner 2026-11-24), as the History shows it.
    expect(list[0]?.changes).toEqual([{ field: 'employeeGradeId', before: null, after: { nameEn: 'B', nameAr: 'ب' } }]);
  });

  it('P4 — salary-type values are hidden from a viewer without hr.employees.view_salary; other fields show', async () => {
    const e = await createEmployee();
    await http(app)
      .patch(`/hr/employees/${e.id}`)
      .send({ basicSalary: 1_500_000, bankName: 'Bank', phone: '01333333333' })
      .expect(200);

    const role = await db.role.create({
      data: {
        key: unique('custom_no_salary'),
        nameEn: 'No salary',
        nameAr: 'بلا رواتب',
        permissions: {
          create: [
            { permissionKey: 'core.audit.view', scope: 'all' },
            { permissionKey: 'hr.employees.view', scope: 'all' },
          ],
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

    const seen = await asUser(viewer.id, async () =>
      (await http(app).get(`/audit/records/employee/${e.id}`).expect(200)).body.data as AuditEntry[],
    );
    const update = seen.find((x) => x.action === 'hr.employee.update')!;
    expect(update.changes.find((c) => c.field === 'basicSalary')).toEqual({ field: 'basicSalary', hidden: true });
    expect(update.changes.find((c) => c.field === 'bankName')).toEqual({ field: 'bankName', hidden: true });
    expect(update.changes.find((c) => c.field === 'phone')).toMatchObject({ after: '01333333333' });
    const created = seen.find((x) => x.action === 'hr.employee.create')!;
    expect(created.changes.find((c) => c.field === 'basicSalary')).toEqual({ field: 'basicSalary', hidden: true });

    // The test user (every salary) sees the values.
    const full = (await http(app).get(`/audit/records/employee/${e.id}`).expect(200)).body.data as AuditEntry[];
    expect(full.find((x) => x.action === 'hr.employee.update')!.changes.find((c) => c.field === 'basicSalary'))
      .toEqual({ field: 'basicSalary', before: 1_200_000, after: 1_500_000 });
  });
});
