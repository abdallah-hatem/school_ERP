import { Injectable, Logger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { AfterCommit } from '../../database/transactions';
import { EventListeners } from './event-listeners';
import {
  afterFailure,
  CLAIM_BATCH,
  CLAIM_LEASE_MS,
  MAX_FAILURES,
  outboxErrorText,
} from './outbox.pure';
import { OutboxRepository, type ClaimedDelivery } from './repositories/outbox.repository';

/** What delivering one claimed row did. */
export type DeliveryOutcome = 'delivered' | 'already_handled' | 'failed' | 'dead';

export interface DeliveryPass {
  delivered: number;
  failed: number;
}

/**
 * Delivers must-deliver events to their outbox listeners (core/events). Two triggers: the nudge
 * right after the publishing transaction commits (`nudge(eventId)`, instant) and the 30-second poll
 * (`OutboxDeliverJob` → `deliverDue()`), the safety net for a crash, a retry coming due, a nudge that
 * lost a race.
 *
 * Connections: a pass claims in one statement (no transaction held), then delivers each row in a
 * transaction of its own — the listener's writes and the "delivered" mark — and records a failure
 * in one more statement after that transaction ended. At most one pooled connection at a time.
 */
@Injectable()
export class OutboxDelivery {
  private readonly logger = new Logger(OutboxDelivery.name);

  constructor(
    private readonly repository: OutboxRepository,
    private readonly listeners: EventListeners,
    private readonly afterCommit: AfterCommit,
    private readonly cls: ClsService,
  ) {}

  /** Delivers one event's due deliveries now. Never throws. */
  nudge(eventId: string, now: () => Date = () => new Date()): Promise<DeliveryPass> {
    return this.pass({ eventId }, now);
  }

  /** Delivers every due delivery (up to one batch), oldest event first. Never throws. */
  deliverDue(now: () => Date = () => new Date()): Promise<DeliveryPass> {
    return this.pass({}, now);
  }

  private async pass(scope: { eventId?: string }, now: () => Date): Promise<DeliveryPass> {
    const result: DeliveryPass = { delivered: 0, failed: 0 };
    let claimed: ClaimedDelivery[];
    try {
      const at = now();
      claimed = await this.repository.claim({
        ...scope,
        now: at,
        leaseUntil: new Date(at.getTime() + CLAIM_LEASE_MS),
        limit: CLAIM_BATCH,
      });
    } catch (e) {
      this.logger.error('Could not claim outbox deliveries', outboxErrorText(e));
      return result;
    }
    for (const delivery of claimed) {
      const outcome = await this.deliver(delivery, now);
      if (outcome === 'delivered') result.delivered += 1;
      if (outcome === 'failed' || outcome === 'dead') result.failed += 1;
    }
    return result;
  }

  /**
   * Delivers one claimed row: in one transaction, marks it delivered (stops if it already was —
   * the idempotency guard) and runs the listener, so the two commit together. In a context of its
   * own: no request's user, IP or transaction leaks into the listener. A failure rolls the listener
   * back and is recorded with its next try, or as dead at the 10th.
   */
  async deliver(delivery: ClaimedDelivery, now: () => Date = () => new Date()): Promise<DeliveryOutcome> {
    const listener = this.listeners.outboxListener(delivery.listener);
    try {
      if (!listener) throw new Error(`No outbox listener named "${delivery.listener}"`);
      const ran = await this.cls.run({ ifNested: 'override' }, () =>
        this.afterCommit.transaction(async () => {
          if (!(await this.repository.markDelivered(delivery.id, now()))) return false;
          await listener.handle(delivery.payload, {
            eventId: delivery.eventId,
            deliveryId: delivery.id,
            attempt: delivery.attempts + 1,
            publishedAt: delivery.publishedAt,
          });
          await this.repository.settleEvent(delivery.eventId);
          return true;
        }),
      );
      return ran ? 'delivered' : 'already_handled';
    } catch (e) {
      return this.fail(delivery, e, now());
    }
  }

  private async fail(delivery: ClaimedDelivery, e: unknown, at: Date): Promise<DeliveryOutcome> {
    const failures = delivery.attempts + 1;
    const next = afterFailure(failures, at);
    const error = outboxErrorText(e);
    const where = `"${delivery.eventName}" → ${delivery.listener} (delivery ${delivery.id})`;
    try {
      const recorded = await this.repository.recordFailure(delivery.id, delivery.attempts, {
        ...next,
        error,
      });
      if (recorded && next.status === 'dead') {
        await this.repository.setEventStatus(delivery.eventId, 'dead');
        // TODO(notifications): a system notification to the admins.
        this.logger.error(`Outbox delivery dead after ${MAX_FAILURES} failures: ${where}`, error);
        return 'dead';
      }
    } catch (recordError) {
      this.logger.error(`Could not record an outbox failure: ${where}`, outboxErrorText(recordError));
    }
    this.logger.warn(`Outbox delivery failed (try ${failures}), retried at ${next.nextAttemptAt.toISOString()}: ${where}: ${error}`);
    return 'failed';
  }
}
