import { Injectable, type OnModuleInit } from '@nestjs/common';
import { AuditEntityType, type NotificationSubject } from '@school-erp/shared';
import { NotificationsService } from '../../../core/notifications';
import type { UserScope } from '../../../core/permissions';
import { EmployeesService } from '../employees/services/employees.service';
import { ReminderEntity } from '../reminders/reminders.pure';

/**
 * Tells core's notifications whether a scoped recipient covers an HR subject (§11, N5, N11) — the
 * same rule when sending and when the bell re-checks on read:
 * - about an employee (contract, probation): the recipient's scope (stage, team, self) covers that
 *   employee, as everywhere in HR (R5);
 * - about a penalty (waiting for approval, N2): the same, for the penalty's employee — as the
 *   employee is now, so a stage move takes it away from the old stage's approver;
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
    this.notifications.registerScopeResolver(AuditEntityType.PENALTY, (scope, subjects) =>
      this.coverPenalties(scope, subjects),
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

  /** A penalty is about its `employeeId`; one without it is covered by nobody (fail closed). */
  private async coverPenalties(
    scope: UserScope,
    subjects: readonly NotificationSubject[],
  ): Promise<boolean[]> {
    const ids = subjects.map((s) => s.employeeId).filter((id): id is string => !!id);
    const answers = await this.employees.coveredBy(scope, ids);
    const covered = new Set(ids.filter((_, i) => answers[i]));
    return subjects.map((s) => !!s.employeeId && covered.has(s.employeeId));
  }

  private coverEmployees(
    scope: UserScope,
    subjects: readonly NotificationSubject[],
  ): Promise<boolean[]> {
    return this.employees.coveredBy(
      scope,
      subjects.map((s) => s.employeeId ?? s.entityId),
    );
  }
}
