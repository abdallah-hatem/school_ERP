import { PermissionScope } from '@school-erp/shared';
import type { NotificationScopeResolver, NotificationsService } from '../../../core/notifications';
import { HrNotificationScopes } from '../access/hr-notification-scopes';
import type { EmployeesService } from '../employees/services/employees.service';
import { HrRemindersService } from './hr-reminders.service';

/* Resolving HR's reminders at the change (§11, N3, N10) and who covers their subjects (N5). */

function makeNotifications() {
  const resolvers = new Map<string, NotificationScopeResolver>();
  return {
    resolve: jest.fn().mockResolvedValue({ resolved: 1 }),
    registerScopeResolver: jest.fn((type: string, r: NotificationScopeResolver) => resolvers.set(type, r)),
    resolvers,
  };
}

describe('HrRemindersService', () => {
  const make = () => {
    const notifications = makeNotifications();
    return { notifications, service: new HrRemindersService(notifications as unknown as NotificationsService) };
  };

  it('a moved contract / probation end resolves that type about the employee as done', async () => {
    const { service, notifications } = make();
    await service.contractChanged('e1');
    await service.probationChanged('e1', 'u1');
    expect(notifications.resolve.mock.calls.map(([i]) => i)).toEqual([
      { type: 'hr.contract.ending_soon', subject: { entityType: 'employee', entityId: 'e1' }, resolution: 'done', byUserId: null },
      { type: 'hr.probation.ending_soon', subject: { entityType: 'employee', entityId: 'e1' }, resolution: 'done', byUserId: 'u1' },
    ]);
  });

  it('edge 12 — deactivation resolves both the contract and the probation reminder', async () => {
    const { service, notifications } = make();
    await service.employeeDeactivated('e1');
    expect(notifications.resolve.mock.calls.map(([i]) => (i as { type: string }).type)).toEqual([
      'hr.contract.ending_soon',
      'hr.probation.ending_soon',
    ]);
  });

  it('edges 8 / 10 — lateness saved, run created, run approved (read "Approved by …") — edge 9: approval also ends the month’s lateness reminder', async () => {
    const { service, notifications } = make();
    await service.latenessSaved('2026-11', 'u1');
    await service.payrollRunCreated('2026-11', 'u1');
    await service.payrollRunApproved('r1', '2026-11', 'u2');
    expect(notifications.resolve.mock.calls.map(([i]) => i)).toEqual([
      { type: 'hr.lateness.not_entered', subject: { entityType: 'lateness_month', entityId: '2026-11' }, resolution: 'done', byUserId: 'u1' },
      { type: 'hr.payroll.not_prepared', subject: { entityType: 'payroll_month', entityId: '2026-11' }, resolution: 'done', byUserId: 'u1' },
      { type: 'hr.payroll.not_approved', subject: { entityType: 'payroll_run', entityId: 'r1' }, resolution: 'approved', byUserId: 'u2' },
      { type: 'hr.lateness.not_entered', subject: { entityType: 'lateness_month', entityId: '2026-11' }, resolution: 'done', byUserId: 'u2' },
    ]);
  });
});

describe('HrNotificationScopes', () => {
  const scope = (s: PermissionScope) => ({ scope: s, employeeId: 'me', stageId: 'primary' });

  it('edge 13 — employee subjects: the recipient’s scope must cover the employee (HR’s rule)', async () => {
    const notifications = makeNotifications();
    const employees = { coveredBy: jest.fn().mockResolvedValue([true, false]) };
    new HrNotificationScopes(
      notifications as unknown as NotificationsService,
      employees as unknown as EmployeesService,
    ).onModuleInit();
    const subjects = [
      { entityType: 'employee', entityId: 'e1', employeeId: 'e1' },
      { entityType: 'employee', entityId: 'e2', employeeId: 'e2' },
    ];
    const resolver = notifications.resolvers.get('employee')!;
    await expect(resolver(scope(PermissionScope.OWN_STAGE), subjects)).resolves.toEqual([true, false]);
    expect(employees.coveredBy).toHaveBeenCalledWith(scope(PermissionScope.OWN_STAGE), ['e1', 'e2']);
  });

  it('months and runs are whole-school: a scoped holder is never told', async () => {
    const notifications = makeNotifications();
    new HrNotificationScopes(notifications as unknown as NotificationsService, {} as EmployeesService).onModuleInit();
    for (const type of ['lateness_month', 'payroll_month', 'payroll_run']) {
      const resolver = notifications.resolvers.get(type)!;
      await expect(
        resolver(scope(PermissionScope.OWN_STAGE), [{ entityType: type, entityId: '2026-11' }]),
      ).resolves.toEqual([false]);
    }
  });
});
