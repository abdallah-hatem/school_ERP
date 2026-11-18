import { Injectable, Logger } from '@nestjs/common';
import { ScheduledJob, type JobHandler } from '../jobs';
import { OutboxDelivery } from './outbox-delivery.service';
import { DELIVERED_RETENTION_MS } from './outbox.pure';
import { OutboxRepository } from './repositories/outbox.repository';

export const OUTBOX_DELIVER_JOB = 'outbox.deliver';
export const OUTBOX_CLEANUP_JOB = 'outbox.cleanup';

/**
 * Every 30 seconds: delivers whatever is due — the safety net behind the nudge after each commit
 * (a crash in between, a retry coming due, a lease that ran out). No advisory lock (`lock: false`):
 * claims use `FOR UPDATE SKIP LOCKED`, so containers can poll at once, and the lock's transaction
 * would hold a connection while the deliveries need another. Recorded in `job_runs` only when it
 * delivered or failed something.
 */
@ScheduledJob({ name: OUTBOX_DELIVER_JOB, cron: '*/30 * * * * *', lock: false })
@Injectable()
export class OutboxDeliverJob implements JobHandler {
  constructor(private readonly delivery: OutboxDelivery) {}

  async run(): Promise<void | 'idle'> {
    const { delivered, failed } = await this.delivery.deliverDue();
    if (delivered + failed === 0) return 'idle';
    if (failed > 0) throw new Error(`${failed} outbox deliver${failed === 1 ? 'y' : 'ies'} failed (${delivered} delivered)`);
  }
}

/**
 * Nightly at 03:30 school time: deletes delivered events older than 30 days with their deliveries.
 * Dead and pending ones stay. A single delete, safe in two containers at once (`lock: false`).
 */
@ScheduledJob({ name: OUTBOX_CLEANUP_JOB, cron: '30 3 * * *', lock: false })
@Injectable()
export class OutboxCleanupJob implements JobHandler {
  private readonly logger = new Logger(OutboxCleanupJob.name);

  constructor(private readonly repository: OutboxRepository) {}

  async run(): Promise<void> {
    const deleted = await this.repository.deleteDeliveredBefore(new Date(Date.now() - DELIVERED_RETENTION_MS));
    this.logger.log(`Deleted ${deleted} delivered outbox event(s) older than 30 days`);
  }
}
