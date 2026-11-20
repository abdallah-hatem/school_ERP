import type { NotificationSubject } from '@school-erp/shared';
import type { NotificationScopeResolver, NotificationsService } from '../../../core/notifications';
import type { UserScope } from '../../../core/permissions';
import type { EmployeesService } from '../employees/services/employees.service';
import { HrNotificationScopes } from './hr-notification-scopes';

/* HR's notification scope resolvers (§11, N5, N11): one per subject type, registered at start-up. */

const scope = (s: UserScope['scope'], employeeId = 'me', stageId = 'st-1'): UserScope => ({
  scope: s,
  employeeId,
  stageId,
});

function make(covered: string[] = []) {
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
  new HrNotificationScopes(
    notifications as unknown as NotificationsService,
    employees as unknown as EmployeesService,
  ).onModuleInit();
  return { resolvers, employees };
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

  it("a penalty is covered when its employee is in the reader's stage / team, as the employee is now (N2 edges 1, 2, 9)", async () => {
    const { resolvers, employees } = make(['e-1']);
    const stage = scope('own_stage');
    const answers = await resolvers.get('penalty')!(stage, [
      penalty('e-1'),
      penalty('e-2'),
      penalty(null),
    ]);
    expect(answers).toEqual([true, false, false]);
    // A penalty without an employee is never looked up (fail closed).
    expect(employees.coveredBy).toHaveBeenCalledWith(stage, ['e-1', 'e-2']);
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
