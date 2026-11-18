import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { NotificationSubject } from '@school-erp/shared';
import { NotificationsService } from '../../../core/notifications';
import type { UserScope } from '../../../core/permissions';
import { EmployeesService } from '../employees/services/employees.service';
import { ReminderEntity } from '../reminders/reminders.pure';

/**
 * Tells core's notifications whether a scoped recipient covers an HR subject (§11, N5, N11) — the
 * same rule when sending and when the bell re-checks on read:
 * - about an employee (contract, probation): the recipient's scope (stage, team, self) covers that
 *   employee, as everywhere in HR (R5);
 * - about a month or a run (lateness, payroll): whole-school things, so only scope `all` — core
 *   never asks for `all`, so a scoped holder is never told.
 */
@Injectable()
export class HrNotificationScopes implements OnModuleInit {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly employees: EmployeesService,
  ) {}

  onModuleInit(): void {
    this.notifications.registerScopeResolver(ReminderEntity.EMPLOYEE, (scope, subjects) =>
      this.coverEmployees(scope, subjects),
    );
    for (const entityType of [
      ReminderEntity.LATENESS_MONTH,
      ReminderEntity.PAYROLL_MONTH,
      ReminderEntity.PAYROLL_RUN,
    ]) {
      this.notifications.registerScopeResolver(entityType, (_scope, subjects) =>
        Promise.resolve(subjects.map(() => false)),
      );
    }
  }

  private coverEmployees(scope: UserScope, subjects: readonly NotificationSubject[]): Promise<boolean[]> {
    return this.employees.coveredBy(
      scope,
      subjects.map((s) => s.employeeId ?? s.entityId),
    );
  }
}
