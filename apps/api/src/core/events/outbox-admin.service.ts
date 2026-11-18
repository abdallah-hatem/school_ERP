import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditEntityType,
  ErrorCode,
  type OutboxDeliveryView,
  type OutboxStatus,
  type Paginated,
} from '@school-erp/shared';
import { CodedException } from '../../common/errors/coded.exception';
import { AfterCommit } from '../../database/transactions';
import { AuditService } from '../audit';
import { OutboxDelivery } from './outbox-delivery.service';
import { OutboxRepository, type DeliveryRow } from './repositories/outbox.repository';

function toView(row: DeliveryRow): OutboxDeliveryView {
  return {
    id: row.id,
    eventId: row.eventId,
    eventName: row.event.name,
    listener: row.listener,
    status: row.status,
    attempts: row.attempts,
    nextAttemptAt: row.nextAttemptAt.toISOString(),
    lastError: row.lastError,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    createdAt: row.event.createdAt.toISOString(),
  };
}

/** The admin side of the outbox (`core.outbox.manage`): see deliveries, retry a dead one. */
@Injectable()
export class OutboxAdmin {
  constructor(
    private readonly repository: OutboxRepository,
    private readonly delivery: OutboxDelivery,
    private readonly audit: AuditService,
    private readonly afterCommit: AfterCommit,
  ) {}

  async list(query: {
    status?: OutboxStatus;
    page: number;
    limit: number;
  }): Promise<Paginated<OutboxDeliveryView>> {
    const { rows, total } = await this.repository.listDeliveries(query.status, query.page, query.limit);
    return {
      data: rows.map(toView),
      total,
      page: query.page,
      limit: query.limit,
      hasNextPage: query.page * query.limit < total,
      hasPreviousPage: query.page > 1,
    };
  }

  /**
   * A dead delivery gets one more try: back to pending, due now, recorded as
   * `core.outbox.retry` (status dead → pending) in the request's transaction, and tried right
   * after the commit. Its attempts are kept, so another failure makes it dead again. 404 for an
   * unknown id; 409 `OUTBOX_NOT_DEAD` for one that isn't dead.
   */
  async retry(id: string): Promise<OutboxDeliveryView> {
    return this.afterCommit.inTransaction(async () => {
      const row = await this.repository.findDelivery(id);
      if (!row) throw new NotFoundException();
      if (row.status !== 'dead' || !(await this.repository.revive(id, new Date()))) {
        throw new CodedException(HttpStatus.CONFLICT, ErrorCode.OUTBOX_NOT_DEAD);
      }
      await this.repository.setEventStatus(row.eventId, 'pending');
      await this.audit.record({
        action: 'core.outbox.retry',
        entity: {
          type: AuditEntityType.OUTBOX_DELIVERY,
          id,
          label: `${row.event.name} → ${row.listener}`,
        },
        before: { status: 'dead' },
        after: { status: 'pending' },
      });
      await this.afterCommit.run(async () => {
        await this.delivery.nudge(row.eventId);
      });
      return toView((await this.repository.findDelivery(id))!);
    });
  }
}
