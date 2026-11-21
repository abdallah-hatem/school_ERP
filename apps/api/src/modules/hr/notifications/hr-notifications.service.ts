import { Injectable } from '@nestjs/common';
import {
  AuditEntityType,
  PayrollStatus,
  PenaltyStatus,
  notificationDedupeKey,
  type Month,
  type NotificationSubject,
  type Uuid,
} from '@school-erp/shared';
import { NotificationsService } from '../../../core/notifications';
import { PermissionsService } from '../../../core/permissions';
import { toEmployeeScope } from '../access/employee-scope.pure';
import { PayrollRunsRepository } from '../payroll/repositories/payroll-runs.repository';
import { payrollReadyParams, type PayrollReadyFacts } from './hr-notifications.pure';

/** A recorded penalty, as its "waiting for review / approval" sentences need it. */
export interface RecordedPenalty {
  id: Uuid;
  employee: { id: Uuid; nameEn: string; nameAr: string };
  violation: { nameEn: string; nameAr: string };
  /** Where it happened (the review sentence names it). */
  stage: { nameEn: string; nameAr: string };
  level: number;
  month: Month;
  /** PENDING_REVIEW → its stage head is told; WAITING_HR → HR's approvers. */
  status: PenaltyStatus;
}

/** A rejected penalty: its recorder is told (owner 2026-11-21). */
export interface RejectedPenalty {
  id: Uuid;
  employee: { id: Uuid; nameEn: string; nameAr: string };
  violation: { nameEn: string; nameAr: string };
  createdById: Uuid | null;
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
const PENALTY_REVIEW = 'hr.penalty.awaiting_review';
const PENALTY_REJECTED = 'hr.penalty.rejected';
const PAYROLL_READY = 'hr.payroll.ready_to_approve';
const PAYROLL_RETURNED = 'hr.payroll.returned_by_accounting';

const penaltySubject = (p: { id: Uuid; employee: { id: Uuid } }): NotificationSubject => ({
  entityType: AuditEntityType.PENALTY,
  entityId: p.id,
  employeeId: p.employee.id,
});

const penaltyParams = (p: {
  employee: { nameEn: string; nameAr: string };
  violation: { nameEn: string; nameAr: string };
}) => ({
  employee: { en: p.employee.nameEn, ar: p.employee.nameAr },
  violation: { en: p.violation.nameEn, ar: p.violation.nameAr },
});

const runSubject = (id: Uuid): NotificationSubject => ({
  entityType: AuditEntityType.PAYROLL_RUN,
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
 * minus the actor. For a scoped holder core asks HR's scope resolvers (`access/hr-notification-
 * scopes.ts`): a penalty by its employee's stage or team (R5), as the employee is now (a re-check
 * at read, N11); a payroll run only at scope `all`.
 */
@Injectable()
export class HrNotificationsService {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly permissions: PermissionsService,
    private readonly runs: PayrollRunsRepository,
  ) {}

  /**
   * A penalty was recorded (§4, §11): whoever acts next is told — the stage head of its stage
   * (PENDING_REVIEW, "waiting for your review"; the other stage's head never, owner 2026-11-21), or
   * HR's approvers (WAITING_HR) — never the actor, nor the penalised employee (`excludeUserIds`).
   * The month's payroll is no longer ready — an open "ready" is resolved as done.
   */
  async penaltyRecorded(
    penalty: RecordedPenalty,
    actorId: Uuid | null,
    excludeUserIds: readonly Uuid[] = [],
  ): Promise<void> {
    if (penalty.status === PenaltyStatus.PENDING_REVIEW) {
      await this.notifications.notify({
        type: PENALTY_REVIEW,
        subject: penaltySubject(penalty),
        params: { ...penaltyParams(penalty), stage: { en: penalty.stage.nameEn, ar: penalty.stage.nameAr } },
        dedupeKey: notificationDedupeKey(PENALTY_REVIEW, penalty.id),
        actorId,
        excludeUserIds,
      });
    } else {
      await this.askHr(penalty, actorId, excludeUserIds);
    }
    const run = await this.runs.findByMonth(penalty.month);
    if (run?.status === PayrollStatus.DRAFT) {
      await this.notifications.resolve({
        type: PAYROLL_READY,
        subject: runSubject(run.id),
        resolution: 'done',
      });
    }
  }

  /**
   * The stage head approved it (§4 two steps): their "waiting for your review" reads "Approved by
   * …" for every head told, and HR's approvers are told now.
   */
  async penaltyReviewed(
    penalty: RecordedPenalty,
    byUserId: Uuid | null,
    excludeUserIds: readonly Uuid[] = [],
  ): Promise<void> {
    await this.resolvePenaltyItems(PENALTY_REVIEW, penalty.id, 'approved', byUserId);
    await this.askHr(penalty, byUserId, excludeUserIds);
  }

  /**
   * HR approved it: everyone's "waiting" for it reads "Approved by …" (N10) — the review's too,
   * when HR decided a penalty nobody could review.
   */
  async penaltyApproved(id: Uuid, byUserId: Uuid | null): Promise<void> {
    await this.resolvePenalty(id, 'approved', byUserId);
    await this.resolvePenaltyItems(PENALTY_REVIEW, id, 'approved', byUserId);
  }

  /**
   * Rejected at either step (owner 2026-11-21): whatever waited for it reads "Rejected by …", and
   * the recorder is told — not when they rejected it themselves, and never with the reason (it may
   * reach a push alert; the reason shows on the penalty).
   */
  async penaltyRejected(penalty: RejectedPenalty, byUserId: Uuid | null): Promise<void> {
    await this.resolvePenaltyItems(PENALTY_REVIEW, penalty.id, 'rejected', byUserId);
    await this.resolvePenaltyItems(PENALTY_WAITING, penalty.id, 'rejected', byUserId);
    if (!penalty.createdById) return;
    await this.notifications.notify({
      type: PENALTY_REJECTED,
      subject: penaltySubject(penalty),
      params: penaltyParams(penalty),
      dedupeKey: notificationDedupeKey(PENALTY_REJECTED, penalty.id),
      actorId: byUserId,
      onlyUserIds: [penalty.createdById],
    });
  }

  /**
   * The penalty was cancelled. Only a waiting one has a "waiting" open (at either step); an
   * approved one cancelled later has none (plan N2 edge 6) — resolving it is then a no-op.
   */
  async penaltyCancelled(id: Uuid, byUserId: Uuid | null): Promise<void> {
    await this.resolvePenalty(id, 'cancelled', byUserId);
    await this.resolvePenaltyItems(PENALTY_REVIEW, id, 'cancelled', byUserId);
  }

  /** HR's approvers are told a penalty waits for them ("waiting for your approval"). */
  private async askHr(penalty: RecordedPenalty, actorId: Uuid | null, excludeUserIds: readonly Uuid[]) {
    await this.notifications.notify({
      type: PENALTY_WAITING,
      subject: penaltySubject(penalty),
      params: { ...penaltyParams(penalty), level: penalty.level },
      dedupeKey: notificationDedupeKey(PENALTY_WAITING, penalty.id),
      actorId,
      excludeUserIds,
    });
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

  /**
   * The run was approved: its "ready" reads "Approved by …" (N10). "Still a draft" is the
   * reminders' (`HrRemindersService.payrollRunApproved`).
   */
  async payrollApproved(id: Uuid, byUserId: Uuid | null): Promise<void> {
    await this.notifications.resolve({
      type: PAYROLL_READY,
      subject: runSubject(id),
      resolution: 'approved',
      byUserId,
    });
    // Approved again after Accounting sent it back: that item is done too.
    await this.notifications.resolve({
      type: PAYROLL_RETURNED,
      subject: runSubject(id),
      resolution: 'approved',
      byUserId,
    });
  }

  /**
   * Accounting sent an approved run back (§10): HR's approvers are told the month and why. One item
   * per return (dedupe key: the run and the moment); it resolves when the run is approved again.
   */
  async payrollReturned(run: { id: Uuid; month: Month; reason: string }, actorId: Uuid | null): Promise<void> {
    await this.notifications.notify({
      type: PAYROLL_RETURNED,
      subject: runSubject(run.id),
      params: { month: run.month, reason: run.reason },
      dedupeKey: notificationDedupeKey(PAYROLL_RETURNED, run.id, new Date().toISOString()),
      actorId,
    });
  }

  private resolvePenalty(id: Uuid, resolution: 'approved' | 'cancelled', byUserId: Uuid | null): Promise<void> {
    return this.resolvePenaltyItems(PENALTY_WAITING, id, resolution, byUserId);
  }

  private async resolvePenaltyItems(
    type: typeof PENALTY_WAITING | typeof PENALTY_REVIEW,
    id: Uuid,
    resolution: 'approved' | 'rejected' | 'cancelled',
    byUserId: Uuid | null,
  ): Promise<void> {
    await this.notifications.resolve({
      type,
      subject: { entityType: AuditEntityType.PENALTY, entityId: id },
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
}
