import { Injectable, type OnModuleInit } from '@nestjs/common';
import { AuditEntityType, type NotificationSubject } from '@school-erp/shared';
import { NotificationsService } from '../../../core/notifications';
import type { UserScope } from '../../../core/permissions';
import { EmployeesService } from '../employees/services/employees.service';
import { PenaltyRecordsService } from '../penalties/services/penalty-records.service';
import { toEmployeeScope } from './employee-scope.pure';
import { ReminderEntity } from '../reminders/reminders.pure';

/**
 * Tells core's notifications whether a scoped recipient covers an HR subject (§11, N5, N11) — the
 * same rule when sending and when the bell re-checks on read:
 * - about an employee (contract, probation): the recipient's scope (stage, team, self) covers that
 *   employee, as everywhere in HR (R5);
 * - about a penalty (waiting for review or approval, rejected): a stage scope by the penalty's
 *   stage — where it happened (owner 2026-11-21), so the head of the employee's other stage is
 *   never told; a team or self scope by its employee, as the employee is now;
 * - about a month or a run (lateness, payroll): whole-school things, so only scope `all` — core
 *   never asks for `all`, so a scoped holder is never told.
 */
@Injectable()
export class HrNotificationScopes implements OnModuleInit {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly employees: EmployeesService,
    private readonly penalties: PenaltyRecordsService,
  ) {}

  onModuleInit(): void {
    this.notifications.registerScopeResolver(ReminderEntity.EMPLOYEE, (scope, subjects) =>
      this.coverEmployees(scope, subjects),
    );
    this.notifications.registerScopeResolver(AuditEntityType.PENALTY, (scope, subjects) =>
      this.coverPenalties(scope, subjects),
    );
    // Contracts (spec 2026-11-24): managing contracts is whole-school (never scoped), so a scoped
    // holder is never told about a contract or a renewal season.
    for (const entityType of [
      ReminderEntity.CONTRACT_YEAR,
      AuditEntityType.EMPLOYEE_CONTRACT,
      ReminderEntity.LATENESS_MONTH,
      ReminderEntity.PAYROLL_MONTH,
      ReminderEntity.PAYROLL_RUN,
    ]) {
      this.notifications.registerScopeResolver(entityType, (_scope, subjects) =>
        Promise.resolve(subjects.map(() => false)),
      );
    }
  }

  /** A penalty by the record itself (its stage, its employee); an unknown one is covered by nobody. */
  private coverPenalties(scope: UserScope, subjects: readonly NotificationSubject[]): Promise<boolean[]> {
    return this.penalties.coveredBy(
      toEmployeeScope(scope),
      subjects.map((s) => s.entityId),
    );
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
