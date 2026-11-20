import { Injectable, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import {
  isMustDeliver,
  type DomainEventName,
  type FireAndForgetEventName,
  type MustDeliverEventName,
} from '@school-erp/shared';
import {
  OnDomainEventMarker,
  OutboxListenerMarker,
  type OutboxDeliveryContext,
} from './listeners';

/** A fire-and-forget listener as registered: its class name (for logs) and its handler. */
export interface RegisteredListener {
  name: string;
  handle(payload: unknown): Promise<void>;
}

/** An outbox listener as registered: its stable name and its handler. */
export interface RegisteredOutboxListener {
  name: string;
  event: MustDeliverEventName;
  handle(payload: unknown, context: OutboxDeliveryContext): Promise<void>;
}

interface HasHandle {
  handle(...args: unknown[]): Promise<void>;
}

/**
 * Every event listener in the app, found at boot (`@OnDomainEvent`, `@OutboxListener`). Refuses at
 * boot: two outbox listeners with one name, a listener of the wrong kind for its event (the
 * decorators' types already stop it; this catches a cast), a listener with no `handle()`.
 */
@Injectable()
export class EventListeners implements OnModuleInit {
  private readonly inMemory = new Map<FireAndForgetEventName, RegisteredListener[]>();
  private readonly outbox = new Map<string, RegisteredOutboxListener>();

  constructor(private readonly discovery: DiscoveryService) {}

  onModuleInit(): void {
    for (const wrapper of this.discovery.getProviders({ metadataKey: OnDomainEventMarker.KEY })) {
      const definition = this.discovery.getMetadataByDecorator(OnDomainEventMarker, wrapper);
      if (definition && wrapper.instance) {
        this.addInMemory(definition.event, wrapper.name, wrapper.instance as HasHandle);
      }
    }
    for (const wrapper of this.discovery.getProviders({ metadataKey: OutboxListenerMarker.KEY })) {
      const definition = this.discovery.getMetadataByDecorator(OutboxListenerMarker, wrapper);
      if (definition && wrapper.instance) {
        this.addOutbox(definition.event, definition.name, wrapper.instance as HasHandle);
      }
    }
  }

  addInMemory(event: DomainEventName, name: string, instance: HasHandle): void {
    if (isMustDeliver(event)) {
      throw new Error(`${name}: "${event}" is must-deliver — listen with @OutboxListener`);
    }
    assertHandle(name, instance);
    const list = this.inMemory.get(event) ?? [];
    list.push({ name, handle: (payload) => instance.handle(payload) });
    this.inMemory.set(event, list);
  }

  addOutbox(event: DomainEventName, name: string, instance: HasHandle): void {
    if (!isMustDeliver(event)) {
      throw new Error(`Outbox listener "${name}": "${event}" is fire-and-forget — use @OnDomainEvent`);
    }
    if (this.outbox.has(name)) throw new Error(`Two outbox listeners are named "${name}"`);
    assertHandle(name, instance);
    this.outbox.set(name, {
      name,
      event,
      handle: (payload, context) => instance.handle(payload, context),
    });
  }

  /** The fire-and-forget listeners of `event`, in registration order. */
  inMemoryOf(event: FireAndForgetEventName): readonly RegisteredListener[] {
    return this.inMemory.get(event) ?? [];
  }

  /** The names of the outbox listeners of `event` — one delivery row each. */
  outboxNamesOf(event: MustDeliverEventName): string[] {
    return [...this.outbox.values()].filter((l) => l.event === event).map((l) => l.name);
  }

  outboxListener(name: string): RegisteredOutboxListener | undefined {
    return this.outbox.get(name);
  }
}

function assertHandle(name: string, instance: HasHandle): void {
  if (typeof instance.handle !== 'function') throw new Error(`Listener "${name}" has no handle() method`);
}
