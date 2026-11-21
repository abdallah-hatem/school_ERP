import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { DbAdapter } from '../../../database/transactions';

/** A device as stored (`push_subscriptions`). */
export interface StoredPushDevice {
  id: string;
  userId: string;
  endpoint: string;
  endpointHash: string;
  p256dh: string;
  auth: string;
  browser: string | null;
  os: string | null;
  locale: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

const SELECT = {
  id: true,
  userId: true,
  endpoint: true,
  endpointHash: true,
  p256dh: true,
  auth: true,
  browser: true,
  os: true,
  locale: true,
  createdAt: true,
  lastUsedAt: true,
  revokedAt: true,
} as const;

export type PushRevokeReason = 'removed' | 'expired' | 'replaced';

/**
 * `push_subscriptions` (core/notifications owns it): the devices that get a person's alerts.
 * Through `txHost.tx`, so adding or removing a device commits with its audit entry, and the
 * sender's bookkeeping joins its outbox delivery's transaction.
 */
@Injectable()
export class PushDevicesRepository {
  constructor(private readonly txHost: TransactionHost<DbAdapter>) {}

  private get db() {
    return this.txHost.tx;
  }

  /** A person's devices that still get alerts, newest first. */
  activeOf(userId: string): Promise<StoredPushDevice[]> {
    return this.db.pushSubscription.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: SELECT,
    });
  }

  /** Which of these people have at least one device that gets alerts. */
  async usersWithDevices(userIds: readonly string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const rows = await this.db.pushSubscription.findMany({
      where: { userId: { in: [...userIds] }, revokedAt: null },
      distinct: ['userId'],
      select: { userId: true },
    });
    return new Set(rows.map((r) => r.userId));
  }

  findByEndpoint(endpoint: string): Promise<StoredPushDevice | null> {
    return this.db.pushSubscription.findUnique({ where: { endpoint }, select: SELECT });
  }

  findOwn(userId: string, id: string): Promise<StoredPushDevice | null> {
    return this.db.pushSubscription.findFirst({
      where: { id, userId, revokedAt: null },
      select: SELECT,
    });
  }

  /**
   * Adds the browser's subscription, or takes over the row of the same endpoint (the same browser
   * turning alerts on again, or another account on a shared browser): active again, for this person,
   * with the browser's current keys and language.
   */
  upsert(input: {
    userId: string;
    endpoint: string;
    endpointHash: string;
    p256dh: string;
    auth: string;
    browser: string | null;
    os: string | null;
    locale: string;
  }): Promise<StoredPushDevice> {
    const { endpoint, ...rest } = input;
    return this.db.pushSubscription.upsert({
      where: { endpoint },
      create: input,
      update: { ...rest, revokedAt: null, revokedReason: null },
      select: SELECT,
    });
  }

  async revoke(ids: readonly string[], reason: PushRevokeReason, at: Date): Promise<void> {
    if (ids.length === 0) return;
    await this.db.pushSubscription.updateMany({
      where: { id: { in: [...ids] }, revokedAt: null },
      data: { revokedAt: at, revokedReason: reason },
    });
  }

  async markUsed(ids: readonly string[], at: Date): Promise<void> {
    if (ids.length === 0) return;
    await this.db.pushSubscription.updateMany({
      where: { id: { in: [...ids] } },
      data: { lastUsedAt: at },
    });
  }

  /** The notification's push delivery: created when an item joins a group made before alerts were on. */
  async recordDelivery(
    notificationId: string,
    result: { status: 'sent' | 'failed' | 'skipped'; error: string | null; at: Date },
  ): Promise<void> {
    await this.db.notificationDelivery.upsert({
      where: { notificationId_channel: { notificationId, channel: 'push' } },
      create: {
        notificationId,
        channel: 'push',
        status: result.status,
        attempts: 1,
        lastError: result.error,
        sentAt: result.status === 'sent' ? result.at : null,
      },
      update: {
        status: result.status,
        attempts: { increment: 1 },
        lastError: result.error,
        ...(result.status === 'sent' ? { sentAt: result.at } : {}),
      },
    });
  }

  /** Whether the notification still exists (the purge may have taken it before the alert went). */
  async notificationExists(notificationId: string): Promise<boolean> {
    return (
      (await this.db.notification.findUnique({ where: { id: notificationId }, select: { id: true } })) !==
      null
    );
  }
}
