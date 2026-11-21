import type { INestApplication } from '@nestjs/common';
import {
  BuiltInRole,
  ErrorCode,
  type AuthUser,
  type CreateEmployeeRequest,
  type NotificationTypeKey,
  type PenaltyRecord,
} from '@school-erp/shared';
import { DatabaseService } from '../src/database/database.service';
import { http, unique } from './helpers';
import { createAppAsTestUser, giveRoles } from './helpers/as-test-user';

/*
 * §4 two steps and §3 several stages (owner 2026-11-21) against the real database: where a new
 * penalty starts, who reviews it, who sees it (by the penalty's stage), who is told at each
 * transition, and the refusals (own penalty, the other stage's head, two reviews at once, a lost
 * permission, final penalties, reasons).
 *
 *   Stages: primary, prep, kg (no stage head), solo (one head, removed in a test)
 *   hPrim (primary)            ← primaryHead (Stage head)
 *   hPrep (prep)               ← prepHead (Stage head)
 *   hBoth (primary + prep)     ← bothHead (Stage head of both)
 *   hSolo (solo)               ← soloHead (Stage head)
 *   teacher (primary, also teaches in prep)
 *   k1 (kg)                    hrEmp (primary) ← principal (the HR step)
 *   officer: HR officer, no employee record (records; reviews nothing)
 */

const REVIEW: NotificationTypeKey = 'hr.penalty.awaiting_review';
const HR: NotificationTypeKey = 'hr.penalty.awaiting_approval';
const REJECTED: NotificationTypeKey = 'hr.penalty.rejected';
/** A past month no other suite uses (penalties can't be in the future; no payroll here). */
const MONTH = '2018-03';

describe('Penalties in two steps — stage review, then HR (e2e)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let user: AuthUser;
  const stage = { primary: '', prep: '', kg: '', solo: '' };
  const emp = { hPrim: '', hPrep: '', hBoth: '', hSolo: '', teacher: '', k1: '', hrEmp: '' };
  const who = { primaryHead: '', prepHead: '', bothHead: '', soloHead: '', principal: '', officer: '' };
  let departmentId = '';
  let jobTitleId = '';
  let groupId = '';
  const violations: string[] = [];
  let nextViolation = 0;
  let day = 1;
  const users: string[] = [];
  const roles: string[] = [];
  const employees: string[] = [];

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
  const nextDate = () => `${MONTH}-${String(day++).padStart(2, '0')}`;

  const createEmployee = async (over: Partial<CreateEmployeeRequest>) => {
    const id = (
      await http(app)
        .post('/hr/employees')
        .send({
          nameEn: unique('Two step'),
          nameAr: unique('خطوتان'),
          gender: 'MALE',
          dateOfBirth: '1990-01-01',
          phone: '01000000000',
          hireDate: '2015-09-01',
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

  const record = (employeeId: string, body: Record<string, unknown> = {}) =>
    http(app)
      .post('/hr/penalties')
      .send({ employeeId, violationId: violation(), date: nextDate(), ...body });
  const recordAs = async (userId: string, employeeId: string, body: Record<string, unknown> = {}) =>
    (await as(userId, () => record(employeeId, body).expect(201))).body.data as PenaltyRecord;
  const reviewApprove = (id: string, note?: string) =>
    http(app).post(`/hr/penalties/${id}/review/approve`).send(note ? { note } : {});
  const reviewReject = (id: string, reason: unknown) =>
    http(app).post(`/hr/penalties/${id}/review/reject`).send({ reason });
  const hrApprove = (id: string) => http(app).post(`/hr/penalties/${id}/approve`).send({});
  const hrReject = (id: string, reason: unknown) => http(app).post(`/hr/penalties/${id}/reject`).send({ reason });
  const get = (id: string) => http(app).get(`/hr/penalties/${id}`);

  const itemsAbout = (userId: string, entityId: string, type: NotificationTypeKey) =>
    db.notificationItem.findMany({ where: { recipientKind: 'user', recipientId: userId, type, entityId } });
  const everyoneTold = (entityId: string, type: NotificationTypeKey) =>
    db.notificationItem.findMany({ where: { type, entityId }, select: { recipientId: true, resolution: true } });

  beforeAll(async () => {
    ({ app, user } = await createAppAsTestUser());
    db = app.get(DatabaseService);
    for (const key of Object.keys(stage) as (keyof typeof stage)[]) {
      stage[key] = (await db.stage.create({ data: { nameEn: unique(key), nameAr: unique('مرحلة') } })).id;
    }
    departmentId = (await http(app).post('/hr/departments').send({ nameEn: unique('D'), nameAr: unique('ق') }).expect(201)).body
      .data.id;
    jobTitleId = (
      await http(app).post('/hr/job-titles').send({ nameEn: unique('T'), nameAr: unique('م'), managesPeople: true }).expect(201)
    ).body.data.id;
    groupId = (await http(app).post('/hr/penalty-groups').send({ nameEn: unique('G'), nameAr: unique('ج') }).expect(201)).body
      .data.id as string;
    for (let i = 0; i < 40; i++) {
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
    emp.hBoth = await createEmployee({ stageId: stage.primary, otherStageIds: [stage.prep] });
    emp.hSolo = await createEmployee({ stageId: stage.solo });
    emp.teacher = await createEmployee({ stageId: stage.primary, otherStageIds: [stage.prep] });
    emp.k1 = await createEmployee({ stageId: stage.kg });
    emp.hrEmp = await createEmployee({ stageId: stage.primary });
    who.primaryHead = await newUser('primary-head', [BuiltInRole.STAGE_HEAD], emp.hPrim);
    who.prepHead = await newUser('prep-head', [BuiltInRole.STAGE_HEAD], emp.hPrep);
    who.bothHead = await newUser('both-head', [BuiltInRole.STAGE_HEAD], emp.hBoth);
    who.soloHead = await newUser('solo-head', [BuiltInRole.STAGE_HEAD], emp.hSolo);
    who.principal = await newUser('principal', [BuiltInRole.PRINCIPAL], emp.hrEmp);
    who.officer = await newUser('officer', [BuiltInRole.HR_OFFICER]);
  });

  afterAll(async () => {
    await db.notification.deleteMany({ where: { recipientKind: 'user', recipientId: { in: users } } });
    await db.penaltyRecord.deleteMany({ where: { employeeId: { in: employees } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.role.deleteMany({ where: { id: { in: roles } } });
    await db.employeeStage.deleteMany({ where: { employeeId: { in: employees } } });
    await db.employee.deleteMany({ where: { id: { in: employees } } });
    await db.violation.deleteMany({ where: { groupId } });
    await db.penaltyGroup.deleteMany({ where: { id: groupId } });
    await db.department.deleteMany({ where: { id: departmentId } });
    await db.jobTitle.deleteMany({ where: { id: jobTitleId } });
    await db.stage.deleteMany({ where: { id: { in: Object.values(stage) } } });
    await app.close();
  });

  describe('recording: where it starts and who is told', () => {
    it('in a stage with stage heads → Pending stage review; only those heads are told, not HR, not the other stage', async () => {
      const p = await recordAs(who.officer, emp.teacher, { stageId: stage.primary });
      expect(p).toMatchObject({ status: 'PENDING_REVIEW', reviewSkip: null, stage: { id: stage.primary } });
      expect(await itemsAbout(who.primaryHead, p.id, REVIEW)).toHaveLength(1);
      expect(await itemsAbout(who.bothHead, p.id, REVIEW)).toHaveLength(1);
      expect(await itemsAbout(who.prepHead, p.id, REVIEW)).toHaveLength(0);
      expect(await itemsAbout(who.principal, p.id, HR)).toHaveLength(0);
      // The recorder is never told about their own recording.
      expect(await itemsAbout(who.officer, p.id, REVIEW)).toHaveLength(0);
    });

    it('several stages: the stage is required, and must be one of the employee’s', async () => {
      const none = await as(who.officer, () => record(emp.teacher).expect(400));
      expect(none.body.error).toBe(ErrorCode.PENALTY_STAGE_REQUIRED);
      const wrong = await as(who.officer, () => record(emp.teacher, { stageId: stage.kg }).expect(400));
      expect(wrong.body.error).toBe(ErrorCode.PENALTY_STAGE_INVALID);
      // One stage: filled in by itself.
      expect((await recordAs(who.officer, emp.k1)).stage.id).toBe(stage.kg);
    });

    it('the recorder is a stage head of the penalty’s stage → straight to Waiting for HR (RECORDER_IS_HEAD); HR is told', async () => {
      const p = await recordAs(who.primaryHead, emp.teacher, { stageId: stage.primary });
      expect(p).toMatchObject({ status: 'WAITING_HR', reviewSkip: 'RECORDER_IS_HEAD' });
      expect(await itemsAbout(who.principal, p.id, HR)).toHaveLength(1);
      expect(await itemsAbout(who.bothHead, p.id, REVIEW)).toHaveLength(0);
    });

    it('no stage head → straight to Waiting for HR (NO_STAGE_HEAD)', async () => {
      const p = await recordAs(who.officer, emp.k1);
      expect(p).toMatchObject({ status: 'WAITING_HR', reviewSkip: 'NO_STAGE_HEAD' });
    });

    it('penalty against a stage head (edge case 1) → Waiting for HR (EMPLOYEE_IS_HEAD), also when they record it themselves', async () => {
      expect(await recordAs(who.officer, emp.hPrim)).toMatchObject({ status: 'WAITING_HR', reviewSkip: 'EMPLOYEE_IS_HEAD' });
      expect(await recordAs(who.primaryHead, emp.hPrim)).toMatchObject({ status: 'WAITING_HR', reviewSkip: 'EMPLOYEE_IS_HEAD' });
    });
  });

  describe('who sees and acts on it: the penalty’s stage (edge cases 11, 12)', () => {
    it('the other stage’s head: not in the list or the search, the detail is 404, the actions 403', async () => {
      const p = await recordAs(who.officer, emp.teacher, { stageId: stage.primary });
      await as(who.prepHead, async () => {
        const list = (await http(app).get('/hr/penalties').query({ month: MONTH, limit: 100 }).expect(200)).body
          .data as PenaltyRecord[];
        expect(list.map((r) => r.id)).not.toContain(p.id);
        const search = (await http(app).get('/hr/penalties').query({ search: p.employee.nameEn }).expect(200)).body
          .data as PenaltyRecord[];
        expect(search.map((r) => r.id)).not.toContain(p.id);
        await get(p.id).expect(404);
        await reviewApprove(p.id).expect(403);
        await reviewReject(p.id, 'Not mine').expect(403);
      });
      // Never told either.
      expect(await itemsAbout(who.prepHead, p.id, REVIEW)).toHaveLength(0);
    });

    it('a stage head of two stages sees the penalties of both; each single-stage head only theirs', async () => {
      const inPrimary = await recordAs(who.officer, emp.teacher, { stageId: stage.primary });
      const inPrep = await recordAs(who.officer, emp.teacher, { stageId: stage.prep });
      const ids = async (userId: string) =>
        as(userId, async () =>
          ((await http(app).get('/hr/penalties').query({ month: MONTH, limit: 100 }).expect(200)).body.data as PenaltyRecord[]).map(
            (r) => r.id,
          ),
        );
      expect(await ids(who.bothHead)).toEqual(expect.arrayContaining([inPrimary.id, inPrep.id]));
      expect(await ids(who.primaryHead)).toContain(inPrimary.id);
      expect(await ids(who.primaryHead)).not.toContain(inPrep.id);
      expect(await ids(who.prepHead)).toContain(inPrep.id);
      expect(await ids(who.prepHead)).not.toContain(inPrimary.id);
      // The stage filter finds them by where they happened.
      await as(who.bothHead, async () => {
        const prepOnly = (await http(app).get('/hr/penalties').query({ month: MONTH, stageId: stage.prep, limit: 100 }).expect(200))
          .body.data as PenaltyRecord[];
        expect(prepOnly.every((r) => r.stage.id === stage.prep)).toBe(true);
      });
    });

    it('a multi-stage employee is found under each stage (employees list), counted once by main stage', async () => {
      const prepList = (await http(app).get('/hr/employees').query({ stageId: stage.prep, limit: 100 }).expect(200)).body.data as {
        id: string;
      }[];
      expect(prepList.map((e) => e.id)).toContain(emp.teacher);
      // The prep head sees them too (own_stage covers any of their stages).
      await as(who.prepHead, () => http(app).get(`/hr/employees/${emp.teacher}`).expect(200));
    });
  });

  describe('the stage review', () => {
    it('approve → Waiting for HR with the note; every head’s item reads approved; HR told once; the reviewer and the employee not', async () => {
      const p = await recordAs(who.officer, emp.teacher, { stageId: stage.primary });
      const res = await as(who.primaryHead, () => reviewApprove(p.id, '  Checked  ').expect(200));
      expect(res.body.data).toMatchObject({ status: 'WAITING_HR', reviewNote: 'Checked', reviewedBy: { id: who.primaryHead } });
      expect((await everyoneTold(p.id, REVIEW)).every((i) => i.resolution === 'approved')).toBe(true);
      expect(await itemsAbout(who.principal, p.id, HR)).toHaveLength(1);
      expect(await itemsAbout(who.primaryHead, p.id, HR)).toHaveLength(0);
      // The audit entry.
      expect(await db.auditEntry.count({ where: { action: 'hr.penalty.review', entityId: p.id } })).toBe(1);
    });

    it('reject: a reason is required — empty or blank 400, over 1,000 characters 400, Arabic fine; the recorder is told, once', async () => {
      const p = await recordAs(who.officer, emp.teacher, { stageId: stage.primary });
      await as(who.primaryHead, async () => {
        await reviewReject(p.id, '').expect(400);
        await reviewReject(p.id, '    ').expect(400);
        await reviewReject(p.id, 'x'.repeat(1001)).expect(400);
        const res = await reviewReject(p.id, ' كان في مهمة رسمية ').expect(200);
        expect(res.body.data).toMatchObject({ status: 'REJECTED', rejectedStep: 'REVIEW', rejectionReason: 'كان في مهمة رسمية' });
      });
      expect(await itemsAbout(who.officer, p.id, REJECTED)).toHaveLength(1);
      expect(await itemsAbout(who.primaryHead, p.id, REJECTED)).toHaveLength(0);
      expect((await everyoneTold(p.id, REVIEW)).every((i) => i.resolution === 'rejected')).toBe(true);
      expect(await db.auditEntry.count({ where: { action: 'hr.penalty.reject', entityId: p.id } })).toBe(1);
    });

    it('a stage head can’t review their own penalty (edge case 1): 403 PENALTY_OWN', async () => {
      // hBoth heads primary and prep: their own penalty skips the review (EMPLOYEE_IS_HEAD) …
      const p = await recordAs(who.officer, emp.hBoth, { stageId: stage.prep });
      expect(p).toMatchObject({ status: 'WAITING_HR', reviewSkip: 'EMPLOYEE_IS_HEAD' });
      // … and acting on it is refused as their own, before anything else.
      const own = await as(who.bothHead, () => reviewApprove(p.id).expect(403));
      expect(own.body.error).toBe(ErrorCode.PENALTY_OWN);
      expect(await itemsAbout(who.bothHead, p.id, HR)).toHaveLength(0);
    });

    it('two reviews at once (edge case 5): exactly one wins; the other gets 409 with the fresh status', async () => {
      const p = await recordAs(who.officer, emp.teacher, { stageId: stage.primary });
      // Both as the test user (System admin: reviews school-wide) — one signed-in user for both
      // requests, so nothing but the database decides who wins.
      const [a, b] = await Promise.all([reviewApprove(p.id), reviewReject(p.id, 'Not on that day')]);
      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual([200, 409]);
      const loser = a.status === 409 ? a : b;
      expect([ErrorCode.PENALTY_WRONG_STEP, ErrorCode.PENALTY_REJECTED]).toContain(loser.body.error);
      const now = (await get(p.id).expect(200)).body.data as PenaltyRecord;
      expect(['WAITING_HR', 'REJECTED']).toContain(now.status);
    });

    it('the stage head is removed while it waits (edge case 3): HR may decide it directly', async () => {
      const soloTeacher = await createEmployee({ stageId: stage.solo });
      const p = await recordAs(who.officer, soloTeacher);
      expect(p.status).toBe('PENDING_REVIEW');
      await db.userRoleAssignment.deleteMany({ where: { userId: who.soloHead } });
      expect(((await get(p.id).expect(200)).body.data as PenaltyRecord).hrMayDecide).toBe(true);
      const res = await as(who.principal, () => hrApprove(p.id).expect(200));
      expect(res.body.data.status).toBe('APPROVED');
      await giveRoles(db, who.soloHead, [BuiltInRole.STAGE_HEAD]);
    });

    it('review permission revoked mid-flow (edge case 13): refused at once', async () => {
      const role = (
        await db.role.create({
          data: {
            key: unique('custom_two_step'),
            nameEn: unique('Reviewer'),
            nameAr: unique('مراجع'),
            permissions: {
              create: [
                { permissionKey: 'hr.penalties.review', scope: 'own_stage' },
                { permissionKey: 'hr.penalties.view', scope: 'own_stage' },
              ],
            },
          },
          select: { id: true, key: true },
        })
      );
      roles.push(role.id);
      const reviewer = await newUser('reviewer', [role.key], await createEmployee({ stageId: stage.primary }));
      const p = await recordAs(who.officer, emp.teacher, { stageId: stage.primary });
      await db.rolePermission.deleteMany({ where: { roleId: role.id, permissionKey: 'hr.penalties.review' } });
      await as(reviewer, () => reviewApprove(p.id).expect(403));
    });
  });

  describe('the HR step', () => {
    it('approve fixes the level; reject needs a reason; the HR approver can’t act on their own penalty (edge case 2)', async () => {
      const p = await recordAs(who.primaryHead, emp.teacher, { stageId: stage.primary });
      const ok = await as(who.principal, () => hrApprove(p.id).expect(200));
      expect(ok.body.data).toMatchObject({ status: 'APPROVED', approvedBy: { id: who.principal } });

      const q = await recordAs(who.primaryHead, emp.teacher, { stageId: stage.primary });
      await as(who.principal, () => hrReject(q.id, ' ').expect(400));
      const rejected = await as(who.principal, () => hrReject(q.id, 'No witness').expect(200));
      expect(rejected.body.data).toMatchObject({ status: 'REJECTED', rejectedStep: 'HR', rejectionReason: 'No witness' });
      expect(await itemsAbout(who.primaryHead, q.id, REJECTED)).toHaveLength(1);

      const own = await recordAs(who.officer, emp.hrEmp);
      const refused = await as(who.principal, () => hrApprove(own.id).expect(403));
      expect(refused.body.error).toBe(ErrorCode.PENALTY_OWN);
      await as(who.principal, () => hrReject(own.id, 'Mine').expect(403));
    });

    it('not before the stage review: HR on a Pending stage review penalty with a head → 409', async () => {
      const p = await recordAs(who.officer, emp.teacher, { stageId: stage.primary });
      const res = await as(who.principal, () => hrApprove(p.id).expect(409));
      expect(res.body.error).toBe(ErrorCode.PENALTY_WRONG_STEP);
    });

    it('date order (edge case 9): an earlier one still at the stage review blocks the later one, naming it', async () => {
      const v = violation();
      const early = `${MONTH}-${String(day++).padStart(2, '0')}`;
      const late = `${MONTH}-${String(day++).padStart(2, '0')}`;
      await as(who.officer, () =>
        http(app).post('/hr/penalties').send({ employeeId: emp.teacher, stageId: stage.primary, violationId: v, date: early }).expect(201),
      );
      const later = (
        await as(who.primaryHead, () =>
          http(app).post('/hr/penalties').send({ employeeId: emp.teacher, stageId: stage.primary, violationId: v, date: late }).expect(201),
        )
      ).body.data as PenaltyRecord;
      const res = await as(who.principal, () => hrApprove(later.id).expect(409));
      expect(res.body.error).toBe(ErrorCode.PENALTY_EARLIER_PENDING);
      expect(res.body.params).toMatchObject({ date: early });
    });

    it('levels (edge case 10): a rejected penalty never counts; levels count across stages', async () => {
      const v = violation();
      const d1 = `${MONTH}-${String(day++).padStart(2, '0')}`;
      const d2 = `${MONTH}-${String(day++).padStart(2, '0')}`;
      const d3 = `${MONTH}-${String(day++).padStart(2, '0')}`;
      const post = (userId: string, date: string, stageId: string) =>
        as(userId, () =>
          http(app).post('/hr/penalties').send({ employeeId: emp.teacher, stageId, violationId: v, date }).expect(201),
        ).then((r) => r.body.data as PenaltyRecord);
      const first = await post(who.primaryHead, d1, stage.primary);
      await as(who.principal, () => hrReject(first.id, 'Wrong day').expect(200));
      const second = await post(who.primaryHead, d2, stage.primary);
      expect((await as(who.principal, () => hrApprove(second.id).expect(200))).body.data.level).toBe(1);
      // In prep now: the same person and violation, so level 2.
      const third = await post(who.prepHead, d3, stage.prep);
      expect((await as(who.principal, () => hrApprove(third.id).expect(200))).body.data.level).toBe(2);
    });
  });

  describe('final penalties and cancel (edge case 6)', () => {
    it('cancel while Pending stage review or Waiting for HR; then every action is refused (409)', async () => {
      const inReview = await recordAs(who.officer, emp.teacher, { stageId: stage.primary });
      await http(app).post(`/hr/penalties/${inReview.id}/cancel`).send({ reason: 'Wrong person' }).expect(200);
      expect((await everyoneTold(inReview.id, REVIEW)).every((i) => i.resolution === 'cancelled')).toBe(true);
      await as(who.primaryHead, () => reviewApprove(inReview.id).expect(409));
      await as(who.principal, () => hrApprove(inReview.id).expect(409));

      const atHr = await recordAs(who.primaryHead, emp.teacher, { stageId: stage.primary });
      await http(app).post(`/hr/penalties/${atHr.id}/cancel`).send({ reason: 'Wrong person' }).expect(200);
      await as(who.principal, () => hrReject(atHr.id, 'x').expect(409));
    });

    it('a rejected penalty can’t be cancelled, approved or reviewed; an approved one can’t be reviewed or rejected', async () => {
      const r = await recordAs(who.primaryHead, emp.teacher, { stageId: stage.primary });
      await as(who.principal, () => hrReject(r.id, 'No witness').expect(200));
      const cancel = await http(app).post(`/hr/penalties/${r.id}/cancel`).send({ reason: 'x' }).expect(409);
      expect(cancel.body.error).toBe(ErrorCode.PENALTY_REJECTED);
      await as(who.principal, () => hrApprove(r.id).expect(409));

      const a = await recordAs(who.primaryHead, emp.teacher, { stageId: stage.primary });
      await as(who.principal, () => hrApprove(a.id).expect(200));
      await as(who.principal, () => hrReject(a.id, 'x').expect(409));
      await as(who.bothHead, () => reviewApprove(a.id).expect(409));
    });
  });
});
