import { randomUUID } from 'node:crypto';
import { INestApplication, Injectable, Module } from '@nestjs/common';
import {
  ErrorCode,
  HrEvent,
  type AuditChange,
  type AuthUser,
  type EmployeeDeactivatedEvent,
  type OutboxDeliveryView,
  type PayrollRun,
} from '@school-erp/shared';
import { JobRunner } from '../src/core/jobs';
import { DomainEvents, OUTBOX_DELIVER_JOB, OutboxListener } from '../src/core/events';
import { OutboxDelivery } from '../src/core/events/outbox-delivery.service';
import { PAYROLL_TAXES_LISTENER } from '../src/modules/accounting/payroll/listeners/payroll-approved.listener';
import { DatabaseService } from '../src/database/database.service';
import { AfterCommit } from '../src/database/transactions';
import { http, unique } from './helpers';
import { createAppAsTestUser } from './helpers/as-test-user';
import { outboxEvents } from './helpers/events';
import { historyMark } from './helpers/history';

/*
 * The outbox (core/events, owner 2026-11-18): must-deliver events are written with the change,
 * delivered right after the commit (the nudge) and by the 30-second poll, retried on failure, handled
 * once per listener, and an admin can retry a dead delivery. Two test listeners hear
 * `hr.employee.deactivated`: one that counts, one that fails when told to.
 */

const COUNTER = 'e2e.outbox-counter';
const FLAKY = 'e2e.outbox-flaky';

/** How many times each employee id reached each test listener. */
const calls = new Map<string, number>();
const callsOf = (listener: string, employeeId: string) => calls.get(`${listener}:${employeeId}`) ?? 0;
const count = (listener: string, employeeId: string) =>
  calls.set(`${listener}:${employeeId}`, callsOf(listener, employeeId) + 1);
/** Employee ids whose next delivery to the flaky listener throws (once each). */
const failNext = new Set<string>();

@OutboxListener({ event: HrEvent.EMPLOYEE_DEACTIVATED, name: COUNTER })
@Injectable()
class CountingListener {
  handle(event: EmployeeDeactivatedEvent): Promise<void> {
    count(COUNTER, event.employeeId);
    return Promise.resolve();
  }
}

@OutboxListener({ event: HrEvent.EMPLOYEE_DEACTIVATED, name: FLAKY })
@Injectable()
class FlakyListener {
  handle(event: EmployeeDeactivatedEvent): Promise<void> {
    count(FLAKY, event.employeeId);
    if (failNext.delete(event.employeeId)) return Promise.reject(new Error('flaky listener says no'));
    return Promise.resolve();
  }
}

@Module({ providers: [CountingListener, FlakyListener] })
class OutboxTestListenersModule {}

/** Far from the other payroll suites' months (one run per month, §6). */
let monthSeq = 0;
const usedMonths: string[] = [];
const nextMonth = () => {
  const n = monthSeq++;
  const month = `${2070 + Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`;
  usedMonths.push(month);
  return month;
};

describe('Outbox — must-deliver events (e2e)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let user: AuthUser;
  let roleless: string;
  let stageId: string;
  let departmentId: string;
  let jobTitleId: string;
  const employees: string[] = [];

  const employee = async () => {
    const id = (
      await http(app)
        .post('/hr/employees')
        .send({
          nameEn: unique('Outbox'),
          nameAr: unique('صندوق'),
          gender: 'MALE',
          dateOfBirth: '1990-01-01',
          phone: '01000000000',
          hireDate: '2010-09-01',
          stageId,
          departmentId,
          jobTitleId,
          workSystem: 'FULL_TIME',
          basicSalary: 1_200_000,
        })
        .expect(201)
    ).body.data.id as string;
    employees.push(id);
    return id;
  };

  const deliveryOf = (eventId: string, listener: string) =>
    db.outboxDelivery.findUniqueOrThrow({ where: { eventId_listener: { eventId, listener } } });

  /** An event with one delivery to `listener`, written straight to the tables (no nudge). */
  const stored = async (
    employeeId: string,
    delivery: { listener?: string; status?: string; attempts?: number } = {},
  ) =>
    db.outboxEvent.create({
      data: {
        name: HrEvent.EMPLOYEE_DEACTIVATED,
        payload: { employeeId, at: new Date().toISOString() },
        status: delivery.status === 'dead' ? 'dead' : 'pending',
        deliveries: {
          create: [
            {
              listener: delivery.listener ?? COUNTER,
              status: delivery.status ?? 'pending',
              attempts: delivery.attempts ?? 0,
              nextAttemptAt: new Date(Date.now() - 1000),
              lastError: delivery.status === 'dead' ? 'gave up' : null,
            },
          ],
        },
      },
      select: { id: true, deliveries: { select: { id: true } } },
    });

  beforeAll(async () => {
    ({ app, user } = await createAppAsTestUser(undefined, [OutboxTestListenersModule]));
    db = app.get(DatabaseService);
    roleless = (
      await db.user.upsert({
        where: { email: 'e2e-outbox-roleless@example.test' },
        create: { email: 'e2e-outbox-roleless@example.test', name: 'No outbox', passwordHash: 'x' },
        update: {},
        select: { id: true },
      })
    ).id;
    stageId = (await db.stage.create({ data: { nameEn: unique('Stage'), nameAr: unique('مرحلة') } })).id;
    const mk = async (path: string) =>
      (await http(app).post(path).send({ nameEn: unique('x'), nameAr: unique('س') }).expect(201)).body.data
        .id as string;
    departmentId = await mk('/hr/departments');
    jobTitleId = await mk('/hr/job-titles');
  });

  afterAll(async () => {
    await db.accountingPayrollRun.deleteMany({ where: { month: { in: usedMonths } } });
    await db.payrollRun.deleteMany({ where: { month: { in: usedMonths } } });
    await db.employee.deleteMany({ where: { id: { in: employees } } });
    await db.department.deleteMany({ where: { id: departmentId } });
    await db.jobTitle.deleteMany({ where: { id: jobTitleId } });
    await db.stage.deleteMany({ where: { id: stageId } });
    await db.user.deleteMany({ where: { id: roleless } });
    await app.close();
  });

  it('HR approves a month → accounting has its taxes when the response returns, delivered through the outbox', async () => {
    const month = nextMonth();
    await employee();
    const run = (await http(app).post('/hr/payroll-runs').send({ month }).expect(201)).body.data as PayrollRun;
    await http(app).post(`/hr/payroll-runs/${run.id}/approve`).expect(200);

    // The nudge ran after the commit, before the response: no waiting.
    expect(await db.accountingPayrollRun.findUnique({ where: { month }, select: { hrRunId: true } })).toEqual({
      hrRunId: run.id,
    });
    const [event] = await outboxEvents(db, HrEvent.PAYROLL_APPROVED, { runId: run.id });
    expect(event?.status).toBe('delivered');
    expect(await deliveryOf(event.id, PAYROLL_TAXES_LISTENER)).toMatchObject({
      status: 'delivered',
      attempts: 1,
      deliveredAt: expect.any(Date),
    });
  });

  it('a listener that throws is retried (10 s later) and then succeeds; the poll records its run, an idle poll does not', async () => {
    const emp = await employee();
    failNext.add(emp);
    await http(app).post(`/hr/employees/${emp}/deactivate`).expect(200);

    const [event] = await outboxEvents(db, HrEvent.EMPLOYEE_DEACTIVATED, { employeeId: emp });
    expect(event?.status).toBe('pending');
    // The other listener is not held back by the failing one.
    expect(await deliveryOf(event.id, COUNTER)).toMatchObject({ status: 'delivered', attempts: 1 });
    const failed = await deliveryOf(event.id, FLAKY);
    expect(failed).toMatchObject({ status: 'pending', attempts: 1 });
    expect(failed.lastError).toContain('flaky listener says no');
    const wait = failed.nextAttemptAt.getTime() - Date.now();
    expect(wait).toBeGreaterThan(5_000);
    expect(wait).toBeLessThanOrEqual(10_000);

    // Not due yet: the poll leaves it alone.
    const runs = () => db.jobRun.count({ where: { jobName: OUTBOX_DELIVER_JOB } });
    await app.get(OutboxDelivery).deliverDue();
    expect((await deliveryOf(event.id, FLAKY)).attempts).toBe(1);

    // Due: the poll delivers it, and records that run.
    await db.outboxDelivery.update({ where: { id: failed.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
    const before = await runs();
    await expect(app.get(JobRunner).run(OUTBOX_DELIVER_JOB)).resolves.toBe('success');
    expect(await deliveryOf(event.id, FLAKY)).toMatchObject({ status: 'delivered', attempts: 2 });
    expect((await outboxEvents(db, HrEvent.EMPLOYEE_DEACTIVATED, { employeeId: emp }))[0]?.status).toBe('delivered');
    expect(callsOf(FLAKY, emp)).toBe(2);
    expect(callsOf(COUNTER, emp)).toBe(1);
    expect(await runs()).toBe(before + 1);

    // Nothing left to do: idle, not recorded.
    await expect(app.get(JobRunner).run(OUTBOX_DELIVER_JOB)).resolves.toBe('idle');
    expect(await runs()).toBe(before + 1);
  });

  it('a rolled-back change leaves no outbox row, and no listener runs', async () => {
    const marker = randomUUID();
    await expect(
      app.get(AfterCommit).transaction(async () => {
        await app
          .get(DomainEvents)
          .publish(HrEvent.EMPLOYEE_DEACTIVATED, { employeeId: marker, at: new Date().toISOString() }, { mustDeliver: true });
        throw new Error('the change failed after publishing');
      }),
    ).rejects.toThrow('the change failed after publishing');
    expect(await outboxEvents(db, HrEvent.EMPLOYEE_DEACTIVATED, { employeeId: marker })).toEqual([]);
    expect(callsOf(COUNTER, marker)).toBe(0);

    // The same publish committed: one row, delivered.
    await app.get(AfterCommit).transaction(() =>
      app
        .get(DomainEvents)
        .publish(HrEvent.EMPLOYEE_DEACTIVATED, { employeeId: marker, at: new Date().toISOString() }, { mustDeliver: true }),
    );
    expect(await outboxEvents(db, HrEvent.EMPLOYEE_DEACTIVATED, { employeeId: marker })).toHaveLength(1);
    expect(callsOf(COUNTER, marker)).toBe(1);
  });

  it('two worker passes at once (two polls and a nudge) deliver once', async () => {
    const marker = randomUUID();
    const event = await stored(marker);
    const delivery = app.get(OutboxDelivery);
    await Promise.all([delivery.deliverDue(), delivery.deliverDue(), delivery.nudge(event.id)]);
    expect(callsOf(COUNTER, marker)).toBe(1);
    expect(await deliveryOf(event.id, COUNTER)).toMatchObject({ status: 'delivered', attempts: 1 });

    // A redelivery of a handled delivery (its lease ran out, say) is a no-op.
    await delivery.deliver({
      id: event.deliveries[0].id,
      eventId: event.id,
      listener: COUNTER,
      attempts: 0,
      eventName: HrEvent.EMPLOYEE_DEACTIVATED,
      payload: { employeeId: marker, at: new Date().toISOString() },
      seq: BigInt(0),
      publishedAt: new Date(),
    });
    expect(callsOf(COUNTER, marker)).toBe(1);
  });

  it('an admin retries a dead delivery: audited (dead → pending), delivered right after; only a dead one; core.outbox.manage only', async () => {
    const marker = randomUUID();
    const event = await stored(marker, { status: 'dead', attempts: 10 });
    const id = event.deliveries[0].id;

    const dead = (await http(app).get('/outbox/deliveries?status=dead&limit=100').expect(200)).body
      .data as OutboxDeliveryView[];
    expect(dead.find((d) => d.id === id)).toMatchObject({
      eventName: HrEvent.EMPLOYEE_DEACTIVATED,
      listener: COUNTER,
      status: 'dead',
      attempts: 10,
      lastError: 'gave up',
    });

    // Without the permission: 403, nothing changes.
    const me = user.id;
    user.id = roleless;
    try {
      await http(app).post(`/outbox/deliveries/${id}/retry`).expect(403);
      await http(app).get('/outbox/deliveries').expect(403);
    } finally {
      user.id = me;
    }
    expect((await deliveryOf(event.id, COUNTER)).status).toBe('dead');

    const mark = await historyMark(db);
    const res = await http(app).post(`/outbox/deliveries/${id}/retry`).expect(200);
    expect(res.body.data).toMatchObject({ id, status: 'pending' });
    expect(await deliveryOf(event.id, COUNTER)).toMatchObject({ status: 'delivered', attempts: 11 });
    expect(callsOf(COUNTER, marker)).toBe(1);
    expect((await outboxEvents(db, HrEvent.EMPLOYEE_DEACTIVATED, { employeeId: marker }))[0]?.status).toBe(
      'delivered',
    );

    const entries = await db.auditEntry.findMany({ where: { seq: { gt: mark }, action: 'core.outbox.retry' } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      entityType: 'outbox_delivery',
      entityId: id,
      entityLabel: `${HrEvent.EMPLOYEE_DEACTIVATED} → ${COUNTER}`,
      actorId: user.id,
    });
    expect(entries[0].changes as unknown as AuditChange[]).toEqual([
      { field: 'status', before: 'dead', after: 'pending' },
    ]);

    // Not dead (any more) → 409; unknown → 404.
    const again = await http(app).post(`/outbox/deliveries/${id}/retry`).expect(409);
    expect(again.body.error).toBe(ErrorCode.OUTBOX_NOT_DEAD);
    await http(app).post(`/outbox/deliveries/${randomUUID()}/retry`).expect(404);
    expect(await db.auditEntry.count({ where: { seq: { gt: mark }, action: 'core.outbox.retry' } })).toBe(1);
  });
});
