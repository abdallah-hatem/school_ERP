import type { NotificationSubject } from '@school-erp/shared';
import type { NotificationScopeResolver, NotificationsService } from '../../../core/notifications';
import type { PermissionsService, UserScope } from '../../../core/permissions';
import type { EmployeesService } from '../employees/services/employees.service';
import type { PayrollRunsRepository } from '../payroll/repositories/payroll-runs.repository';
import { payrollReadyParams, subjectsCovered } from './hr-notifications.pure';
import { HrNotificationsService, type CalculatedRun } from './hr-notifications.service';

/*
 * HR's approval notifications (§11, plan N2 edge cases) with core's NotificationsService mocked:
 * what is sent and resolved, when, and the scope resolvers HR registers. The database behaviour
 * (recipients, read re-check) is in test/hr-approval-notifications.e2e-spec.ts.
 */

const scope = (
  s: UserScope['scope'],
  employeeId: string | null = 'me',
  stageId: string | null = 'st-1',
): UserScope => ({
  scope: s,
  employeeId,
  stageId,
});

function make(
  opts: {
    run?: { id: string; status: 'DRAFT' | 'APPROVED' } | null;
    payrollView?: Record<string, UserScope | null>;
    covered?: string[];
  } = {},
) {
  const resolvers = new Map<string, NotificationScopeResolver>();
  const notifications = {
    notify: jest.fn().mockResolvedValue({ created: 1 }),
    resolve: jest.fn().mockResolvedValue({ resolved: 1 }),
    registerScopeResolver: jest.fn((type: string, r: NotificationScopeResolver) =>
      resolvers.set(type, r),
    ),
  };
  const permissions = {
    scopeFor: jest.fn(({ id }: { id: string }) =>
      Promise.resolve(opts.payrollView && id in opts.payrollView ? opts.payrollView[id] : null),
    ),
  };
  const employees = {
    filterCoveredBy: jest.fn(() => Promise.resolve(new Set(opts.covered ?? []))),
  };
  const runs = { findByMonth: jest.fn().mockResolvedValue(opts.run ?? null) };
  const service = new HrNotificationsService(
    notifications as unknown as NotificationsService,
    permissions as unknown as PermissionsService,
    employees as unknown as EmployeesService,
    runs as unknown as PayrollRunsRepository,
  );
  service.onModuleInit();
  return { service, notifications, permissions, employees, runs, resolvers };
}

const PENALTY = {
  id: 'p-1',
  employee: { id: 'e-1', nameEn: 'Omar Khalil', nameAr: 'عمر خليل' },
  violation: { nameEn: 'Late', nameAr: 'تأخير' },
  level: 2,
  month: '2026-11',
};

const RUN: CalculatedRun = {
  id: 'run-1',
  month: '2026-11',
  calculatedAt: new Date('2026-11-18T10:00:00Z'),
  count: 38,
  net: 123_456_00,
  pendingPenalties: 0,
};

describe('HrNotificationsService — penalties', () => {
  it('recording sends "waiting for approval" about the penalty and its employee, with names in both languages', async () => {
    const { service, notifications } = make();
    await service.penaltyRecorded(PENALTY, 'u-recorder');
    expect(notifications.notify).toHaveBeenCalledWith({
      type: 'hr.penalty.awaiting_approval',
      subject: { entityType: 'penalty', entityId: 'p-1', employeeId: 'e-1' },
      params: {
        employee: { en: 'Omar Khalil', ar: 'عمر خليل' },
        violation: { en: 'Late', ar: 'تأخير' },
        level: 2,
      },
      dedupeKey: 'penalty:p-1',
      // The recorder isn't told (edge 3): core leaves the actor out.
      actorId: 'u-recorder',
    });
  });

  it('a penalty recorded in a month whose run is a draft resolves its "ready" as done (edge 13)', async () => {
    const draft = make({ run: { id: 'run-1', status: 'DRAFT' } });
    await draft.service.penaltyRecorded(PENALTY, null);
    expect(draft.runs.findByMonth).toHaveBeenCalledWith('2026-11');
    expect(draft.notifications.resolve).toHaveBeenCalledWith({
      type: 'hr.payroll.ready_to_approve',
      subject: { entityType: 'payroll_run', entityId: 'run-1' },
      resolution: 'done',
    });

    const none = make({ run: null });
    await none.service.penaltyRecorded(PENALTY, null);
    expect(none.notifications.resolve).not.toHaveBeenCalled();
  });

  it('approve / cancel resolve it for everyone, with who did it (edges 4, 5)', async () => {
    const { service, notifications } = make();
    await service.penaltyApproved('p-1', 'u-principal');
    await service.penaltyCancelled('p-2', 'u-hr');
    expect(notifications.resolve).toHaveBeenNthCalledWith(1, {
      type: 'hr.penalty.awaiting_approval',
      subject: { entityType: 'penalty', entityId: 'p-1' },
      resolution: 'approved',
      byUserId: 'u-principal',
    });
    expect(notifications.resolve).toHaveBeenNthCalledWith(2, {
      type: 'hr.penalty.awaiting_approval',
      subject: { entityType: 'penalty', entityId: 'p-2' },
      resolution: 'cancelled',
      byUserId: 'u-hr',
    });
  });
});

describe('HrNotificationsService — payroll', () => {
  it('a calculation with nothing pending sends "ready", one per calculation (edges 11, 12)', async () => {
    const { service, notifications } = make();
    await service.payrollCalculated(RUN, 'u-hr');
    // The earlier calculation's "ready" goes first: only the latest stays open.
    expect(notifications.resolve).toHaveBeenCalledWith({
      type: 'hr.payroll.ready_to_approve',
      subject: { entityType: 'payroll_run', entityId: 'run-1' },
      resolution: 'done',
    });
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'hr.payroll.ready_to_approve',
        subject: { entityType: 'payroll_run', entityId: 'run-1' },
        dedupeKey: 'payroll_ready:2026-11:2026-11-18T10:00:00.000Z',
        actorId: 'u-hr',
      }),
    );
    expect(notifications.resolve.mock.invocationCallOrder[0]).toBeLessThan(
      notifications.notify.mock.invocationCallOrder[0],
    );
  });

  it('a calculation while the month has pending penalties sends no "ready" (edge 11)', async () => {
    const { service, notifications } = make();
    await service.payrollCalculated({ ...RUN, pendingPenalties: 2 }, 'u-hr');
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('the net only for readers who see the whole run (hr.payroll.view at all), never for others (edge 15)', async () => {
    const { service, notifications } = make({
      payrollView: { 'u-all': scope('all'), 'u-stage': scope('own_stage'), 'u-none': null },
    });
    await service.payrollCalculated(RUN, null);
    const { paramsFor } = notifications.notify.mock.calls[0][0] as {
      paramsFor: (id: string) => Promise<Record<string, unknown>>;
    };
    expect(await paramsFor('u-all')).toEqual({ month: '2026-11', count: 38, net: 123_456_00 });
    expect(await paramsFor('u-stage')).toEqual({ month: '2026-11', count: 38 });
    expect(await paramsFor('u-none')).not.toHaveProperty('net');
  });

  it('approving the run resolves "ready" and "still a draft" as approved (edge 14)', async () => {
    const { service, notifications } = make();
    await service.payrollApproved('run-1', 'u-hr');
    expect(notifications.resolve).toHaveBeenCalledWith({
      type: 'hr.payroll.ready_to_approve',
      subject: { entityType: 'payroll_run', entityId: 'run-1' },
      resolution: 'approved',
      byUserId: 'u-hr',
    });
    expect(notifications.resolve).toHaveBeenCalledWith({
      type: 'hr.payroll.not_approved',
      subject: { entityType: 'payroll_run', entityId: 'run-1' },
      resolution: 'approved',
      byUserId: 'u-hr',
    });
  });
});

describe('HrNotificationsService — scope resolvers (N5, N11)', () => {
  const penalty = (employeeId: string | null): NotificationSubject => ({
    entityType: 'penalty',
    entityId: `p-${employeeId}`,
    employeeId,
  });

  it('registers employee, penalty and payroll_run at start-up', () => {
    const { resolvers } = make();
    expect([...resolvers.keys()].sort()).toEqual(['employee', 'payroll_run', 'penalty']);
  });

  it("a penalty is covered when its employee is in the reader's stage / team, as the employee is now (edges 1, 2, 9)", async () => {
    const { resolvers, employees } = make({ covered: ['e-1'] });
    const answers = await resolvers.get('penalty')!(scope('own_stage', 'me', 'st-primary'), [
      penalty('e-1'),
      penalty('e-2'),
      penalty(null),
    ]);
    expect(answers).toEqual([true, false, false]);
    expect(employees.filterCoveredBy).toHaveBeenCalledWith(
      { kind: 'stage', stageId: 'st-primary' },
      ['e-1', 'e-2'],
    );

    await resolvers.get('penalty')!(scope('own_team', 'boss'), [penalty('e-1')]);
    expect(employees.filterCoveredBy).toHaveBeenLastCalledWith(
      { kind: 'team', managerId: 'boss' },
      ['e-1'],
    );
  });

  it('an employee subject is about the employee itself', async () => {
    const { resolvers } = make({ covered: ['e-9'] });
    expect(
      await resolvers.get('employee')!(scope('own_stage'), [
        { entityType: 'employee', entityId: 'e-9' },
      ]),
    ).toEqual([true]);
  });

  it('a payroll run: no scoped reader covers it (only scope all, which core answers itself)', async () => {
    const { resolvers } = make();
    expect(
      await resolvers.get('payroll_run')!(scope('own_stage'), [
        { entityType: 'payroll_run', entityId: 'r' },
      ]),
    ).toEqual([false]);
  });
});

describe('hr-notifications.pure', () => {
  it('subjectsCovered: no employee → not covered (fail closed)', () => {
    expect(
      subjectsCovered(
        [
          { entityType: 'penalty', entityId: 'p', employeeId: 'e-1' },
          { entityType: 'penalty', entityId: 'q' },
          { entityType: 'employee', entityId: 'e-1' },
        ],
        new Set(['e-1']),
      ),
    ).toEqual([true, false, true]);
  });

  it('payrollReadyParams leaves the net out — absent, not null — for a salary-blind reader', () => {
    const facts = { month: '2026-11', count: 1, net: 5 };
    expect(payrollReadyParams(facts, true)).toEqual({ month: '2026-11', count: 1, net: 5 });
    expect(payrollReadyParams(facts, false)).toEqual({ month: '2026-11', count: 1 });
  });
});
