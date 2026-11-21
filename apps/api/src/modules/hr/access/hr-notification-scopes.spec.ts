import type { NotificationSubject } from '@school-erp/shared';
import type { NotificationScopeResolver, NotificationsService } from '../../../core/notifications';
import type { UserScope } from '../../../core/permissions';
import type { EmployeesService } from '../employees/services/employees.service';
import type { PenaltyRecordsService } from '../penalties/services/penalty-records.service';
import type { EmployeeScope } from './employee-scope.pure';
import { HrNotificationScopes } from './hr-notification-scopes';

/* HR's notification scope resolvers (§11, N5, N11): one per subject type, registered at start-up. */

const scope = (s: UserScope['scope'], employeeId = 'me', stageId = 'st-1'): UserScope => ({
  scope: s,
  employeeId,
  stageId,
  stageIds: [stageId],
});

function make(covered: string[] = [], coveredPenalties: string[] = []) {
  const resolvers = new Map<string, NotificationScopeResolver>();
  const notifications = {
    registerScopeResolver: jest.fn((type: string, r: NotificationScopeResolver) => {
      if (resolvers.has(type)) throw new Error(`registered twice: ${type}`);
      resolvers.set(type, r);
    }),
  };
  const employees = {
    coveredBy: jest.fn((_s: UserScope, ids: readonly string[]) =>
      Promise.resolve(ids.map((id) => covered.includes(id))),
    ),
  };
  const penalties = {
    coveredBy: jest.fn((_s: EmployeeScope, ids: readonly string[]) =>
      Promise.resolve(ids.map((id) => coveredPenalties.includes(id))),
    ),
  };
  new HrNotificationScopes(
    notifications as unknown as NotificationsService,
    employees as unknown as EmployeesService,
    penalties as unknown as PenaltyRecordsService,
  ).onModuleInit();
  return { resolvers, employees, penalties };
}

const penalty = (employeeId: string | null): NotificationSubject => ({
  entityType: 'penalty',
  entityId: `p-${employeeId}`,
  employeeId,
});

describe('HrNotificationScopes', () => {
  it('registers each HR subject type once', () => {
    const { resolvers } = make();
    expect([...resolvers.keys()].sort()).toEqual([
      'employee',
      'lateness_month',
      'payroll_month',
      'payroll_run',
      'penalty',
    ]);
  });

  it("a penalty is covered by the record itself — its stage for a stage head, not the employee's other stages (owner 2026-11-21)", async () => {
    const { resolvers, penalties, employees } = make([], ['p-e-1']);
    const answers = await resolvers.get('penalty')!(scope('own_stage'), [
      penalty('e-1'),
      penalty('e-2'),
      penalty(null),
    ]);
    expect(answers).toEqual([true, false, false]);
    // Asked by penalty id, with the reader's stages as HR's scope.
    expect(penalties.coveredBy).toHaveBeenCalledWith({ kind: 'stage', stageIds: ['st-1'] }, ['p-e-1', 'p-e-2', 'p-null']);
    expect(employees.coveredBy).not.toHaveBeenCalled();
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
