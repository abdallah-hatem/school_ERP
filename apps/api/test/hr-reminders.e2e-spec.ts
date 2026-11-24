import type { INestApplication } from '@nestjs/common';
import { HrSettingKey, type AuthUser } from '@school-erp/shared';
import { JobRunner } from '../src/core/jobs';
import { DatabaseService } from '../src/database/database.service';
import { HR_REMINDERS_JOB, HrRemindersJob } from '../src/modules/hr/reminders/hr-reminders.job';
import { RemindersRepository } from '../src/modules/hr/reminders/repositories/reminders.repository';
import { http, unique } from './helpers';
import { createAppAsTestUser, giveRoles } from './helpers/as-test-user';
import { outboxIdle } from './helpers/events';
import { deleteEmployees } from './helpers/employees';

/*
 * HR's daily reminders (N3, plan docs/plans/2026-11-18-notifications-plan.md → N3 edge cases),
 * run through `JobRunner.run('hr.reminders.daily')` with the job's clock fixed to a school day
 * (07:00 Cairo). Dates are years ahead so nothing else in the database is due on them; every
 * check is about this suite's employees, months and users.
 */

const REMINDER_KEYS = Object.values(HrSettingKey).filter((k) => k.startsWith('hr.reminders.'));
const MONTHS = ['2032-03', '2032-04'];

describe('HR reminders — hr.reminders.daily (e2e)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let user: AuthUser;
  let job: HrRemindersJob;
  let stageA: string;
  let stageB: string;
  let departmentId: string;
  let jobTitleId: string;
  let officer: string;
  let scopedEditor: string;
  let roleId: string;
  const users: string[] = [];
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

  /** Runs the job as if it were 07:00 in Cairo on `day`. */
  const runAt = (day: string) => {
    jest.spyOn(job, 'now').mockReturnValue(new Date(`${day}T05:00:00Z`));
    return app.get(JobRunner).run(HR_REMINDERS_JOB);
  };

  const newUser = async (label: string, roleKeys: string[], employeeId: string | null = null) => {
    const id = (
      await db.user.create({
        data: { email: `${unique(label)}@example.test`, name: label, passwordHash: 'x', employeeId },
        select: { id: true },
      })
    ).id;
    users.push(id);
    if (roleKeys.length) await giveRoles(db, id, roleKeys);
    return id;
  };

  const employee = async (over: Record<string, unknown> = {}) => {
    const id = (
      await http(app)
        .post('/hr/employees')
        .send({
          nameEn: unique('Reminder'),
          nameAr: unique('تذكير'),
          gender: 'FEMALE',
          dateOfBirth: '1990-01-01',
          phone: '01000000000',
          hireDate: '2015-09-01',
          stageId: stageA,
          departmentId,
          jobTitleId,
          workSystem: 'FULL_TIME',
          basicSalary: 1_000_000,
          contractStart: '2030-06-01',
          contractEnd: '2035-05-31',
          ...over,
        })
        .expect(201)
    ).body.data.id as string;
    employees.push(id);
    return id;
  };

  /** One user's items of a type, with their notification, oldest first. */
  const itemsOf = (userId: string, type: string) =>
    db.notificationItem.findMany({
      where: { recipientKind: 'user', recipientId: userId, type },
      include: { notification: true },
      orderBy: { createdAt: 'asc' },
    });
  const itemsAbout = async (userId: string, type: string, entityId: string) =>
    (await itemsOf(userId, type)).filter((i) => i.entityId === entityId);

  beforeAll(async () => {
    ({ app, user } = await createAppAsTestUser());
    db = app.get(DatabaseService);
    job = app.get(HrRemindersJob);
    await db.schoolSetting.deleteMany({ where: { key: { in: REMINDER_KEYS } } });
    [stageA, stageB] = [
      (await db.stage.create({ data: { nameEn: unique('Stage A'), nameAr: unique('مرحلة أ') } })).id,
      (await db.stage.create({ data: { nameEn: unique('Stage B'), nameAr: unique('مرحلة ب') } })).id,
    ];
    const mk = async (path: string) =>
      (await http(app).post(path).send({ nameEn: unique('x'), nameAr: unique('س') }).expect(201)).body
        .data.id as string;
    departmentId = await mk('/hr/departments');
    jobTitleId = await mk('/hr/job-titles');

    officer = await newUser('Officer', ['hr_officer']);
    // A custom role editing employees of its own stage only (edge 13).
    const role = await db.role.create({
      data: {
        key: unique('custom_e2e_reminders'),
        nameEn: unique('Stage editor'),
        nameAr: unique('محرر المرحلة'),
        permissions: { create: [{ permissionKey: 'hr.employees.edit', scope: 'own_stage' }] },
      },
      select: { id: true, key: true },
    });
    roleId = role.id;
    scopedEditor = await newUser('Stage editor', [role.key], await employee({ stageId: stageA }));
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await db.notification.deleteMany({
      where: {
        items: { some: { OR: [{ employeeId: { in: employees } }, { entityId: { in: MONTHS } }] } },
      },
    });
    await db.notification.deleteMany({ where: { recipientId: { in: users } } });
    await outboxIdle(app);
    await db.accountingPayrollRun.deleteMany({ where: { month: { in: MONTHS } } });
    await db.payrollRun.deleteMany({ where: { month: { in: MONTHS } } });
    await db.latenessEntry.deleteMany({ where: { month: { in: MONTHS } } });
    await db.schoolSetting.deleteMany({ where: { key: { in: REMINDER_KEYS } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.role.deleteMany({ where: { id: roleId } });
    await deleteEmployees(db, { where: { id: { in: employees } } });
    await db.department.deleteMany({ where: { id: departmentId } });
    await db.jobTitle.deleteMany({ where: { id: jobTitleId } });
    await db.stage.deleteMany({ where: { id: { in: [stageA, stageB] } } });
    await app.close();
  });

  describe('contracts ending soon', () => {
    let a: string;
    let b: string;
    let late: string;

    beforeAll(async () => {
      a = await employee({ stageId: stageA, contractEnd: '2031-05-31' });
      b = await employee({ stageId: stageB, contractEnd: '2031-05-31' });
      // Ends 1 June: 31 days away on 1 May.
      late = await employee({ stageId: stageA, contractEnd: '2031-06-01' });
    });

    it('edges 1, 13, 17 — 30 days before: one grouped notification per editor; 31 days → none; a stage editor gets only their stage', async () => {
      expect(await runAt('2031-05-01')).toBe('success');
      const [ia] = await itemsAbout(officer, 'hr.contract.ending_soon', a);
      const [ib] = await itemsAbout(officer, 'hr.contract.ending_soon', b);
      expect(ia).toMatchObject({
        dedupeKey: `contract_end:${a}:2031-05-31:30`,
        employeeId: a,
        resolvedAt: null,
        params: expect.objectContaining({ date: '2031-05-31', count: 30, days: 30 }),
      });
      // Grouped (N17): both contracts are items of one notification for the officer.
      expect(ib?.notificationId).toBe(ia?.notificationId);
      expect(ia?.notification.groupKey).toBe('2031-05-01:30');
      expect(await itemsAbout(officer, 'hr.contract.ending_soon', late)).toEqual([]);
      // Edge 13: own_stage covers stage A's employee only. The System admin (scope all) gets both.
      expect(await itemsAbout(scopedEditor, 'hr.contract.ending_soon', a)).toHaveLength(1);
      expect(await itemsAbout(scopedEditor, 'hr.contract.ending_soon', b)).toEqual([]);
      expect(await itemsAbout(user.id, 'hr.contract.ending_soon', b)).toHaveLength(1);
    });

    it('edge 3 — run again the same day, and twice at once (two containers) → no second reminder', async () => {
      expect(await runAt('2031-05-01')).toBe('success');
      const outcomes = await Promise.all([runAt('2031-05-01'), runAt('2031-05-01')]);
      for (const outcome of outcomes) expect(['success', 'skipped']).toContain(outcome);
      expect(await itemsAbout(officer, 'hr.contract.ending_soon', a)).toHaveLength(1);
      expect(await itemsAbout(officer, 'hr.contract.ending_soon', b)).toHaveLength(1);
    });

    it('edges 1, 17 — 7 days before: the second reminder in a new group, and the 30-day item is done', async () => {
      expect(await runAt('2031-05-24')).toBe('success');
      const items = await itemsAbout(officer, 'hr.contract.ending_soon', a);
      expect(items.map((i) => i.dedupeKey)).toEqual([
        `contract_end:${a}:2031-05-31:30`,
        `contract_end:${a}:2031-05-31:7`,
      ]);
      expect(items[0]).toMatchObject({ resolution: 'done', resolvedAt: expect.any(Date) });
      expect(items[1]).toMatchObject({ resolvedAt: null, params: expect.objectContaining({ count: 7 }) });
      expect(items[1]?.notification.groupKey).toBe('2031-05-24:7');
      const [, secondB] = await itemsAbout(officer, 'hr.contract.ending_soon', b);
      expect(secondB?.notificationId).toBe(items[1]?.notificationId);
    });

    it('edge 2 / contracts §11 — a renewal decision resolves "contract ends soon" at once; an ended contract gets nothing more (contracts edge 10)', async () => {
      const contractOf = async (employeeId: string) =>
        (await http(app).get(`/hr/employees/${employeeId}/contracts`).expect(200)).body.data[0].id as string;
      // a: renewed (the dates move to next year, and a decision exists).
      await http(app).post('/hr/contracts/renew').send({ contractIds: [await contractOf(a)] }).expect(200);
      expect((await itemsAbout(officer, 'hr.contract.ending_soon', a)).every((i) => i.resolvedAt)).toBe(true);

      // b: ended early, inside the window — its reminder goes and none is sent for the new end.
      await http(app)
        .post(`/hr/contracts/${await contractOf(b)}/end`)
        .send({ reason: 'OTHER', endsOn: '2031-05-28', note: 'Moved abroad' })
        .expect(200);
      expect((await itemsAbout(officer, 'hr.contract.ending_soon', b)).every((i) => i.resolvedAt)).toBe(true);
      expect(await runAt('2031-05-24')).toBe('success');
      expect((await itemsAbout(officer, 'hr.contract.ending_soon', b)).filter((i) => !i.resolvedAt)).toEqual([]);
      expect((await itemsAbout(officer, 'hr.contract.ending_soon', a)).filter((i) => !i.resolvedAt)).toEqual([]);
    });

    it('edge 12 — deactivated → its open reminder resolved; the next run sends none', async () => {
      await http(app).post(`/hr/employees/${b}/deactivate`).expect(200);
      expect((await itemsAbout(officer, 'hr.contract.ending_soon', b)).every((i) => i.resolvedAt)).toBe(true);
      const before = (await itemsAbout(officer, 'hr.contract.ending_soon', b)).length;
      expect(await runAt('2031-05-25')).toBe('success');
      expect(await itemsAbout(officer, 'hr.contract.ending_soon', b)).toHaveLength(before);
    });

    it('edge 1 — ended yesterday → none (and an open one is done)', async () => {
      const ended = await employee({ contractEnd: '2031-07-10' });
      expect(await runAt('2031-07-09')).toBe('success');
      expect(await itemsAbout(officer, 'hr.contract.ending_soon', ended)).toHaveLength(1);
      expect(await runAt('2031-07-11')).toBe('success');
      const items = await itemsAbout(officer, 'hr.contract.ending_soon', ended);
      expect(items).toHaveLength(1);
      expect(items[0]?.resolution).toBe('done');
    });

    it('edge 14 — a person who turned "Contract ends soon" off gets nothing; others still do', async () => {
      const quiet = await newUser('Quiet officer', ['hr_officer']);
      await as(quiet, () =>
        http(app)
          .put('/notifications/preferences')
          .send({ items: [{ type: 'hr.contract.ending_soon', channel: 'in_app', enabled: false }] })
          .expect(200),
      );
      const soon = await employee({ contractEnd: '2031-09-30' });
      expect(await runAt('2031-09-01')).toBe('success');
      expect(await itemsAbout(quiet, 'hr.contract.ending_soon', soon)).toEqual([]);
      expect(await itemsAbout(officer, 'hr.contract.ending_soon', soon)).toHaveLength(1);
    });
  });

  describe('probation ending soon', () => {
    it('edge 11 — 7 days before the employee’s date; moved later → resolved, a new one 7 days before the new date', async () => {
      const p = await employee({ probationEnd: '2031-11-30' });
      const none = await employee({ probationEnd: null });
      // "probationEnd: null" on create is filled from the default (hire + 3 months, long past): clear it.
      await http(app).patch(`/hr/employees/${none}`).send({ probationEnd: null }).expect(200);

      expect(await runAt('2031-11-22')).toBe('success');
      expect(await itemsAbout(officer, 'hr.probation.ending_soon', p)).toEqual([]);
      expect(await runAt('2031-11-23')).toBe('success');
      const [item] = await itemsAbout(officer, 'hr.probation.ending_soon', p);
      expect(item).toMatchObject({ dedupeKey: `probation_end:${p}:2031-11-30`, resolvedAt: null });
      expect(await itemsAbout(officer, 'hr.probation.ending_soon', none)).toEqual([]);

      await http(app).patch(`/hr/employees/${p}`).send({ probationEnd: '2031-12-31' }).expect(200);
      expect((await itemsAbout(officer, 'hr.probation.ending_soon', p))[0]?.resolution).toBe('done');
      expect(await runAt('2031-12-24')).toBe('success');
      const open = (await itemsAbout(officer, 'hr.probation.ending_soon', p)).filter((i) => !i.resolvedAt);
      expect(open.map((i) => i.dedupeKey)).toEqual([`probation_end:${p}:2031-12-31`]);
    });
  });

  describe('lateness and payroll by the check days', () => {
    let someone: string;
    beforeAll(async () => {
      someone = await employee();
    });

    const latenessItems = (userId: string, month: string) => itemsAbout(userId, 'hr.lateness.not_entered', month);

    it('edges 4, 7, 8 — none before the 25th; from the 25th once; resolved when saved (even all zeros)', async () => {
      expect(await runAt('2032-03-24')).toBe('success');
      expect(await latenessItems(officer, '2032-03')).toEqual([]);
      // The 25th was missed (server down): the 26th sends it, once.
      expect(await runAt('2032-03-26')).toBe('success');
      expect(await runAt('2032-03-27')).toBe('success');
      const items = await latenessItems(officer, '2032-03');
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ dedupeKey: 'lateness_missing:2032-03', resolvedAt: null });
      // A stage editor doesn't enter lateness: nothing for them.
      expect(await latenessItems(scopedEditor, '2032-03')).toEqual([]);

      await http(app)
        .put('/hr/lateness/2032-03')
        .send({ entries: [{ employeeId: someone, minutes: 0 }] })
        .expect(200);
      expect((await latenessItems(officer, '2032-03'))[0]?.resolution).toBe('done');
      expect(await runAt('2032-03-28')).toBe('success');
      expect(await latenessItems(officer, '2032-03')).toHaveLength(1);
    });

    it('edge 10 — no run by the 28th → "not prepared"; created → done; a draft → "still a draft"; approved → "Approved by …"', async () => {
      expect(await runAt('2032-03-28')).toBe('success');
      const missing = await itemsAbout(officer, 'hr.payroll.not_prepared', '2032-03');
      expect(missing.map((i) => i.dedupeKey)).toEqual(['payroll_missing:2032-03']);

      const runId = (await http(app).post('/hr/payroll-runs').send({ month: '2032-03' }).expect(201)).body
        .data.id as string;
      expect((await itemsAbout(officer, 'hr.payroll.not_prepared', '2032-03'))[0]?.resolution).toBe('done');

      expect(await runAt('2032-03-29')).toBe('success');
      // "Still a draft" goes to payroll approvers (the HR manager / System admin test user), about the run.
      const draft = await itemsAbout(user.id, 'hr.payroll.not_approved', runId);
      expect(draft).toHaveLength(1);
      expect(draft[0]).toMatchObject({ dedupeKey: 'payroll_unapproved:2032-03', resolvedAt: null });

      await http(app).post(`/hr/payroll-runs/${runId}/approve`).expect(200);
      await outboxIdle(app);
      const [approved] = await itemsAbout(user.id, 'hr.payroll.not_approved', runId);
      expect(approved).toMatchObject({ resolution: 'approved', resolvedByName: expect.anything() });
      expect(await runAt('2032-03-30')).toBe('success');
      expect(await itemsAbout(user.id, 'hr.payroll.not_approved', runId)).toHaveLength(1);
    });

    it('edges 9, 10 — a month approved before its check days, lateness never saved → no lateness or payroll reminder', async () => {
      const runId = (await http(app).post('/hr/payroll-runs').send({ month: '2032-04' }).expect(201)).body
        .data.id as string;
      await http(app).post(`/hr/payroll-runs/${runId}/approve`).expect(200);
      await outboxIdle(app);
      expect(await runAt('2032-04-28')).toBe('success');
      expect(await latenessItems(officer, '2032-04')).toEqual([]);
      expect(await itemsAbout(officer, 'hr.payroll.not_prepared', '2032-04')).toEqual([]);
      expect(await itemsAbout(user.id, 'hr.payroll.not_approved', runId)).toEqual([]);
    });
  });

  it('edge 18 — a failed type is recorded failed, sends nothing for that type, and the next run catches up', async () => {
    const e = await employee({ contractEnd: '2033-01-31' });
    const since = new Date();
    jest
      .spyOn(app.get(RemindersRepository), 'activeEmployees')
      .mockRejectedValueOnce(new Error('database went away'));
    expect(await runAt('2033-01-10')).toBe('failed');
    const run = await db.jobRun.findFirst({
      where: { jobName: HR_REMINDERS_JOB, startedAt: { gte: since } },
      orderBy: { startedAt: 'desc' },
    });
    expect(run).toMatchObject({ status: 'failed', error: expect.stringContaining('database went away') });
    expect(await itemsAbout(officer, 'hr.contract.ending_soon', e)).toEqual([]);

    expect(await runAt('2033-01-11')).toBe('success');
    expect(await itemsAbout(officer, 'hr.contract.ending_soon', e)).toHaveLength(1);
  });

  it('edge 16 — a changed timing takes effect at the next run; the reminder already sent stays', async () => {
    const e = await employee({ contractEnd: '2033-03-31' });
    expect(await runAt('2033-03-01')).toBe('success');
    expect(await itemsAbout(officer, 'hr.contract.ending_soon', e)).toHaveLength(1);
    await http(app).patch('/hr/settings').send({ reminders: { contractEndDays: 45 } }).expect(200);
    const later = await employee({ contractEnd: '2033-04-14' });
    expect(await runAt('2033-03-01')).toBe('success');
    // 44 days away: due under the new 45-day timing.
    expect((await itemsAbout(officer, 'hr.contract.ending_soon', later)).map((i) => i.dedupeKey)).toEqual([
      `contract_end:${later}:2033-04-14:45`,
    ]);
    const kept = await itemsAbout(officer, 'hr.contract.ending_soon', e);
    expect(kept).toHaveLength(1);
    expect(kept[0]?.resolvedAt).toBeNull();
    await db.schoolSetting.deleteMany({ where: { key: { in: REMINDER_KEYS } } });
  });
});
