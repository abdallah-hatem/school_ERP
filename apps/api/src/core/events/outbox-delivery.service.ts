import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { AfterCommit } from '../../database/transactions';
import { EventListeners } from './event-listeners';
import {
  afterFailure,
  CLAIM_BATCH,
  CLAIM_LEASE_MS,
  claimDueBy,
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
 * right after the publishing transaction commits (`nudgeSoon(eventId)`: started, never awaited by
 * the request) and the 30-second poll
 * (`OutboxDeliverJob` → `deliverDue()`), the safety net for a crash, a retry coming due, a nudge that
 * lost a race.
 *
 * Connections: a pass claims in one statement (no transaction held), then delivers each row in a
 * transaction of its own — the listener's writes and the "delivered" mark — and records a failure
 * in one more statement after that transaction ended. At most one pooled connection at a time.
 */
@Injectable()
export class OutboxDelivery implements OnModuleDestroy {
  private readonly logger = new Logger(OutboxDelivery.name);
  /** Nudges started by `nudgeSoon` and not finished yet. */
  private readonly inFlight = new Set<Promise<void>>();

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

  /**
   * Starts `nudge(eventId)` and returns at once — the after-commit nudge, so the request that
   * published answers without waiting for the listeners (a stuck one, e.g. on a lock, can't hold
   * it). It starts on the next turn of the event loop, in a context of its own: not the request's
   * CLS store, so not its transaction, user or IP. Never throws; a failure is logged.
   * `idle()` waits for every nudge started this way (tests, shutdown).
   */
  nudgeSoon(eventId: string): void {
    const started: Promise<void> = new Promise<void>((resolve) => setImmediate(resolve))
      .then(() => this.cls.run({ ifNested: 'override' }, () => this.nudge(eventId)))
      .then(
        () => undefined,
        (e: unknown) => this.logger.error(`Outbox nudge of event ${eventId} failed`, outboxErrorText(e)),
      )
      .finally(() => this.inFlight.delete(started));
    this.inFlight.add(started);
  }

  /** Resolves once no nudge started by `nudgeSoon` is running (including ones started meanwhile). */
  async idle(): Promise<void> {
    while (this.inFlight.size > 0) await Promise.all([...this.inFlight]);
  }

  /** On shutdown, lets the running nudges finish before the database closes. */
  onModuleDestroy(): Promise<void> {
    return this.idle();
  }

  /** Delivers every due delivery (up to one batch), oldest event first. Never throws. */
  deliverDue(now: () => Date = () => new Date()): Promise<DeliveryPass> {
    return this.pass({}, now);
  }

  private async pass(scope: { eventId?: string }, now: () => Date): Promise<DeliveryPass> {
    const result: DeliveryPass = { delivered: 0, failed: 0 };
    let claimed: ClaimedDelivery[];
    // The pass's start: what it claims is due by (with a small tolerance) and what retries count from.
    const claimedAt = now();
    try {
      claimed = await this.repository.claim({
        ...scope,
        dueBy: claimDueBy(claimedAt),
        leaseUntil: new Date(claimedAt.getTime() + CLAIM_LEASE_MS),
        limit: CLAIM_BATCH,
      });
    } catch (e) {
      this.logger.error('Could not claim outbox deliveries', outboxErrorText(e));
      return result;
    }
    for (const delivery of claimed) {
      const outcome = await this.deliver(delivery, now, claimedAt);
      if (outcome === 'delivered') result.delivered += 1;
      if (outcome === 'failed' || outcome === 'dead') result.failed += 1;
    }
    return result;
  }

  /**
   * Delivers one claimed row: in one transaction, marks it delivered (stops if it already was —
   * the idempotency guard) and runs the listener, so the two commit together. In a context of its
   * own: no request's user, IP or transaction leaks into the listener. A failure rolls the listener
   * back and is recorded with its next try — counted from `claimedAt`, the start of the pass that
   * claimed it — or as dead at the 10th failure.
   */
  async deliver(
    delivery: ClaimedDelivery,
    now: () => Date = () => new Date(),
    claimedAt: Date = now(),
  ): Promise<DeliveryOutcome> {
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
      return this.fail(delivery, e, claimedAt);
    }
  }

  private async fail(delivery: ClaimedDelivery, e: unknown, claimedAt: Date): Promise<DeliveryOutcome> {
    const failures = delivery.attempts + 1;
    const next = afterFailure(failures, claimedAt);
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
    this.logger.warn(`Outbox delivery failed (failure ${failures}), retried at ${next.nextAttemptAt.toISOString()}: ${where}: ${error}`);
    return 'failed';
  }
}
