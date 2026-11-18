import type { INestApplication } from '@nestjs/common';
import {
  BuiltInRole,
  ErrorCode,
  type AuthUser,
  type CreateEmployeeRequest,
  type NotificationItem,
  type NotificationTypeKey,
  type PayrollRun,
  type PenaltyRecord,
} from '@school-erp/shared';
import { DatabaseService } from '../src/database/database.service';
import { http, unique } from './helpers';
import { createAppAsTestUser, giveRoles } from './helpers/as-test-user';

/*
 * HR's approval notifications (§11, plan docs/plans/2026-11-18-notifications-plan.md → N2 edge
 * cases) against the real database: who is told about a pending penalty (permission + stage /
 * team scope, the actor left out), resolve for everyone on approve / cancel, a refused recording
 * telling no one, the read re-check after a lost permission or a stage move, and payroll's
 * "ready to approve" (no pending penalties, one per calculation, the net only for readers who see
 * the run's totals).
 *
 *   hPrim (Primary)  ← linked to the Stage head (records; can't approve)
 *   p2 (Primary, no manager) ← linked to the Primary approver (custom role, own_stage)
 *   hPrep (Prep)     ← linked to the Preparatory approver (custom role, own_stage)
 *   boss  (Prep)     ← linked to the team approver (custom role, own_team)
 *   p1 (Primary, boss's team)   q1 (Prep, no manager)
 *
 * Users holding the key from other suites receive these too, so checks are per user of this
 * suite and per penalty (an item's link carries its penalty id).
 */

const PENALTY: NotificationTypeKey = 'hr.penalty.awaiting_approval';
const READY: NotificationTypeKey = 'hr.payroll.ready_to_approve';
/** Months this suite records penalties and payroll runs in (past: penalties can't be future). */
const PENALTY_MONTH = '2019-04';
const READY_MONTH = '2019-05';
const BLOCKED_MONTH = '2019-06';

describe('HR approval notifications — N2 (e2e)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let user: AuthUser;
  let primary: string;
  let prep: string;
  let departmentId: string;
  let jobTitleId: string;
  let violationId: string;
  let oncePerDayViolationId: string;
  const emp = { hPrim: '', hPrep: '', boss: '', p1: '', p2: '', q1: '' };
  const who = { stageHead: '', primaryApprover: '', prepApprover: '', teamApprover: '' };
  const users: string[] = [];
  const roles: string[] = [];
  const employees: string[] = [];
  let day = 1;

  /** Runs `fn` with the API signed in as `id`. */
  async function as<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const me = user.id;
    user.id = id;
    try {
      return await fn();
    } finally {
      user.id = me;
    }
  }

  const createEmployee = async (over: Partial<CreateEmployeeRequest>) => {
    const id = (
      await http(app)
        .post('/hr/employees')
        .send({
          nameEn: unique('Notified'),
          nameAr: unique('مُبلَّغ'),
          gender: 'MALE',
          dateOfBirth: '1990-01-01',
          phone: '01000000000',
          hireDate: '2015-09-01',
          stageId: primary,
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
        data: {
          email: `${unique(label)}@example.test`,
          name: unique(label),
          passwordHash: 'x',
          employeeId,
        },
        select: { id: true },
      })
    ).id;
    users.push(id);
    await giveRoles(db, id, roleKeys);
    return id;
  };

  /** A custom role with these keys at a scope. */
  const customRole = async (scope: 'all' | 'own_stage' | 'own_team', ...keys: string[]) => {
    const role = await db.role.create({
      data: {
        key: unique('custom_e2e_n2'),
        nameEn: unique('N2 role'),
        nameAr: unique('دور'),
        permissions: { create: keys.map((permissionKey) => ({ permissionKey, scope })) },
      },
      select: { id: true, key: true },
    });
    roles.push(role.id);
    return role;
  };

  /**
   * A fresh day of a past month no payroll test uses (their months must have no pending penalty),
   * so a once-per-day violation never collides across tests.
   */
  const nextDate = (month = PENALTY_MONTH) => `${month}-${String(day++).padStart(2, '0')}`;

  const record = (employeeId: string, date = nextDate(), violation = violationId) =>
    http(app).post('/hr/penalties').send({ employeeId, violationId: violation, date });
  const recordOk = async (employeeId: string, date?: string) =>
    (await record(employeeId, date).expect(201)).body.data as PenaltyRecord;
  const approve = (id: string) => http(app).post(`/hr/penalties/${id}/approve`).expect(200);
  const cancel = (id: string) =>
    http(app)
      .post(`/hr/penalties/${id}/cancel`)
      .send({ reason: 'Recorded by mistake' })
      .expect(200);

  /** The items stored for a user about a record (whatever their group). */
  const itemsAbout = (userId: string, entityId: string, type: string = PENALTY) =>
    db.notificationItem.findMany({
      where: { recipientKind: 'user', recipientId: userId, type, entityId },
      orderBy: { createdAt: 'asc' },
    });

  /** The user's notifications of a type, through the bell API (with the read re-check, N11). */
  const bell = (userId: string, type: string = PENALTY) =>
    as(userId, async () =>
      (
        (await http(app).get('/notifications?limit=50').expect(200)).body.data as NotificationItem[]
      ).filter((n) => n.type === type),
    );
  const unread = (userId: string) =>
    as(
      userId,
      async () =>
        (await http(app).get('/notifications/unread-count').expect(200)).body.data.count as number,
    );
  /** The bell item about one penalty, if the user may still see it. */
  const bellItem = async (userId: string, penaltyId: string) =>
    (await bell(userId))
      .flatMap((n) => n.items.map((item) => ({ n, item })))
      .find(({ item }) => item.link?.query?.penalty === penaltyId);

  beforeAll(async () => {
    ({ app, user } = await createAppAsTestUser());
    db = app.get(DatabaseService);
    primary = (
      await db.stage.create({ data: { nameEn: unique('Primary'), nameAr: unique('ابتدائي') } })
    ).id;
    prep = (await db.stage.create({ data: { nameEn: unique('Prep'), nameAr: unique('إعدادي') } }))
      .id;
    departmentId = (
      await http(app)
        .post('/hr/departments')
        .send({ nameEn: unique('D'), nameAr: unique('ق') })
        .expect(201)
    ).body.data.id;
    jobTitleId = (
      await http(app)
        .post('/hr/job-titles')
        .send({ nameEn: unique('Teacher'), nameAr: unique('معلم'), managesPeople: true })
        .expect(201)
    ).body.data.id;
    const groupId = (
      await http(app)
        .post('/hr/penalty-groups')
        .send({ nameEn: unique('G'), nameAr: unique('ج') })
        .expect(201)
    ).body.data.id as string;
    const violation = async (oncePerDay: boolean) =>
      (
        await http(app)
          .post(`/hr/penalty-groups/${groupId}/violations`)
          .send({
            nameEn: unique('Late'),
            nameAr: unique('تأخير'),
            oncePerDay,
            levels: [{ level: 1, action: 'NOTICE' }],
          })
          .expect(201)
      ).body.data.id as string;
    violationId = await violation(false);
    oncePerDayViolationId = await violation(true);

    emp.hPrim = await createEmployee({ stageId: primary });
    emp.hPrep = await createEmployee({ stageId: prep });
    emp.boss = await createEmployee({ stageId: prep });
    emp.p1 = await createEmployee({ stageId: primary, managerId: emp.boss });
    emp.p2 = await createEmployee({ stageId: primary });
    emp.q1 = await createEmployee({ stageId: prep });

    const stageApprover = await customRole(
      'own_stage',
      'hr.penalties.approve',
      'hr.penalties.view',
    );
    const teamApprover = await customRole('own_team', 'hr.penalties.approve', 'hr.penalties.view');
    who.stageHead = await newUser('stage-head', [BuiltInRole.STAGE_HEAD], emp.hPrim);
    who.primaryApprover = await newUser('primary-approver', [stageApprover.key], emp.p2);
    who.prepApprover = await newUser('prep-approver', [stageApprover.key], emp.hPrep);
    who.teamApprover = await newUser('team-approver', [teamApprover.key], emp.boss);
  });

  afterAll(async () => {
    await db.notification.deleteMany({
      where: { recipientKind: 'user', recipientId: { in: users } },
    });
    await db.notificationPreference.deleteMany({ where: { userId: { in: users } } });
    await db.payrollRun.deleteMany({ where: { month: { in: [READY_MONTH, BLOCKED_MONTH] } } });
    await db.penaltyRecord.deleteMany({ where: { employeeId: { in: employees } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.role.deleteMany({ where: { id: { in: roles } } });
    await app.close();
  });

  describe('a penalty waiting for approval', () => {
    it('reaches the approvers whose scope covers the employee — not the recorder, not another stage (edges 1, 2)', async () => {
      const hrManager = await newUser('hr-manager', [BuiltInRole.HR_MANAGER]);
      const principal = await newUser('principal', [BuiltInRole.PRINCIPAL]);
      const penalty = await as(who.stageHead, () => recordOk(emp.p1));

      for (const told of [hrManager, principal, who.primaryApprover, who.teamApprover]) {
        expect(await itemsAbout(told, penalty.id)).toHaveLength(1);
      }
      // Another stage's approver, and the recorder (who can't approve anyway), aren't told.
      expect(await itemsAbout(who.prepApprover, penalty.id)).toHaveLength(0);
      expect(await itemsAbout(who.stageHead, penalty.id)).toHaveLength(0);

      // The team approver gets their team only: p2 has no manager.
      const p2Penalty = await as(who.stageHead, () => recordOk(emp.p2));
      expect(await itemsAbout(who.teamApprover, p2Penalty.id)).toHaveLength(0);
      expect(await itemsAbout(who.primaryApprover, p2Penalty.id)).toHaveLength(1);

      // The values of the sentence, never a sentence (N3); the link opens the penalty.
      const [item] = await itemsAbout(principal, penalty.id);
      expect(item?.params).toEqual({
        employee: { en: penalty.employee.nameEn, ar: penalty.employee.nameAr },
        violation: { en: penalty.violation.nameEn, ar: penalty.violation.nameAr },
        level: 1,
      });
      expect(item?.dedupeKey).toBe(`penalty:${penalty.id}`);
      expect((await bellItem(principal, penalty.id))?.item.link).toEqual({
        screen: 'penalties',
        query: { penalty: penalty.id },
      });
    });

    it('the HR manager records one → the principal is told, the HR manager isn’t (edge 3)', async () => {
      const hrManager = await newUser('hr-manager', [BuiltInRole.HR_MANAGER]);
      const principal = await newUser('principal', [BuiltInRole.PRINCIPAL]);
      const penalty = await as(hrManager, () => recordOk(emp.q1));
      expect(await itemsAbout(principal, penalty.id)).toHaveLength(1);
      expect(await itemsAbout(hrManager, penalty.id)).toHaveLength(0);
    });

    it('approved by the principal → resolved for everyone, "Approved by …", out of the count; nothing new (edge 4)', async () => {
      const hrManager = await newUser('hr-manager', [BuiltInRole.HR_MANAGER]);
      const principal = await newUser('principal', [BuiltInRole.PRINCIPAL]);
      const penalty = await as(who.stageHead, () => recordOk(emp.p1));
      expect(await unread(hrManager)).toBe(1);

      await as(principal, () => approve(penalty.id));

      const seen = await bellItem(hrManager, penalty.id);
      expect(seen?.item.resolved).toMatchObject({ resolution: 'approved' });
      const principalName = (await db.user.findUniqueOrThrow({ where: { id: principal } })).name;
      expect(seen?.item.resolved?.by).toEqual({ en: principalName, ar: principalName });
      expect(seen?.n.openCount).toBe(0);
      expect(seen?.n.resolved).not.toBeNull();
      expect(await unread(hrManager)).toBe(0);
      // Every recipient's item is resolved; approving sent nothing new.
      const all = await db.notificationItem.findMany({
        where: { type: PENALTY, entityId: penalty.id },
      });
      expect(all.length).toBeGreaterThan(0);
      expect(all.every((i) => i.resolution === 'approved' && i.resolvedAt !== null)).toBe(true);
      expect(await itemsAbout(principal, penalty.id)).toHaveLength(1);
    });

    it('cancelled while pending → resolved as cancelled; an approved one cancelled later → nothing (edges 5, 6)', async () => {
      const principal = await newUser('principal', [BuiltInRole.PRINCIPAL]);
      const pending = await as(who.stageHead, () => recordOk(emp.p2));
      await cancel(pending.id);
      const [item] = await itemsAbout(principal, pending.id);
      expect(item).toMatchObject({ resolution: 'cancelled' });
      expect(item?.resolvedAt).not.toBeNull();

      const approved = await as(who.stageHead, () => recordOk(emp.p2));
      await as(principal, () => approve(approved.id));
      const before = await itemsAbout(who.primaryApprover, approved.id);
      await cancel(approved.id);
      const after = await itemsAbout(who.primaryApprover, approved.id);
      // Still the approval, untouched; no new item.
      expect(after).toEqual(before);
      expect(after[0]?.resolution).toBe('approved');
    });

    it('a refused recording tells no one: once per day, an inactive employee (edge 7)', async () => {
      const principal = await newUser('principal', [BuiltInRole.PRINCIPAL]);
      const date = nextDate();
      await as(who.stageHead, () => record(emp.p1, date, oncePerDayViolationId).expect(201));
      const once = await as(who.stageHead, () =>
        record(emp.p1, date, oncePerDayViolationId).expect(409),
      );
      expect(once.body.error).toBe(ErrorCode.VIOLATION_ONCE_PER_DAY);

      const leaver = await createEmployee({ stageId: primary });
      await http(app).post(`/hr/employees/${leaver}/deactivate`).expect(200);
      await record(leaver).expect(409);

      // Only the first, accepted recording reached the principal.
      expect(
        await db.notificationItem.count({ where: { recipientId: principal, type: PENALTY } }),
      ).toBe(1);
    });

    it('an approver who loses hr.penalties.approve: theirs leave the list and the count; new ones skip them (edge 8)', async () => {
      const role = await customRole('all', 'hr.penalties.approve');
      const approver = await newUser('losing-approver', [role.key]);
      const penalty = await as(who.stageHead, () => recordOk(emp.p1));
      expect(await bellItem(approver, penalty.id)).toBeDefined();
      expect(await unread(approver)).toBe(1);

      await db.rolePermission.deleteMany({ where: { roleId: role.id } });

      expect(await bellItem(approver, penalty.id)).toBeUndefined();
      expect(await unread(approver)).toBe(0);
      // The row stays (N11); nothing new reaches them.
      expect(await itemsAbout(approver, penalty.id)).toHaveLength(1);
      const later = await as(who.stageHead, () => recordOk(emp.p1));
      expect(await itemsAbout(approver, later.id)).toHaveLength(0);
    });

    it('the employee moves stage → the old stage’s approver no longer sees it; the new one isn’t told retroactively (edge 9)', async () => {
      const mover = await createEmployee({ stageId: primary });
      const penalty = await as(who.stageHead, () => recordOk(mover));
      expect(await bellItem(who.primaryApprover, penalty.id)).toBeDefined();

      await db.employee.update({ where: { id: mover }, data: { stageId: prep } });

      expect(await bellItem(who.primaryApprover, penalty.id)).toBeUndefined();
      expect(await itemsAbout(who.prepApprover, penalty.id)).toHaveLength(0);
    });

    it('deactivating the employee leaves the pending penalty’s notification open (edge 10)', async () => {
      const principal = await newUser('principal', [BuiltInRole.PRINCIPAL]);
      const leaver = await createEmployee({ stageId: primary });
      const penalty = await as(who.stageHead, () => recordOk(leaver));
      await http(app).post(`/hr/employees/${leaver}/deactivate`).expect(200);
      const seen = await bellItem(principal, penalty.id);
      expect(seen?.item.resolved).toBeNull();
      expect(await unread(principal)).toBe(1);
    });

    it('three recorded before the approver opens the bell → one notification of three; approving lowers the open count; the last resolves it (edge 17)', async () => {
      const principal = await newUser('principal', [BuiltInRole.PRINCIPAL]);
      const three = [
        await as(who.stageHead, () => recordOk(emp.p1)),
        await as(who.stageHead, () => recordOk(emp.p2)),
        // q1 is outside the stage head's stage: recorded by the test user.
        await recordOk(emp.q1),
      ];
      const mine = await bell(principal);
      expect(mine).toHaveLength(1);
      expect(mine[0]?.items).toHaveLength(3);
      expect(mine[0]?.openCount).toBe(3);
      expect(await unread(principal)).toBe(1);

      await approve(three[0].id);
      expect((await bell(principal))[0]?.openCount).toBe(2);
      await approve(three[1].id);
      await approve(three[2].id);
      const [done] = await bell(principal);
      expect(done?.openCount).toBe(0);
      expect(done?.resolved).not.toBeNull();
      expect(await unread(principal)).toBe(0);
    });

    it('can’t be turned off: a preference PUT turning it off → 409 (edge 18)', async () => {
      const principal = await newUser('principal', [BuiltInRole.PRINCIPAL]);
      for (const type of [PENALTY, READY]) {
        const res = await as(principal, () =>
          http(app)
            .put('/notifications/preferences')
            .send({ items: [{ type, channel: 'in_app', enabled: false }] }),
        );
        expect(res.status).toBe(409);
        expect(res.body.error).toBe(ErrorCode.NOTIFICATION_TYPE_REQUIRED);
      }
    });
  });

  describe('payroll ready to approve', () => {
    const createRun = (month: string) =>
      http(app).post('/hr/payroll-runs').send({ month }).expect(201);
    const recalculate = async (id: string) =>
      (await http(app).post(`/hr/payroll-runs/${id}/recalculate`).expect(200)).body
        .data as PayrollRun;
    const readyItems = (userId: string, runId: string) => itemsAbout(userId, runId, READY);

    it('not while the month has pending penalties; the recalculate after the last approval sends it (edge 11)', async () => {
      const hrManager = await newUser('hr-manager', [BuiltInRole.HR_MANAGER]);
      const penalty = await recordOk(emp.p1, `${BLOCKED_MONTH}-27`);
      const run = (await createRun(BLOCKED_MONTH)).body.data as PayrollRun;
      expect(await readyItems(hrManager, run.id)).toHaveLength(0);

      await approve(penalty.id);
      expect(await readyItems(hrManager, run.id)).toHaveLength(0);
      const recalculated = await recalculate(run.id);
      const items = await readyItems(hrManager, run.id);
      expect(items).toHaveLength(1);
      expect(items[0]?.dedupeKey).toBe(
        `payroll_ready:${BLOCKED_MONTH}:${recalculated.calculatedAt}`,
      );
      expect(items[0]?.params).toMatchObject({
        month: BLOCKED_MONTH,
        count: recalculated.totals.employees,
      });
    });

    it('one "ready" per calculation; a penalty in the month resolves it; approving resolves it as approved (edges 12, 13, 14, 15)', async () => {
      const hrManager = await newUser('hr-manager', [BuiltInRole.HR_MANAGER]);
      // Approves payroll but doesn't see its totals: no net in their sentence (R7).
      const blindRole = await customRole('all', 'hr.payroll.approve');
      const blind = await newUser('blind-approver', [blindRole.key]);

      const run = (await createRun(READY_MONTH)).body.data as PayrollRun;
      const [first] = await readyItems(hrManager, run.id);
      expect(first?.resolvedAt).toBeNull();
      expect(first?.params).toEqual({
        month: READY_MONTH,
        count: run.totals.employees,
        net: run.totals.net,
      });
      const [blindFirst] = await readyItems(blind, run.id);
      expect(blindFirst?.params).toEqual({ month: READY_MONTH, count: run.totals.employees });
      // The creator (the test user) isn't told about their own calculation.
      expect(await readyItems(user.id, run.id)).toHaveLength(0);

      // Recalculated with nothing pending: a new "ready", the first one done (edge 12).
      await recalculate(run.id);
      let items = await readyItems(hrManager, run.id);
      expect(items).toHaveLength(2);
      expect(items[0]).toMatchObject({ resolution: 'done' });
      expect(items[1]?.resolvedAt).toBeNull();
      expect(items[1]?.dedupeKey).not.toBe(items[0]?.dedupeKey);

      // A penalty recorded in the month: not ready any more (edge 13).
      const penalty = await recordOk(emp.q1, `${READY_MONTH}-15`);
      items = await readyItems(hrManager, run.id);
      expect(items.every((i) => i.resolution === 'done')).toBe(true);
      await approve(penalty.id);
      await recalculate(run.id);

      // Approved → resolved as approved, by the approver (edge 14).
      await http(app).post(`/hr/payroll-runs/${run.id}/approve`).expect(200);
      items = await readyItems(hrManager, run.id);
      expect(items).toHaveLength(3);
      expect(items[2]).toMatchObject({ resolution: 'approved' });
      expect(await bell(hrManager, READY).then((ns) => ns.every((n) => n.openCount === 0))).toBe(
        true,
      );

      // The month is locked: recording in it is refused and tells no one (edge 7).
      const principal = await newUser('principal', [BuiltInRole.PRINCIPAL]);
      const locked = await record(emp.q1, `${READY_MONTH}-20`).expect(409);
      expect(locked.body.error).toBe(ErrorCode.PAYROLL_APPROVED);
      expect(await db.notificationItem.count({ where: { recipientId: principal } })).toBe(0);
    });
  });
});
