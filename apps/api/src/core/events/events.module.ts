import { Global, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { AuditModule } from '../audit';
import { DomainEvents } from './domain-events';
import { EventListeners } from './event-listeners';
import { OutboxAdmin } from './outbox-admin.service';
import { OutboxController } from './outbox.controller';
import { OutboxDelivery } from './outbox-delivery.service';
import { OutboxCleanupJob, OutboxDeliverJob } from './outbox.jobs';
import { OutboxRepository } from './repositories/outbox.repository';

/**
 * core/events — domain events (docs/ARCHITECTURE.md → How modules talk to each other). Global, so
 * any module can inject `DomainEvents` to publish; listeners are found at boot wherever they are.
 * Must-deliver events go through the outbox (`outbox_events`, `outbox_deliveries`), delivered by the
 * nudge after each commit and the `outbox.deliver` poll; `outbox.cleanup` runs nightly.
 */
@Global()
@Module({
  imports: [DiscoveryModule, AuditModule],
  controllers: [OutboxController],
  providers: [
    DomainEvents,
    EventListeners,
    OutboxRepository,
    OutboxDelivery,
    OutboxAdmin,
    OutboxDeliverJob,
    OutboxCleanupJob,
  ],
  exports: [DomainEvents],
})
export class EventsModule {}
