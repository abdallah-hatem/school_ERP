import { Injectable, Logger } from '@nestjs/common';
import {
  isMustDeliver,
  type DomainEventMap,
  type DomainEventName,
  type FireAndForgetEventName,
  type MustDeliverEventName,
} from '@school-erp/shared';
import { AfterCommit } from '../../database/transactions';
import { EventListeners } from './event-listeners';
import { OutboxDelivery } from './outbox-delivery.service';
import { outboxErrorText } from './outbox.pure';
import { OutboxRepository } from './repositories/outbox.repository';

/**
 * The options `publish` takes for event `N`: a must-deliver event needs `{ mustDeliver: true }`, a
 * fire-and-forget one takes nothing (or `{ mustDeliver: false }`) — the wrong one fails typecheck.
 */
export type PublishOptions<N extends DomainEventName> = N extends MustDeliverEventName
  ? [options: { mustDeliver: true }]
  : [options?: { mustDeliver?: false }];

/**
 * The only way to send a domain event (docs/ARCHITECTURE.md → How modules talk to each other).
 * Always after the commit: inside a transaction the work is queued on `AfterCommit` (dropped if it
 * rolls back); outside one it happens now. Inside a transaction with no after-commit queue (a plain
 * `txHost.withTransaction`) it throws (`AfterCommitWithoutQueueError`).
 *
 * - **Fire-and-forget** (cache refresh, notices): after the commit each `@OnDomainEvent` listener
 *   runs in turn, awaited; a throw is logged and never fails the request. Not retried.
 * - **Must-deliver** (`MUST_DELIVER_EVENTS`): an `outbox_events` row and one `outbox_deliveries` row
 *   per `@OutboxListener`, written **in the caller's transaction** (or one of their own outside
 *   one), so the event exists exactly when the change does; delivered right after the commit (the
 *   nudge — started then, not awaited: the request never waits for an outbox listener) and by the
 *   30-second poll, with retries. `idle()` waits for the started nudges (tests).
 */
@Injectable()
export class DomainEvents {
  private readonly logger = new Logger(DomainEvents.name);

  constructor(
    private readonly afterCommit: AfterCommit,
    private readonly listeners: EventListeners,
    private readonly outbox: OutboxRepository,
    private readonly delivery: OutboxDelivery,
  ) {}

  async publish<N extends DomainEventName>(
    name: N,
    payload: DomainEventMap[N],
    ...[options]: PublishOptions<N>
  ): Promise<void> {
    const mustDeliver = options?.mustDeliver === true;
    if (mustDeliver !== isMustDeliver(name)) {
      throw new Error(
        `"${name}" is ${isMustDeliver(name) ? 'must-deliver: pass { mustDeliver: true }' : 'fire-and-forget: drop mustDeliver'}`,
      );
    }
    if (isMustDeliver(name)) await this.toOutbox(name, payload);
    else await this.afterCommit.run(() => this.dispatch(name, payload));
  }

  /**
   * Resolves once every after-commit nudge started so far has finished — the outbox listeners have
   * run (or failed and been recorded). For tests: a request returns before its nudge is done.
   */
  idle(): Promise<void> {
    return this.delivery.idle();
  }

  /** Runs every fire-and-forget listener of `name`, in order; logs each failure and goes on. */
  private async dispatch(name: FireAndForgetEventName, payload: unknown): Promise<void> {
    for (const listener of this.listeners.inMemoryOf(name)) {
      try {
        await listener.handle(payload);
      } catch (e) {
        this.logger.error(`Listener ${listener.name} failed on "${name}"`, outboxErrorText(e));
      }
    }
  }

  private async toOutbox(name: MustDeliverEventName, payload: unknown): Promise<void> {
    const listeners = this.listeners.outboxNamesOf(name);
    await this.afterCommit.inTransaction(async () => {
      const eventId = await this.outbox.insertEvent(name, payload, listeners, new Date());
      if (listeners.length > 0) {
        await this.afterCommit.run(() => this.delivery.nudgeSoon(eventId));
      }
    });
  }
}
