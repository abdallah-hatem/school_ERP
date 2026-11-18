import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { DbAdapter } from '../../../database/transactions';

export interface StoredChoice {
  type: string;
  channel: string;
  enabled: boolean;
}

export interface StoredPersonalChoice extends StoredChoice {
  userId: string;
}

/**
 * `notification_defaults` (the school's) and `notification_preferences` (each person's) — core/
 * notifications owns both. Through `txHost.tx`, so a save and its audit entry commit together.
 */
@Injectable()
export class NotificationPreferencesRepository {
  constructor(private readonly txHost: TransactionHost<DbAdapter>) {}

  private get db() {
    return this.txHost.tx;
  }

  defaults(): Promise<StoredChoice[]> {
    return this.db.notificationDefault.findMany({
      select: { type: true, channel: true, enabled: true },
    });
  }

  async setDefault(choice: StoredChoice, updatedById: string | null): Promise<void> {
    await this.db.notificationDefault.upsert({
      where: { type_channel: { type: choice.type, channel: choice.channel } },
      create: { ...choice, updatedById },
      update: { enabled: choice.enabled, updatedById },
      select: { type: true },
    });
  }

  /** The personal choices of these people, for one type (`notify`) or every type (`type` left out). */
  choicesOf(userIds: readonly string[], type?: string): Promise<StoredPersonalChoice[]> {
    if (userIds.length === 0) return Promise.resolve([]);
    return this.db.notificationPreference.findMany({
      where: { userId: { in: [...userIds] }, ...(type ? { type } : {}) },
      select: { userId: true, type: true, channel: true, enabled: true },
    });
  }

  async setChoice(userId: string, choice: StoredChoice): Promise<void> {
    await this.db.notificationPreference.upsert({
      where: { userId_type_channel: { userId, type: choice.type, channel: choice.channel } },
      create: { userId, ...choice },
      update: { enabled: choice.enabled },
      select: { userId: true },
    });
  }

  /** Back to the school's default: the personal row goes. */
  async clearChoice(userId: string, type: string, channel: string): Promise<void> {
    await this.db.notificationPreference.deleteMany({ where: { userId, type, channel } });
  }
}
