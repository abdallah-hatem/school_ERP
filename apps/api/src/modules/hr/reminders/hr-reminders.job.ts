import { Injectable, Logger } from '@nestjs/common';
import { schoolDayOf, type IsoDate, type ReminderRule } from '@school-erp/shared';
import { ScheduledJob, type JobHandler } from '../../../core/jobs';
import { NotificationsService } from '../../../core/notifications';
import { AfterCommit } from '../../../database/transactions';
import { HrSettingsService } from '../settings/hr-settings.service';
import {
  contractReminders,
  latenessReminders,
  payrollNotApprovedReminders,
  payrollNotPreparedReminders,
  probationReminders,
  reminderMonths,
  REMINDER_TYPES,
  type OpenReminder,
  type ReminderPlan,
  type ReminderType,
} from './reminders.pure';
import { RemindersRepository } from './repositories/reminders.repository';

export const HR_REMINDERS_JOB = 'hr.reminders.daily';

/**
 * HR's reminders (§11, N3, N16), every day at 07:00 school time (Africa/Cairo): contracts and
 * probation ending soon, lateness not entered from the 25th, payroll not prepared / still a draft
 * from the 28th (HR settings `hr.reminders.*`).
 *
 * - **Today is the school's day** (`schoolDayOf`), whatever the server's clock or UTC says.
 * - **Never twice**: the job's advisory lock (one container runs it) and the dedupe keys (a re-run,
 *   a restart, or two containers racing each item → one item per person, N9).
 * - **One transaction per type** (`afterCommit.inTransaction`, one connection, the types in turn):
 *   the open items, the facts, the resolves and the sends commit together, so a failure sends
 *   nothing half-way for that type; the other types still run, the run is recorded `failed`, and
 *   the next day's run catches up (due = today or overdue).
 * - Open reminders whose condition no longer holds are resolved first (`done`) — the safety net
 *   behind HR's services resolving them at the moment of the change.
 */
@ScheduledJob({ name: HR_REMINDERS_JOB, cron: '0 7 * * *' })
@Injectable()
export class HrRemindersJob implements JobHandler {
  private readonly logger = new Logger(HrRemindersJob.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly repository: RemindersRepository,
    private readonly settings: HrSettingsService,
    private readonly afterCommit: AfterCommit,
  ) {}

  /** The moment of the run (a test fixes it). */
  now(): Date {
    return new Date();
  }

  async run(): Promise<void> {
    const now = this.now();
    const today = schoolDayOf(now);
    const rule = await this.settings.reminders();
    const failures: string[] = [];
    for (const type of REMINDER_TYPES) {
      try {
        const { resolved, sent } = await this.afterCommit.inTransaction(() =>
          this.runType(type, today, rule, now),
        );
        if (resolved || sent) this.logger.log(`${type}: ${sent} sent, ${resolved} resolved (${today})`);
      } catch (e) {
        failures.push(`${type}: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
      }
    }
    if (failures.length) throw new Error(`HR reminders failed for ${failures.join('\n')}`);
  }

  /** One type: its open items and facts → resolve what no longer holds, then send what is due. */
  private async runType(
    type: ReminderType,
    today: IsoDate,
    rule: ReminderRule,
    now: Date,
  ): Promise<{ resolved: number; sent: number }> {
    const open = await this.notifications.openItems(type);
    const plan = await this.plan(type, today, rule, open);
    let resolved = 0;
    for (const r of plan.resolve) {
      resolved += (
        await this.notifications.resolve({ ...r, resolution: 'done', byUserId: null, now })
      ).resolved;
    }
    let sent = 0;
    for (const n of plan.notify) {
      sent += (await this.notifications.notify({ ...n, actorId: null, now })).created;
    }
    return { resolved, sent };
  }

  private async plan(
    type: ReminderType,
    today: IsoDate,
    rule: ReminderRule,
    open: readonly OpenReminder[],
  ): Promise<ReminderPlan> {
    switch (type) {
      case 'hr.contract.ending_soon':
        return contractReminders(today, rule, await this.repository.activeEmployees(), open);
      case 'hr.probation.ending_soon':
        return probationReminders(today, rule, await this.repository.activeEmployees(), open);
      case 'hr.lateness.not_entered':
        return latenessReminders(today, rule, await this.months(today, open), open);
      case 'hr.payroll.not_prepared':
        return payrollNotPreparedReminders(today, rule, await this.months(today, open), open);
      case 'hr.payroll.not_approved':
        return payrollNotApprovedReminders(today, rule, await this.months(today, open), open);
    }
  }

  private months(today: IsoDate, open: readonly OpenReminder[]) {
    return this.repository.months(reminderMonths(today, open));
  }
}
