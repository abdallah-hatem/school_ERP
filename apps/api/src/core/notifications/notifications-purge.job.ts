import { Injectable, Logger } from '@nestjs/common';
import { ScheduledJob, type JobHandler } from '../jobs';
import { NotificationPreferencesService } from './notification-preferences.service';
import { retentionCutoffs } from './notifications.pure';
import { NotificationsRepository } from './repositories/notifications.repository';

export const NOTIFICATIONS_PURGE_JOB = 'core.notifications.purge';

/**
 * Nightly at 02:30 school time (N14, owner 2026-11-18): deletes notifications read more than
 * `readDays` ago, resolved more than `resolvedDays` ago, or made more than `maxDays` ago (90 / 30 /
 * 365 by default, Settings → Notifications), with their items and deliveries. Unread and recent
 * ones stay. Under the job's advisory lock, so two containers run it once. Not audited: notifications
 * are not school data (§9).
 */
@ScheduledJob({ name: NOTIFICATIONS_PURGE_JOB, cron: '30 2 * * *' })
@Injectable()
export class NotificationsPurgeJob implements JobHandler {
  private readonly logger = new Logger(NotificationsPurgeJob.name);

  constructor(
    private readonly preferences: NotificationPreferencesService,
    private readonly notifications: NotificationsRepository,
  ) {}

  async run(now: Date = new Date()): Promise<void> {
    const cutoffs = retentionCutoffs(now, await this.preferences.retention());
    const deleted = await this.notifications.deleteExpired(cutoffs);
    this.logger.log(`Deleted ${deleted} expired notification(s)`);
  }
}
