import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { Prisma } from '@prisma/client';
import type {
  NotificationChannel,
  NotificationName,
  NotificationResolution,
} from '@school-erp/shared';
import type { DbAdapter } from '../../../database/transactions';
import type { DeliveryStart } from '../channels';
import type { StoredNotification } from '../notifications.pure';

/** Whose notifications: `user` + their id today (N6). */
export interface Recipient {
  kind: string;
  id: string;
}

export interface NewItem {
  type: string;
  entityType: string;
  entityId: string;
  employeeId: string | null;
  params: Record<string, unknown>;
  dedupeKey: string;
}

export interface ReaderFilter {
  /** Only notifications not read yet. */
  unread?: boolean;
  /** Only notifications neither read nor resolved (the bell's count). */
  open?: boolean;
  /** Only these types (a category's). */
  types?: readonly string[];
}

const ITEM_SELECT = {
  id: true,
  type: true,
  entityType: true,
  entityId: true,
  employeeId: true,
  params: true,
  createdAt: true,
  resolvedAt: true,
  resolvedByName: true,
  resolution: true,
} as const;

const NOTIFICATION_SELECT = {
  id: true,
  type: true,
  createdAt: true,
  updatedAt: true,
  readAt: true,
  resolvedAt: true,
  items: { select: ITEM_SELECT },
} as const;

/**
 * `notifications`, `notification_items` and `notification_deliveries` (core/notifications owns
 * them). Everything goes through `txHost.tx`: a module's `notify()` / `resolve()` write in its own
 * transaction (N4), the read endpoints and the purge outside one — never a second connection.
 */
@Injectable()
export class NotificationsRepository {
  constructor(private readonly txHost: TransactionHost<DbAdapter>) {}

  private get db() {
    return this.txHost.tx;
  }

  /**
   * Holds a transaction-scoped advisory lock on `key` until the caller's transaction ends: two
   * transactions adding to one recipient's group take turns (N17), so a group is found or made once.
   */
  async lock(key: string): Promise<void> {
    await this.db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  }

  async itemExists(to: Recipient, type: string, dedupeKey: string): Promise<boolean> {
    const row = await this.db.notificationItem.findUnique({
      where: {
        recipientKind_recipientId_type_dedupeKey: {
          recipientKind: to.kind,
          recipientId: to.id,
          type,
          dedupeKey,
        },
      },
      select: { id: true },
    });
    return row !== null;
  }

  /** The recipient's open (unread, unresolved) notification of a type and group key, newest first. */
  async findOpenGroup(to: Recipient, type: string, groupKey: string): Promise<string | null> {
    const row = await this.db.notification.findFirst({
      where: {
        recipientKind: to.kind,
        recipientId: to.id,
        type,
        groupKey,
        readAt: null,
        resolvedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  /** A new notification with one delivery per channel (N8): `sent` rows carry `sent_at`. */
  async createNotification(input: {
    to: Recipient;
    type: string;
    groupKey: string;
    actorId: string | null;
    now: Date;
    deliveries: { channel: NotificationChannel; status: DeliveryStart }[];
  }): Promise<string> {
    const row = await this.db.notification.create({
      data: {
        type: input.type,
        recipientKind: input.to.kind,
        recipientId: input.to.id,
        groupKey: input.groupKey,
        actorId: input.actorId,
        createdAt: input.now,
        updatedAt: input.now,
        deliveries: {
          create: input.deliveries.map((d) => ({
            channel: d.channel,
            status: d.status,
            sentAt: d.status === 'sent' ? input.now : null,
            createdAt: input.now,
          })),
        },
      },
      select: { id: true },
    });
    return row.id;
  }

  /** Adds an item; false when one with its dedupe key exists already (`ON CONFLICT DO NOTHING`, N9). */
  async insertItem(
    notificationId: string,
    to: Recipient,
    item: NewItem,
    now: Date,
  ): Promise<boolean> {
    const { count } = await this.db.notificationItem.createMany({
      data: [
        {
          notificationId,
          recipientKind: to.kind,
          recipientId: to.id,
          type: item.type,
          entityType: item.entityType,
          entityId: item.entityId,
          employeeId: item.employeeId,
          params: item.params as Prisma.InputJsonValue,
          dedupeKey: item.dedupeKey,
          createdAt: now,
        },
      ],
      skipDuplicates: true,
    });
    return count === 1;
  }

  async touch(notificationId: string, now: Date): Promise<void> {
    await this.db.notification.update({
      where: { id: notificationId },
      data: { updatedAt: now },
      select: { id: true },
    });
  }

  async deleteNotification(notificationId: string): Promise<void> {
    await this.db.notification.deleteMany({ where: { id: notificationId } });
  }

  /**
   * Resolves every open item of a type about one record, for every recipient (N10), then every
   * notification left with no open item. Returns how many items were resolved.
   */
  async resolve(input: {
    type: string;
    entityType: string;
    entityId: string;
    resolution: NotificationResolution;
    byName: NotificationName | null;
    now: Date;
  }): Promise<number> {
    const open = await this.db.notificationItem.findMany({
      where: {
        type: input.type,
        entityType: input.entityType,
        entityId: input.entityId,
        resolvedAt: null,
      },
      select: { id: true, notificationId: true },
    });
    if (open.length === 0) return 0;
    const { count } = await this.db.notificationItem.updateMany({
      where: { id: { in: open.map((i) => i.id) }, resolvedAt: null },
      data: {
        resolvedAt: input.now,
        resolution: input.resolution,
        resolvedByName: input.byName
          ? (input.byName as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull,
      },
    });
    await this.db.notification.updateMany({
      where: {
        id: { in: [...new Set(open.map((i) => i.notificationId))] },
        resolvedAt: null,
        items: { none: { resolvedAt: null } },
      },
      data: { resolvedAt: input.now },
    });
    return count;
  }

  /** The reader's notifications matching `filter`, latest first, with every item. */
  async findForReader(to: Recipient, filter: ReaderFilter = {}): Promise<StoredNotification[]> {
    return this.db.notification.findMany({
      where: {
        recipientKind: to.kind,
        recipientId: to.id,
        ...(filter.unread || filter.open ? { readAt: null } : {}),
        ...(filter.open ? { resolvedAt: null } : {}),
        ...(filter.types ? { type: { in: [...filter.types] } } : {}),
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: NOTIFICATION_SELECT,
    });
  }

  /** One of the reader's notifications; null when it is someone else's or doesn't exist. */
  async findOne(to: Recipient, id: string): Promise<StoredNotification | null> {
    return this.db.notification.findFirst({
      where: { id, recipientKind: to.kind, recipientId: to.id },
      select: NOTIFICATION_SELECT,
    });
  }

  async setReadAt(id: string, readAt: Date | null): Promise<void> {
    await this.db.notification.update({ where: { id }, data: { readAt }, select: { id: true } });
  }

  /** Marks read every unread notification of the reader whose latest item came at or before `upTo`. */
  async readAllUpTo(to: Recipient, upTo: Date, now: Date): Promise<number> {
    const { count } = await this.db.notification.updateMany({
      where: { recipientKind: to.kind, recipientId: to.id, readAt: null, updatedAt: { lte: upTo } },
      data: { readAt: now },
    });
    return count;
  }

  /** The purge (N14): read, resolved or created before the cutoffs; items and deliveries cascade. */
  async deleteExpired(cutoffs: {
    readBefore: Date;
    resolvedBefore: Date;
    createdBefore: Date;
  }): Promise<number> {
    const { count } = await this.db.notification.deleteMany({
      where: {
        OR: [
          { readAt: { lt: cutoffs.readBefore } },
          { resolvedAt: { lt: cutoffs.resolvedBefore } },
          { createdAt: { lt: cutoffs.createdBefore } },
        ],
      },
    });
    return count;
  }
}
