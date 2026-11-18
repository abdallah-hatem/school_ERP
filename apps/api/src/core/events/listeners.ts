import { DiscoveryService } from '@nestjs/core';
import type {
  DomainEventMap,
  FireAndForgetEventName,
  MustDeliverEventName,
} from '@school-erp/shared';

/*
 * Event listeners (docs/ARCHITECTURE.md → How modules talk to each other). A listener is a provider
 * in its module, marked with one of the two decorators below and listed in its module's providers;
 * `EventListeners` finds it at boot. The decorator's event decides the payload type `handle` gets.
 */

/** A fire-and-forget listener: runs after the commit, awaited; a throw is logged, never retried. */
export interface DomainEventListener<N extends FireAndForgetEventName> {
  handle(payload: DomainEventMap[N]): Promise<void>;
}

/** What an outbox listener knows about the delivery it is handling. */
export interface OutboxDeliveryContext {
  eventId: string;
  deliveryId: string;
  /** 1 on the first try. */
  attempt: number;
  /** When the event was published. */
  publishedAt: Date;
}

/**
 * A must-deliver (outbox) listener. `handle` runs inside the delivery's transaction: its writes
 * (through `txHost.tx`) commit together with the "delivered" mark, so a redelivery is a no-op.
 * A throw rolls them back and the delivery is retried (10 s, 1 min, 5 min, 30 min, then every 2 h;
 * dead after 10 failures). Never open a RequiresNew transaction inside it: that holds a second
 * pooled connection while the delivery's is held.
 */
export interface OutboxEventListener<N extends MustDeliverEventName> {
  handle(payload: DomainEventMap[N], context: OutboxDeliveryContext): Promise<void>;
}

export interface OnDomainEventDefinition {
  event: FireAndForgetEventName;
}

export interface OutboxListenerDefinition {
  event: MustDeliverEventName;
  /**
   * Unique and stable, `<module>.<what>` (e.g. `accounting.payroll-taxes`): it names the listener's
   * delivery rows, so renaming it strands pending ones (they fail as "no listener", then go dead).
   */
  name: string;
}

/** Discovery keys (read by `EventListeners`). */
export const OnDomainEventMarker = DiscoveryService.createDecorator<OnDomainEventDefinition>();
export const OutboxListenerMarker = DiscoveryService.createDecorator<OutboxListenerDefinition>();

type Constructor<T> = new (...args: never[]) => T;

/**
 * Marks a fire-and-forget listener: `@OnDomainEvent(CoreEvent.USER_SESSIONS_ENDED)` on a class whose
 * `handle(payload)` takes that event's payload (checked by the compiler).
 */
export function OnDomainEvent<N extends FireAndForgetEventName>(event: N) {
  return <C extends Constructor<DomainEventListener<N>>>(target: C): void => {
    OnDomainEventMarker({ event })(target);
  };
}

/**
 * Marks a must-deliver listener: `@OutboxListener({ event: HrEvent.PAYROLL_APPROVED, name:
 * 'accounting.payroll-taxes' })` on a class whose `handle(payload, context)` takes that event's payload.
 * Idempotent by construction: each (event, listener) is handled once (`OutboxDelivery`).
 */
export function OutboxListener<N extends MustDeliverEventName>(definition: { event: N; name: string }) {
  return <C extends Constructor<OutboxEventListener<N>>>(target: C): void => {
    OutboxListenerMarker(definition)(target);
  };
}
