import type { INestApplication } from '@nestjs/common';
import {
  BuiltInRole,
  ErrorCode,
  type AuthUser,
  type CreateEmployeeRequest,
  type Employee,
  type PayrollRun,
  type PenaltyEmployeeStages,
  type PenaltyPreview,
  type PenaltyRecord,
  type Role,
  type RoleGrant,
  type UserAccount,
} from '@school-erp/shared';
import { DatabaseService } from '../src/database/database.service';
import { http, unique } from './helpers';
import { createAppAsTestUser } from './helpers/as-test-user';
import { outboxIdle } from './helpers/events';

/*
 * Security review (2026-11-23) in HR, against the real database. Everything is made through the API
 * by the test user (System admin + HR manager); `as(...)` swaps the signed-in user.
 *
 *   Stages: primary (head: primaryHead), prep (head: prepHead), kg (no head)
 *   teacher: primary, also teaches in prep — the shared teacher
 *   M1  nobody cancels their own penalty           M2  a stage head records only in their stages
 *   M4  payroll separation of duties                L1  no other-stage penalty details
 *   L2  an out-of-stage review is 404                L3  a scoped payroll viewer counts their own
 *   L4  a non-salary editor can't clear the insured salary
 */

/** Months no other suite uses (penalties can't be in the future; one payroll run per month). */
const MONTH = {
  penalties: '2013-05',
  adjust: '2013-02',
  creator: '2013-04',
  pending: '2013-03',
  /** L-3: approved, holding an approved Prep penalty a backdated one would move up. */
  locked: '2013-07',
  backdated: '2013-06',
  lateness: '2013-08',
  /** M2-B: an unlinked HR manager's refusals. */
  unlinked: '2013-09',
};

describe('Security review — HR access (e2e)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let user: AuthUser;
  const stage = { primary: '', prep: '', kg: '' };
  const emp = { hPrim: '', hPrep: '', teacher: '', k1: '', prin: '', hrMgr: '', deputy: '', approver: '', viewer: '' };
  const who = { primaryHead: '', prepHead: '', principal: '', hrMgr: '', deputy: '', approver: '', viewer: '', editor: '', unlinked: '' };
  let departmentId = '';
  let jobTitleId = '';
  let groupId = '';
  const violations: string[] = [];
  let nextViolation = 0;
  const users: string[] = [];
  const roles: string[] = [];
  const employees: string[] = [];
  const stageIds: string[] = [];

  async function as<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const me = user.id;
    user.id = id;
    try {
      return await fn();
    } finally {
      user.id = me;
    }
  }

  const violation = () => {
    const id = violations[nextViolation++];
    if (!id) throw new Error('violation pool exhausted');
    return id;
  };

  const createEmployee = async (over: Partial<CreateEmployeeRequest>) => {
    const id = (
      await http(app)
        .post('/hr/employees')
        .send({
          nameEn: unique('Security'),
          nameAr: unique('أمان'),
          gender: 'FEMALE',
          dateOfBirth: '1990-01-01',
          phone: '01000000000',
          hireDate: '2012-09-01',
          stageId: stage.primary,
          departmentId,
          jobTitleId,
          workSystem: 'FULL_TIME',
          basicSalary: 1_000_000,
          ...over,
        })
        .expect(201)
    ).body.data.id as string;
    employees.push(id);
    return id;
  };

  const createRole = async (permissions: RoleGrant[]) => {
    const role = (
      await http(app).post('/roles').send({ nameEn: unique('Sec role'), nameAr: unique('دور'), permissions }).expect(201)
    ).body.data as Role;
    roles.push(role.id);
    return role.id;
  };

  const roleIdOf = async (key: string) => (await db.role.findUniqueOrThrow({ where: { key }, select: { id: true } })).id;

  const createUser = async (roleIds: string[], employeeId: string | null = null) => {
    const account = (
      await http(app)
        .post('/users')
        .send({
          name: unique('Sec user'),
          email: `${unique('sec')}@school.test`.toLowerCase(),
          password: 'first-password-123',
          roleIds,
          ...(employeeId ? { employeeId } : {}),
        })
        .expect(201)
    ).body.data as UserAccount;
    users.push(account.id);
    return account.id;
  };

  const record = (body: { employeeId: string; violationId: string; date: string; stageId?: string }) =>
    http(app).post('/hr/penalties').send(body);
  const recordOk = async (body: { employeeId: string; violationId: string; date: string; stageId?: string }) =>
    (await record(body).expect(201)).body.data as PenaltyRecord;
  const get = (id: string) => http(app).get(`/hr/penalties/${id}`);

  beforeAll(async () => {
    ({ app, user } = await createAppAsTestUser());
    db = app.get(DatabaseService);
    for (const key of Object.keys(stage) as (keyof typeof stage)[]) {
      stage[key] = (await http(app).post('/stages').send({ nameEn: unique(key), nameAr: unique('مرحلة') }).expect(201)).body.data
        .id as string;
      stageIds.push(stage[key]);
    }
    departmentId = (await http(app).post('/hr/departments').send({ nameEn: unique('D'), nameAr: unique('ق') }).expect(201)).body
      .data.id;
    jobTitleId = (await http(app).post('/hr/job-titles').send({ nameEn: unique('T'), nameAr: unique('م') }).expect(201)).body.data.id;
    groupId = (await http(app).post('/hr/penalty-groups').send({ nameEn: unique('G'), nameAr: unique('ج') }).expect(201)).body.data
      .id as string;
    for (let i = 0; i < 10; i++) {
      violations.push(
        (
          await http(app)
            .post(`/hr/penalty-groups/${groupId}/violations`)
            .send({
              nameEn: unique('Late'),
              nameAr: unique('تأخير'),
              oncePerDay: false,
              levels: [
                { level: 1, action: 'NOTICE' },
                { level: 2, action: 'WARNING' },
              ],
            })
            .expect(201)
        ).body.data.id as string,
      );
    }
    emp.hPrim = await createEmployee({ stageId: stage.primary });
    emp.hPrep = await createEmployee({ stageId: stage.prep });
    emp.teacher = await createEmployee({ stageId: stage.primary, otherStageIds: [stage.prep] });
    emp.k1 = await createEmployee({ stageId: stage.kg });
    emp.prin = await createEmployee({ stageId: stage.primary });
    emp.hrMgr = await createEmployee({ stageId: stage.primary });
    emp.deputy = await createEmployee({ stageId: stage.primary });
    emp.approver = await createEmployee({ stageId: stage.primary });
    emp.viewer = await createEmployee({ stageId: stage.primary });

    const stageHead = await roleIdOf(BuiltInRole.STAGE_HEAD);
    const hrManager = await roleIdOf(BuiltInRole.HR_MANAGER);
    who.primaryHead = await createUser([stageHead], emp.hPrim);
    who.prepHead = await createUser([stageHead], emp.hPrep);
    who.principal = await createUser([await roleIdOf(BuiltInRole.PRINCIPAL)], emp.prin);
    who.hrMgr = await createUser([hrManager], emp.hrMgr);
    // A System admin not linked yet — the only one who may act on pay unlinked (M2-B) — linked to
    // `emp.deputy` in the M4 test, after adjusting that line.
    who.deputy = await createUser([await roleIdOf(BuiltInRole.SYSTEM_ADMIN)]);
    // An HR manager with no employee record (M2-B).
    who.unlinked = await createUser([hrManager]);
    who.approver = await createUser(
      [await createRole([{ key: 'hr.penalties.approve', scope: 'own_stage' }, { key: 'hr.penalties.view', scope: 'own_stage' }])],
      emp.approver,
    );
    who.viewer = await createUser([await createRole([{ key: 'hr.payroll.view', scope: 'own_stage' }])], emp.viewer);
    who.editor = await createUser([
      await createRole([
        { key: 'hr.employees.view', scope: 'all' },
        { key: 'hr.employees.edit', scope: 'all' },
      ]),
    ]);
  });

  afterAll(async () => {
    const months = Object.values(MONTH);
    const runIds = (await db.payrollRun.findMany({ where: { month: { in: months } }, select: { id: true } })).map((r) => r.id);
    await db.accountingPayrollRun.deleteMany({ where: { OR: [{ hrRunId: { in: runIds } }, { month: { in: months } }] } });
    await db.payrollRun.deleteMany({ where: { month: { in: months } } });
    await db.notification.deleteMany({ where: { recipientKind: 'user', recipientId: { in: users } } });
    await db.penaltyRecord.deleteMany({ where: { employeeId: { in: employees } } });
    await db.latenessEntry.deleteMany({ where: { employeeId: { in: employees } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.role.deleteMany({ where: { id: { in: roles } } });
    await db.employeeStage.deleteMany({ where: { employeeId: { in: employees } } });
    await db.employee.deleteMany({ where: { id: { in: employees } } });
    await db.violation.deleteMany({ where: { groupId } });
    await db.penaltyGroup.deleteMany({ where: { id: groupId } });
    await db.department.deleteMany({ where: { id: departmentId } });
    await db.jobTitle.deleteMany({ where: { id: jobTitleId } });
    await db.stage.deleteMany({ where: { id: { in: stageIds } } });
    await app.close();
  });

  it('M1 — self-cancel gets refused (403 PENALTY_OWN); someone else may cancel it', async () => {
    const own = await recordOk({ employeeId: emp.prin, violationId: violation(), date: `${MONTH.penalties}-01` });
    const refused = await as(who.principal, () =>
      http(app).post(`/hr/penalties/${own.id}/cancel`).send({ reason: 'Not fair' }).expect(403),
    );
    expect(refused.body.error).toBe(ErrorCode.PENALTY_OWN);
    expect((await get(own.id).expect(200)).body.data.status).not.toBe('CANCELLED');
    await http(app).post(`/hr/penalties/${own.id}/cancel`).send({ reason: 'Recorded by mistake' }).expect(200);
  });

  it('M2 — the Primary head can’t record a Prep-stage penalty for a shared teacher; the picker offers only Primary', async () => {
    const v = violation();
    const date = `${MONTH.penalties}-02`;
    await as(who.primaryHead, async () => {
      const picker = (await http(app).get(`/hr/penalties/employee-stages/${emp.teacher}`).expect(200)).body
        .data as PenaltyEmployeeStages;
      expect(picker.stages.map((s) => s.id)).toEqual([stage.primary]);
      const preview = await http(app)
        .get('/hr/penalties/preview')
        .query({ employeeId: emp.teacher, violationId: v, date, stageId: stage.prep })
        .expect(400);
      expect(preview.body.error).toBe(ErrorCode.PENALTY_STAGE_INVALID);
      const refused = await record({ employeeId: emp.teacher, violationId: v, date, stageId: stage.prep }).expect(400);
      expect(refused.body.error).toBe(ErrorCode.PENALTY_STAGE_INVALID);
      // Their only allowed stage fills in by itself.
      const recorded = (await record({ employeeId: emp.teacher, violationId: v, date }).expect(201)).body.data as PenaltyRecord;
      expect(recorded.stage.id).toBe(stage.primary);
    });
    // A school-wide recorder is still offered both.
    const all = (await http(app).get(`/hr/penalties/employee-stages/${emp.teacher}`).expect(200)).body.data as PenaltyEmployeeStages;
    expect(all.stages.map((s) => s.id)).toEqual([stage.primary, stage.prep]);
  });

  describe('L1 — level and preview responses carry no other-stage penalty details', () => {
    it('the recount: the Prep penalty is only counted for the Primary head; HR sees it in full', async () => {
      const v = violation();
      const inPrep = await recordOk({ employeeId: emp.teacher, violationId: v, date: `${MONTH.penalties}-20`, stageId: stage.prep });
      await http(app).post(`/hr/penalties/${inPrep.id}/approve`).send({}).expect(200);
      const backdated = await recordOk({
        employeeId: emp.teacher,
        violationId: v,
        date: `${MONTH.penalties}-10`,
        stageId: stage.primary,
      });

      const asHead = await as(who.primaryHead, () => get(backdated.id).expect(200));
      const shown = asHead.body.data as PenaltyRecord;
      expect(shown.recount).toEqual([]);
      expect(shown.recountElsewhere).toBe(1);
      expect(JSON.stringify(asHead.body)).not.toContain(inPrep.id);
      expect(JSON.stringify(asHead.body)).not.toContain(`${MONTH.penalties}-20`);

      const preview = await as(who.primaryHead, () =>
        http(app)
          .get('/hr/penalties/preview')
          .query({ employeeId: emp.teacher, violationId: v, date: `${MONTH.penalties}-05`, stageId: stage.primary })
          .expect(200),
      );
      expect(preview.body.data as PenaltyPreview).toMatchObject({ recount: [], recountElsewhere: 1 });
      expect(JSON.stringify(preview.body)).not.toContain(inPrep.id);
      expect(JSON.stringify(preview.body)).not.toContain(`${MONTH.penalties}-20`);

      // HR, school-wide, sees which one and its levels; the count itself is school-wide for both.
      const hr = (await get(backdated.id).expect(200)).body.data as PenaltyRecord;
      expect(hr.recount.map((c) => c.id)).toEqual([inPrep.id]);
      expect(hr.recountElsewhere).toBe(0);
      expect(hr.level).toBe(shown.level);
    });

    it('an earlier pending penalty in another stage: no id or date, and the approval’s 409 names none', async () => {
      const v = violation();
      const inPrep = await recordOk({ employeeId: emp.teacher, violationId: v, date: `${MONTH.penalties}-03`, stageId: stage.prep });
      const inPrimary = await recordOk({ employeeId: emp.teacher, violationId: v, date: `${MONTH.penalties}-04`, stageId: stage.primary });

      const asHead = await as(who.primaryHead, () => get(inPrimary.id).expect(200));
      expect((asHead.body.data as PenaltyRecord).earlierPending).toEqual({ id: null, date: null });
      expect(JSON.stringify(asHead.body)).not.toContain(inPrep.id);

      const refused = await as(who.approver, () => http(app).post(`/hr/penalties/${inPrimary.id}/approve`).send({}).expect(409));
      expect(refused.body.error).toBe(ErrorCode.PENALTY_EARLIER_PENDING_ELSEWHERE);
      expect(JSON.stringify(refused.body)).not.toContain(`${MONTH.penalties}-03`);
      expect(JSON.stringify(refused.body)).not.toContain(inPrep.id);

      // HR sees which one blocks it.
      expect(((await get(inPrimary.id).expect(200)).body.data as PenaltyRecord).earlierPending).toEqual({
        id: inPrep.id,
        date: `${MONTH.penalties}-03`,
      });
    });
  });

  it('L2 — an out-of-stage review gets 404, like a missing record', async () => {
    const p = await recordOk({ employeeId: emp.teacher, violationId: violation(), date: `${MONTH.penalties}-06`, stageId: stage.primary });
    await as(who.prepHead, async () => {
      await get(p.id).expect(404);
      await http(app).post(`/hr/penalties/${p.id}/review/approve`).send({}).expect(404);
      await http(app).post(`/hr/penalties/${p.id}/review/reject`).send({ reason: 'Not mine' }).expect(404);
    });
  });

  describe('M4 — payroll separation of duties (owner 2026-11-23)', () => {
    const adjust = (runId: string, employeeId: string) =>
      http(app)
        .post(`/hr/payroll-runs/${runId}/adjustments`)
        .send({ employeeId, type: 'ADDITION', amount: 10_000, reason: 'Exam committee' });

    it('payroll self-adjust is refused, and self-adjusted approval is refused; someone else approves', async () => {
      const run = (await http(app).post('/hr/payroll-runs').send({ month: MONTH.adjust }).expect(201)).body.data as PayrollRun;
      await as(who.hrMgr, async () => {
        const own = await adjust(run.id, emp.hrMgr).expect(403);
        expect(own.body.error).toBe(ErrorCode.PAYROLL_OWN_LINE);
        // Someone else's line is fine.
        await adjust(run.id, emp.k1).expect(201);
      });
      // The deputy adjusts a line, which then turns out to be their own (linked afterwards).
      await as(who.deputy, () => adjust(run.id, emp.deputy).expect(201));
      await http(app).patch(`/users/${who.deputy}`).send({ employeeId: emp.deputy }).expect(200);
      const adjustments = (await http(app).get(`/hr/payroll-runs/${run.id}`).query({ limit: '500' }).expect(200)).body.data
        .adjustments as { id: string; employeeId: string }[];
      const deputys = adjustments.find((a) => a.employeeId === emp.deputy)!;
      // Nor can they remove an adjustment on their own line now.
      const removal = await as(who.deputy, () =>
        http(app).delete(`/hr/payroll-runs/${run.id}/adjustments/${deputys.id}`).expect(403),
      );
      expect(removal.body.error).toBe(ErrorCode.PAYROLL_OWN_LINE);

      const refused = await as(who.deputy, () => http(app).post(`/hr/payroll-runs/${run.id}/approve`).expect(403));
      expect(refused.body.error).toBe(ErrorCode.PAYROLL_APPROVER_ADJUSTED_OWN_LINE);
      // The HR manager adjusted only someone else's line: they may approve.
      await as(who.hrMgr, () => http(app).post(`/hr/payroll-runs/${run.id}/approve`).expect(200));
      await outboxIdle(app);
    });

    it('the run’s creator may approve it when they adjusted nobody’s line of their own', async () => {
      await as(who.hrMgr, async () => {
        const run = (await http(app).post('/hr/payroll-runs').send({ month: MONTH.creator }).expect(201)).body.data as PayrollRun;
        await http(app).post(`/hr/payroll-runs/${run.id}/approve`).expect(200);
      });
      await outboxIdle(app);
    });
  });

  it('L3 / L-5 — a scoped payroll viewer counts only the pending penalties they cover, by the penalty’s stage', async () => {
    await recordOk({ employeeId: emp.hPrim, violationId: violation(), date: `${MONTH.pending}-05` });
    await recordOk({ employeeId: emp.k1, violationId: violation(), date: `${MONTH.pending}-06` });
    // The shared teacher is one of the Primary viewer's employees, but this penalty is Prep's (L-5).
    await recordOk({ employeeId: emp.teacher, violationId: violation(), date: `${MONTH.pending}-07`, stageId: stage.prep });
    const run = (await http(app).post('/hr/payroll-runs').send({ month: MONTH.pending }).expect(201)).body.data as PayrollRun;
    expect(((await http(app).get(`/hr/payroll-runs/${run.id}`).expect(200)).body.data as PayrollRun).pendingPenalties).toBe(3);
    const scoped = await as(who.viewer, () => http(app).get(`/hr/payroll-runs/${run.id}`).expect(200));
    expect((scoped.body.data as PayrollRun).pendingPenalties).toBe(1);
  });

  it('L-3 — an approved month among another stage’s penalties is refused without naming the month', async () => {
    const v = violation();
    const inPrep = await recordOk({ employeeId: emp.teacher, violationId: v, date: `${MONTH.locked}-20`, stageId: stage.prep });
    await http(app).post(`/hr/penalties/${inPrep.id}/approve`).send({}).expect(200);
    const run = (await http(app).post('/hr/payroll-runs').send({ month: MONTH.locked }).expect(201)).body.data as PayrollRun;
    await http(app).post(`/hr/payroll-runs/${run.id}/approve`).expect(200);
    await outboxIdle(app);
    const query = { employeeId: emp.teacher, violationId: v, date: `${MONTH.backdated}-25`, stageId: stage.primary };
    const asHead = await as(who.primaryHead, () => http(app).get('/hr/penalties/preview').query(query).expect(409));
    expect(asHead.body.error).toBe(ErrorCode.PENALTY_RECOUNT_MONTH_LOCKED_ELSEWHERE);
    expect(JSON.stringify(asHead.body)).not.toContain(MONTH.locked);
    const recorded = await as(who.primaryHead, () => record(query).expect(409));
    expect(recorded.body.error).toBe(ErrorCode.PENALTY_RECOUNT_MONTH_LOCKED_ELSEWHERE);
    // HR, who sees the Prep penalty, is told which month.
    const asHr = await http(app).get('/hr/penalties/preview').query(query).expect(409);
    expect(asHr.body).toMatchObject({ error: ErrorCode.PENALTY_RECOUNT_MONTH_LOCKED, params: { month: MONTH.locked } });
  });

  it('M-2 — nobody changes their own pay: salary fields (403 OWN_PAY_CHANGE) or their own lateness', async () => {
    await as(who.hrMgr, async () => {
      const salary = await http(app).patch(`/hr/employees/${emp.hrMgr}`).send({ basicSalary: 2_000_000 }).expect(403);
      expect(salary.body.error).toBe(ErrorCode.OWN_PAY_CHANGE);
      const work = await http(app).patch(`/hr/employees/${emp.hrMgr}`).send({ workSystem: 'PART_TIME_4' }).expect(403);
      expect(work.body.error).toBe(ErrorCode.OWN_PAY_CHANGE);
      // Their own phone is fine; someone else's salary too.
      await http(app).patch(`/hr/employees/${emp.hrMgr}`).send({ phone: '01000000007' }).expect(200);
      await http(app).patch(`/hr/employees/${emp.k1}`).send({ basicSalary: 1_100_000 }).expect(200);
      const lateness = await http(app)
        .put(`/hr/lateness/${MONTH.lateness}`)
        .send({ entries: [{ employeeId: emp.hrMgr, minutes: 0 }, { employeeId: emp.k1, minutes: 45 }] })
        .expect(200);
      expect(lateness.body.success).toBe(true);
      const own = await http(app)
        .put(`/hr/lateness/${MONTH.lateness}`)
        .send({ entries: [{ employeeId: emp.hrMgr, minutes: 120 }] })
        .expect(403);
      expect(own.body.error).toBe(ErrorCode.OWN_PAY_CHANGE);
    });
    const stored = (await http(app).get(`/hr/employees/${emp.hrMgr}`).expect(200)).body.data as Employee;
    expect(stored).toMatchObject({ basicSalary: 1_000_000, workSystem: 'FULL_TIME' });
  });

  it('M2-B — an HR manager with no employee record can’t act on pay: adjust, approve, edit a salary (ACCOUNT_NOT_LINKED)', async () => {
    const run = (await http(app).post('/hr/payroll-runs').send({ month: MONTH.unlinked }).expect(201)).body.data as PayrollRun;
    await as(who.unlinked, async () => {
      for (const res of [
        await http(app)
          .post(`/hr/payroll-runs/${run.id}/adjustments`)
          .send({ employeeId: emp.k1, type: 'ADDITION', amount: 10_000, reason: 'Exam committee' })
          .expect(403),
        await http(app).post(`/hr/payroll-runs/${run.id}/approve`).expect(403),
        await http(app).patch(`/hr/employees/${emp.k1}`).send({ basicSalary: 1_200_000 }).expect(403),
      ]) {
        expect(res.body.error).toBe(ErrorCode.ACCOUNT_NOT_LINKED);
      }
      // Anything else they still do.
      await http(app).patch(`/hr/employees/${emp.k1}`).send({ phone: '01000000003' }).expect(200);
    });
  });

  it('M-3 — nobody moves their own record’s stages or manager (403 OWN_ACCESS_CHANGE)', async () => {
    await as(who.hrMgr, async () => {
      for (const body of [{ stageId: stage.kg }, { otherStageIds: [stage.prep] }, { managerId: emp.hPrim }]) {
        const res = await http(app).patch(`/hr/employees/${emp.hrMgr}`).send(body).expect(403);
        expect(res.body.error).toBe(ErrorCode.OWN_ACCESS_CHANGE);
      }
      // Moving someone else is their job.
      await http(app).patch(`/hr/employees/${emp.deputy}`).send({ otherStageIds: [stage.prep] }).expect(200);
    });
    const stored = (await http(app).get(`/hr/employees/${emp.hrMgr}`).expect(200)).body.data as Employee;
    expect(stored.stage.id).toBe(stage.primary);
  });

  it('L4 — a non-salary editor can’t clear the insured salary by turning insurance off', async () => {
    const insured = (
      await http(app)
        .post('/hr/employees')
        .send({
          nameEn: unique('Insured'),
          nameAr: unique('مؤمن'),
          gender: 'MALE',
          dateOfBirth: '1990-01-01',
          phone: '01000000000',
          hireDate: '2012-09-01',
          stageId: stage.kg,
          departmentId,
          jobTitleId,
          workSystem: 'FULL_TIME',
          basicSalary: 1_000_000,
          insuranceStatus: 'INSURED',
          insuranceNumber: `${Date.now()}`.slice(-9),
          insuranceRegistrationDate: '2012-10-01',
          insuredSalary: 900_000,
        })
        .expect(201)
    ).body.data as Employee;
    employees.push(insured.id);
    await as(who.editor, async () => {
      await http(app).patch(`/hr/employees/${insured.id}`).send({ insuranceStatus: 'NOT_INSURED' }).expect(403);
      // Other edits still work.
      await http(app).patch(`/hr/employees/${insured.id}`).send({ phone: '01000000009' }).expect(200);
    });
    const after = (await http(app).get(`/hr/employees/${insured.id}`).expect(200)).body.data as Employee;
    expect(after).toMatchObject({ insuranceStatus: 'INSURED', insuredSalary: 900_000, phone: '01000000009' });
  });
});
