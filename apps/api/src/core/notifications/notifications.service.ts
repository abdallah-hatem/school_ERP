import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import {
  NOTIFICATION_CHANNELS,
  schoolDayOf,
  type NotificationChannel,
  type NotificationResolution,
  type NotificationSubject,
  type NotificationTypeKey,
} from '@school-erp/shared';
import type { DbAdapter } from '../../database/transactions';
import { NotificationChannels, type DeliveryStart } from './channels';
import { NotificationAccess } from './notification-access.service';
import { NotificationScopes, type NotificationScopeResolver } from './notification-scope';
import { NotificationTypes } from './notification-types';
import { effectiveEnabled, groupLockKey } from './notifications.pure';
import { NotificationPreferencesRepository } from './repositories/notification-preferences.repository';
import { NotificationsRepository, type Recipient } from './repositories/notifications.repository';
import { RecipientsRepository } from './repositories/recipients.repository';

export interface NotifyInput {
  type: NotificationTypeKey;
  /** What the item is about; `employeeId` when it concerns one employee (the scope checks). */
  subject: NotificationSubject;
  /** The sentence's values: names as `{ en, ar }`, months, counts, dates — never a sentence (N3). */
  params?: Record<string, unknown>;
  /** Built with `notificationDedupeKey(type, ...)`: the same key twice for a person is a no-op (N9). */
  dedupeKey: string;
  /** Who caused it: left out of the recipients (GUESS). Null or absent for a reminder. */
  actorId?: string | null;
  /** Items of one key join one notification while it is unread (N17). Default: today, school time. */
  groupKey?: string;
  /** For tests: the moment it happens. */
  now?: Date;
}

export interface ResolveInput {
  type: NotificationTypeKey;
  subject: Pick<NotificationSubject, 'entityType' | 'entityId'>;
  /** Only the items with this dedupe key (one of several reminders about the subject). */
  dedupeKey?: string;
  resolution: NotificationResolution;
  /** Who did it ("Approved by …"); null or absent for no person (a job, a change elsewhere). */
  byUserId?: string | null;
  now?: Date;
}

/** `notify()` / `resolve()` outside a transaction: the notification could outlive a rolled-back change. */
export class NotificationOutsideTransactionError extends Error {
  constructor(call: string, type: string) {
    super(
      `notifications.${call}("${type}") must run inside a transaction (spec N4): the module's own ` +
        'change, or an outbox listener (a job opens its own)',
    );
    this.name = NotificationOutsideTransactionError.name;
  }
}

const USER = 'user';

/**
 * The front door modules send through (core/notifications, §11). `notify()` and `resolve()` write
 * in the **current** transaction — the module's change and its notifications commit or roll back
 * together (N4) — and throw outside one, like `audit.record()`. A module that reacts to another
 * module's event does it from a must-deliver (outbox) listener, whose delivery transaction they join.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly txHost: TransactionHost<DbAdapter>,
    private readonly types: NotificationTypes,
    private readonly access: NotificationAccess,
    private readonly scopes: NotificationScopes,
    private readonly channels: NotificationChannels,
    private readonly notifications: NotificationsRepository,
    private readonly preferences: NotificationPreferencesRepository,
    private readonly recipients: RecipientsRepository,
  ) {}

  /**
   * Tells everyone who may act on `subject` (N5): one item per recipient, joining their open,
   * unread notification of this type and group key, or starting a new one with its deliveries
   * (N17, N8). A person who turned the type off in the app gets nothing (N13). Returns how many
   * items were written — 0 for a repeat (N9) or nobody to tell.
   */
  async notify(input: NotifyInput): Promise<{ created: number }> {
    if (!this.txHost.isTransactionActive())
      throw new NotificationOutsideTransactionError('notify', input.type);
    const type = this.types.get(input.type);
    const now = input.now ?? new Date();
    const groupKey = input.groupKey ?? schoolDayOf(now);
    const actorId = input.actorId ?? null;

    const userIds = await this.access.recipientsFor(type.permission, input.subject, actorId);
    if (userIds.length === 0) return { created: 0 };
    const deliveries = await this.deliveriesFor(input.type, userIds);

    let created = 0;
    // In id order, so two transactions notifying the same people take the group locks in one order.
    for (const userId of userIds) {
      const channels = deliveries.get(userId) ?? [];
      if (!channels.some((d) => d.channel === 'in_app')) continue;
      const to: Recipient = { kind: USER, id: userId };
      const added = await this.addItem(to, input, groupKey, actorId, now, channels);
      if (added) created++;
    }
    return { created };
  }

  /**
   * The thing waiting is done (N10): every open item of `type` about the subject — for every
   * recipient — is resolved, with who did it as their name is now, and a notification left with
   * no open item is resolved too (it stops counting as unread). Idempotent: nothing open → 0.
   */
  async resolve(input: ResolveInput): Promise<{ resolved: number }> {
    if (!this.txHost.isTransactionActive())
      throw new NotificationOutsideTransactionError('resolve', input.type);
    this.types.get(input.type);
    const byName = input.byUserId ? await this.recipients.nameOf(input.byUserId) : null;
    const resolved = await this.notifications.resolve({
      type: input.type,
      entityType: input.subject.entityType,
      entityId: input.subject.entityId,
      ...(input.dedupeKey !== undefined ? { dedupeKey: input.dedupeKey } : {}),
      resolution: input.resolution,
      byName,
      now: input.now ?? new Date(),
    });
    return { resolved };
  }

  /**
   * What is still open of `type` — each subject and dedupe key once, whoever received it. A job
   * that sends reminders reads it to resolve the ones whose condition no longer holds (N16).
   * Runs in the current transaction like `notify()` / `resolve()`.
   */
  async openItems(
    type: NotificationTypeKey,
  ): Promise<{ entityType: string; entityId: string; dedupeKey: string }[]> {
    if (!this.txHost.isTransactionActive())
      throw new NotificationOutsideTransactionError('openItems', type);
    this.types.get(type);
    return this.notifications.openItems(type);
  }

  /**
   * Registers, at start-up, how to tell whether a scoped user covers a subject of `entityType`
   * (HR: employees by stage / team). Without one, a scoped recipient makes `notify()` throw.
   */
  registerScopeResolver(entityType: string, resolver: NotificationScopeResolver): void {
    this.scopes.register(entityType, resolver);
  }

  /** The channels each recipient gets this type on (N13), with how each delivery starts. */
  private async deliveriesFor(
    type: string,
    userIds: readonly string[],
  ): Promise<Map<string, { channel: NotificationChannel; status: DeliveryStart }[]>> {
    const definition = this.types.get(type);
    const defaults = new Map(
      (await this.preferences.defaults())
        .filter((d) => d.type === type)
        .map((d) => [d.channel, d.enabled]),
    );
    const personal = new Map(
      (await this.preferences.choicesOf(userIds, type)).map((c) => [
        `${c.userId}:${c.channel}`,
        c.enabled,
      ]),
    );
    const out = new Map<string, { channel: NotificationChannel; status: DeliveryStart }[]>();
    for (const userId of userIds) {
      out.set(
        userId,
        NOTIFICATION_CHANNELS.filter(
          (channel) =>
            this.channels.isAvailable(channel) &&
            effectiveEnabled(
              definition,
              channel,
              defaults.get(channel),
              personal.get(`${userId}:${channel}`),
            ),
        ).map((channel) => ({ channel, status: this.channels.start(channel) })),
      );
    }
    return out;
  }

  /** One item for one person, under their group's lock (N17); false when it was a repeat (N9). */
  private async addItem(
    to: Recipient,
    input: NotifyInput,
    groupKey: string,
    actorId: string | null,
    now: Date,
    deliveries: { channel: NotificationChannel; status: DeliveryStart }[],
  ): Promise<boolean> {
    await this.notifications.lock(groupLockKey(to.kind, to.id, input.type, groupKey));
    if (await this.notifications.itemExists(to, input.type, input.dedupeKey)) return false;

    const open = await this.notifications.findOpenGroup(to, input.type, groupKey);
    const notificationId =
      open ??
      (await this.notifications.createNotification({
        to,
        type: input.type,
        groupKey,
        actorId,
        now,
        deliveries,
      }));
    const item = {
      type: input.type,
      entityType: input.subject.entityType,
      entityId: input.subject.entityId,
      employeeId: input.subject.employeeId ?? null,
      params: input.params ?? {},
      dedupeKey: input.dedupeKey,
    };
    if (!(await this.notifications.insertItem(notificationId, to, item, now))) {
      // Another transaction wrote the same item under another group key meanwhile (N9): drop ours.
      if (!open) await this.notifications.deleteNotification(notificationId);
      return false;
    }
    if (open) await this.notifications.touch(open, now);
    return true;
  }
}
