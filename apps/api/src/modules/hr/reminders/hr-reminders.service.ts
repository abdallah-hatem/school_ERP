import { Injectable } from '@nestjs/common';
import type { Month, NotificationTypeKey, Uuid } from '@school-erp/shared';
import { NotificationsService } from '../../../core/notifications';
import { ReminderEntity } from './reminders.pure';

/**
 * Resolves HR's reminders at the moment the thing is done (§11, N3, N10) — inside the caller's
 * own transaction, so the change and the resolve commit together. The daily job
 * (`hr-reminders.job.ts`) sends them and resolves what no longer holds as a safety net.
 * Reminders resolve as `done`, except payroll approval ("Approved by …").
 */
@Injectable()
export class HrRemindersService {
  constructor(private readonly notifications: NotificationsService) {}

  /** The contract end changed, or the employee was deactivated: its contract reminders are done. */
  contractChanged(employeeId: Uuid, byUserId: Uuid | null = null): Promise<void> {
    return this.done('hr.contract.ending_soon', ReminderEntity.EMPLOYEE, employeeId, byUserId);
  }

  /** The probation end changed or was cleared, or the employee was deactivated. */
  probationChanged(employeeId: Uuid, byUserId: Uuid | null = null): Promise<void> {
    return this.done('hr.probation.ending_soon', ReminderEntity.EMPLOYEE, employeeId, byUserId);
  }

  /** Deactivated: no reminder about them stays open (§3, spec edge 8). */
  async employeeDeactivated(employeeId: Uuid, byUserId: Uuid | null = null): Promise<void> {
    await this.contractChanged(employeeId, byUserId);
    await this.probationChanged(employeeId, byUserId);
  }

  /** The month's lateness was saved (even all zeros, §11 GUESS). */
  latenessSaved(month: Month, byUserId: Uuid | null): Promise<void> {
    return this.done('hr.lateness.not_entered', ReminderEntity.LATENESS_MONTH, month, byUserId);
  }

  /** The month has a payroll run now. */
  payrollRunCreated(month: Month, byUserId: Uuid | null): Promise<void> {
    return this.done('hr.payroll.not_prepared', ReminderEntity.PAYROLL_MONTH, month, byUserId);
  }

  /** The run is approved: "still a draft" reads "Approved by …"; the month is locked, so its lateness reminder is done (§5). */
  async payrollRunApproved(runId: Uuid, month: Month, byUserId: Uuid | null): Promise<void> {
    await this.notifications.resolve({
      type: 'hr.payroll.not_approved',
      subject: { entityType: ReminderEntity.PAYROLL_RUN, entityId: runId },
      resolution: 'approved',
      byUserId,
    });
    await this.latenessSaved(month, byUserId);
  }

  private async done(
    type: NotificationTypeKey,
    entityType: string,
    entityId: string,
    byUserId: Uuid | null,
  ): Promise<void> {
    await this.notifications.resolve({
      type,
      subject: { entityType, entityId },
      resolution: 'done',
      byUserId,
    });
  }
}
