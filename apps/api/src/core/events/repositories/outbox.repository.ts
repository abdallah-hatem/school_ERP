import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { Prisma } from '@prisma/client';
import type { OutboxStatus } from '@school-erp/shared';
import { utcTimestamp as utc } from '../../../database/sql';
import type { DbAdapter } from '../../../database/transactions';

/** A delivery a worker has claimed (its lease is running): everything needed to deliver it. */
export interface ClaimedDelivery {
  id: string;
  eventId: string;
  listener: string;
  /** Tries made before this one. */
  attempts: number;
  eventName: string;
  payload: unknown;
  seq: bigint;
  publishedAt: Date;
}

export interface DeliveryRow {
  id: string;
  eventId: string;
  listener: string;
  status: OutboxStatus;
  attempts: number;
  nextAttemptAt: Date;
  lastError: string | null;
  deliveredAt: Date | null;
  event: { name: string; createdAt: Date };
}

const DELIVERY_SELECT = {
  id: true,
  eventId: true,
  listener: true,
  status: true,
  attempts: true,
  nextAttemptAt: true,
  lastError: true,
  deliveredAt: true,
  event: { select: { name: true, createdAt: true } },
} as const;

/**
 * `outbox_events` and `outbox_deliveries` (core/events). Everything goes through `txHost.tx`: the
 * event is written in the publisher's transaction; a delivery's "delivered" mark in the listener's.
 * Claims and failures run outside any transaction (after a commit, or in the poll), so there they
 * are single statements on the plain client — never a second connection while one is held.
 */
@Injectable()
export class OutboxRepository {
  constructor(private readonly txHost: TransactionHost<DbAdapter>) {}

  private get db() {
    return this.txHost.tx;
  }

  /**
   * The event and one pending delivery per listener, due `now` — in the caller's transaction. With
   * no listener the event is `delivered` at once. Returns the event id.
   */
  async insertEvent(name: string, payload: unknown, listeners: readonly string[], now: Date): Promise<string> {
    const event = await this.db.outboxEvent.create({
      data: {
        name,
        payload: payload as Prisma.InputJsonValue,
        createdAt: now,
        status: listeners.length > 0 ? 'pending' : 'delivered',
        deliveries: {
          create: listeners.map((listener) => ({ listener, status: 'pending', nextAttemptAt: now })),
        },
      },
      select: { id: true },
    });
    return event.id;
  }

  /**
   * Claims up to `limit` due pending deliveries (of one event, or of all), oldest event first: one
   * statement that locks them with `FOR UPDATE SKIP LOCKED` — rows another worker is claiming are
   * skipped, never waited for — and moves their `next_attempt_at` to `leaseUntil`, so no other pass
   * takes them while this one delivers. A worker that dies lets the lease run out: they are retried.
   */
  async claim(options: {
    now: Date;
    leaseUntil: Date;
    limit: number;
    eventId?: string;
  }): Promise<ClaimedDelivery[]> {
    const ofEvent = options.eventId ? Prisma.sql`AND d."event_id" = ${options.eventId}::uuid` : Prisma.empty;
    const rows = await this.db.$queryRaw<ClaimedDelivery[]>`
      WITH due AS (
        SELECT d."id"
        FROM "outbox_deliveries" d
        JOIN "outbox_events" e ON e."id" = d."event_id"
        WHERE d."status" = 'pending' AND d."next_attempt_at" <= ${utc(options.now)} ${ofEvent}
        ORDER BY e."seq", d."listener"
        LIMIT ${options.limit}
        FOR UPDATE OF d SKIP LOCKED
      )
      UPDATE "outbox_deliveries" d
      SET "next_attempt_at" = ${utc(options.leaseUntil)}
      FROM due, "outbox_events" e
      WHERE d."id" = due."id" AND e."id" = d."event_id"
      RETURNING d."id", d."event_id" AS "eventId", d."listener", d."attempts",
        e."name" AS "eventName", e."payload", e."seq", e."created_at" AS "publishedAt"`;
    // RETURNING keeps no order: creation order, then listener.
    return rows.sort((a, b) =>
      a.seq === b.seq ? a.listener.localeCompare(b.listener) : a.seq < b.seq ? -1 : 1,
    );
  }

  /**
   * The idempotency mark, inside the listener's transaction: pending → delivered. False when it was
   * already delivered (or dead) — this (event, listener) is handled: do nothing. A second worker
   * holding the same delivery waits here on the row lock until the first commits, then gets false.
   */
  async markDelivered(id: string, now: Date): Promise<boolean> {
    const { count } = await this.db.outboxDelivery.updateMany({
      where: { id, status: 'pending' },
      data: { status: 'delivered', deliveredAt: now, attempts: { increment: 1 } },
    });
    return count === 1;
  }

  /**
   * Marks the event delivered once every delivery is — in the listener's transaction. The event
   * row is locked first so two listeners finishing at once can't both miss the other's commit.
   */
  async settleEvent(eventId: string): Promise<void> {
    await this.db.$queryRaw`SELECT "id" FROM "outbox_events" WHERE "id" = ${eventId}::uuid FOR UPDATE`;
    await this.db.$executeRaw`
      UPDATE "outbox_events" SET "status" = 'delivered'
      WHERE "id" = ${eventId}::uuid AND "status" = 'pending'
        AND NOT EXISTS (
          SELECT 1 FROM "outbox_deliveries"
          WHERE "event_id" = ${eventId}::uuid AND "status" <> 'delivered'
        )`;
  }

  /**
   * Records a failed try — only if nobody else has touched the delivery since it was claimed
   * (`attempts` still as claimed, still pending), so one failure is counted once. Returns whether
   * it was recorded.
   */
  async recordFailure(
    id: string,
    seenAttempts: number,
    failure: { status: 'pending' | 'dead'; nextAttemptAt: Date; error: string },
  ): Promise<boolean> {
    const { count } = await this.db.outboxDelivery.updateMany({
      where: { id, status: 'pending', attempts: seenAttempts },
      data: {
        attempts: seenAttempts + 1,
        status: failure.status,
        nextAttemptAt: failure.nextAttemptAt,
        lastError: failure.error,
      },
    });
    return count === 1;
  }

  async setEventStatus(eventId: string, status: OutboxStatus): Promise<void> {
    await this.db.outboxEvent.update({ where: { id: eventId }, data: { status }, select: { id: true } });
  }

  async findDelivery(id: string): Promise<DeliveryRow | null> {
    const row = await this.db.outboxDelivery.findUnique({ where: { id }, select: DELIVERY_SELECT });
    return row as DeliveryRow | null;
  }

  async listDeliveries(
    status: OutboxStatus | undefined,
    page: number,
    limit: number,
  ): Promise<{ rows: DeliveryRow[]; total: number }> {
    const where = status ? { status } : {};
    const [rows, total] = await Promise.all([
      this.db.outboxDelivery.findMany({
        where,
        select: DELIVERY_SELECT,
        orderBy: [{ event: { seq: 'desc' } }, { listener: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.db.outboxDelivery.count({ where }),
    ]);
    return { rows: rows as DeliveryRow[], total };
  }

  /** A dead delivery back to pending, due `now` (one more try; its attempts are kept). */
  async revive(id: string, now: Date): Promise<boolean> {
    const { count } = await this.db.outboxDelivery.updateMany({
      where: { id, status: 'dead' },
      data: { status: 'pending', nextAttemptAt: now },
    });
    return count === 1;
  }

  /** Deletes delivered events created before `before` (their deliveries go with them). */
  async deleteDeliveredBefore(before: Date): Promise<number> {
    const { count } = await this.db.outboxEvent.deleteMany({
      where: { status: 'delivered', createdAt: { lt: before } },
    });
    return count;
  }
}
