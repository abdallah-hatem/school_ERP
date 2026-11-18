import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  PayrollStatus,
  notificationDedupeKey,
  type Month,
  type NotificationSubject,
  type Uuid,
} from '@school-erp/shared';
import { NotificationsService } from '../../../core/notifications';
import { PermissionsService, type UserScope } from '../../../core/permissions';
import { toEmployeeScope } from '../access/employee-scope.pure';
import { EmployeesService } from '../employees/services/employees.service';
import { PayrollRunsRepository } from '../payroll/repositories/payroll-runs.repository';
import {
  HR_SUBJECT,
  payrollReadyParams,
  subjectEmployee,
  subjectsCovered,
  type PayrollReadyFacts,
} from './hr-notifications.pure';

/** A recorded penalty, as its "waiting for approval" sentence needs it. */
export interface RecordedPenalty {
  id: Uuid;
  employee: { id: Uuid; nameEn: string; nameAr: string };
  violation: { nameEn: string; nameAr: string };
  level: number;
  month: Month;
}

/** A payroll run just created or recalculated. */
export interface CalculatedRun extends PayrollReadyFacts {
  id: Uuid;
  /** When its lines were (re)built: one "ready" per calculation (dedupe key). */
  calculatedAt: Date;
  /** Pending penalties dated in its month right now: any → not ready (§6). */
  pendingPenalties: number;
}

const PENALTY_WAITING = 'hr.penalty.awaiting_approval';
const PAYROLL_READY = 'hr.payroll.ready_to_approve';
const PAYROLL_STILL_DRAFT = 'hr.payroll.not_approved';

const runSubject = (id: Uuid): NotificationSubject => ({
  entityType: HR_SUBJECT.PAYROLL_RUN,
  entityId: id,
});

/**
 * HR's approval notifications (§11, plan N2): "a penalty is waiting for your approval" and "a
 * payroll month is ready to approve", sent and resolved through core's `NotificationsService`.
 * Every call runs **inside the HR change's own transaction** (the penalty or payroll write): the
 * change and its notifications commit or roll back together (N4) — a refused recording sends
 * nothing. No `RequiresNew`: one pooled connection (ARCHITECTURE → Transactions).
 *
 * Who receives is core's (N5): holders of the type's permission whose scope covers the subject,
 * minus the actor. For a scoped holder core asks the resolvers HR registers here at start-up —
 * an employee's stage or team (R5), as the employee is now (a re-check at read, N11).
 */
@Injectable()
export class HrNotificationsService implements OnModuleInit {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly permissions: PermissionsService,
    private readonly employees: EmployeesService,
    private readonly runs: PayrollRunsRepository,
  ) {}

  onModuleInit(): void {
    const byEmployee = (scope: UserScope, subjects: readonly NotificationSubject[]) =>
      this.coveredByEmployee(scope, subjects);
    this.notifications.registerScopeResolver(HR_SUBJECT.EMPLOYEE, byEmployee);
    this.notifications.registerScopeResolver(HR_SUBJECT.PENALTY, byEmployee);
    // A run lists everyone's pay: only scope `all` covers it (core answers `all` itself).
    this.notifications.registerScopeResolver(HR_SUBJECT.PAYROLL_RUN, (_scope, subjects) =>
      Promise.resolve(subjects.map(() => false)),
    );
  }

  /**
   * A penalty was recorded (pending): its approvers are told (§4, §11), and the month's payroll
   * is no longer ready — an open "ready" is resolved as done (spec → Payroll "ready" in detail).
   */
  async penaltyRecorded(penalty: RecordedPenalty, actorId: Uuid | null): Promise<void> {
    await this.notifications.notify({
      type: PENALTY_WAITING,
      subject: {
        entityType: HR_SUBJECT.PENALTY,
        entityId: penalty.id,
        employeeId: penalty.employee.id,
      },
      params: {
        employee: { en: penalty.employee.nameEn, ar: penalty.employee.nameAr },
        violation: { en: penalty.violation.nameEn, ar: penalty.violation.nameAr },
        level: penalty.level,
      },
      dedupeKey: notificationDedupeKey(PENALTY_WAITING, penalty.id),
      actorId,
    });
    const run = await this.runs.findByMonth(penalty.month);
    if (run?.status === PayrollStatus.DRAFT) {
      await this.notifications.resolve({
        type: PAYROLL_READY,
        subject: runSubject(run.id),
        resolution: 'done',
      });
    }
  }

  /** The penalty was approved: everyone's "waiting" for it reads "Approved by …" (N10). */
  async penaltyApproved(id: Uuid, byUserId: Uuid | null): Promise<void> {
    await this.resolvePenalty(id, 'approved', byUserId);
  }

  /**
   * The penalty was cancelled. Only a pending one has a "waiting" open; an approved one cancelled
   * later has none (plan N2 edge 6) — resolving it is then a no-op.
   */
  async penaltyCancelled(id: Uuid, byUserId: Uuid | null): Promise<void> {
    await this.resolvePenalty(id, 'cancelled', byUserId);
  }

  /**
   * A draft run was created or recalculated. Only the latest calculation stays open: an earlier
   * "ready" is resolved as done (GUESS, plan N2 edge 12). With no pending penalty in the month the
   * run is ready (§6): its approvers are told, with the net only for those who see the whole run's
   * totals (R7).
   */
  async payrollCalculated(run: CalculatedRun, actorId: Uuid | null): Promise<void> {
    await this.notifications.resolve({
      type: PAYROLL_READY,
      subject: runSubject(run.id),
      resolution: 'done',
    });
    if (run.pendingPenalties > 0) return;
    await this.notifications.notify({
      type: PAYROLL_READY,
      subject: runSubject(run.id),
      paramsFor: async (userId) => payrollReadyParams(run, await this.seesWholeRunTotals(userId)),
      dedupeKey: notificationDedupeKey(PAYROLL_READY, run.month, run.calculatedAt.toISOString()),
      actorId,
    });
  }

  /** The run was approved: its "ready" and "still a draft" read "Approved by …" (N10). */
  async payrollApproved(id: Uuid, byUserId: Uuid | null): Promise<void> {
    for (const type of [PAYROLL_READY, PAYROLL_STILL_DRAFT] as const) {
      await this.notifications.resolve({
        type,
        subject: runSubject(id),
        resolution: 'approved',
        byUserId,
      });
    }
  }

  private async resolvePenalty(
    id: Uuid,
    resolution: 'approved' | 'cancelled',
    byUserId: Uuid | null,
  ): Promise<void> {
    await this.notifications.resolve({
      type: PENALTY_WAITING,
      subject: { entityType: HR_SUBJECT.PENALTY, entityId: id },
      resolution,
      byUserId,
    });
  }

  /** Whether a run's totals show money to this user: `hr.payroll.view` at scope `all` (R7). */
  private async seesWholeRunTotals(userId: Uuid): Promise<boolean> {
    return (
      toEmployeeScope(await this.permissions.scopeFor({ id: userId }, 'hr.payroll.view')).kind ===
      'all'
    );
  }

  /** Whether a scoped user covers each subject's employee — as the employee is now (R5, N11). */
  private async coveredByEmployee(
    scope: UserScope,
    subjects: readonly NotificationSubject[],
  ): Promise<boolean[]> {
    const ids = subjects.map(subjectEmployee).filter((id): id is Uuid => id !== null);
    const covered = await this.employees.filterCoveredBy(toEmployeeScope(scope), ids);
    return subjectsCovered(subjects, covered);
  }
}
