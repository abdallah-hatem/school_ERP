import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NOTIFICATION_CHANNELS, type NotificationChannel } from '@school-erp/shared';
import type { AppConfig } from '../../config';

/** How a delivery row starts: `sent` (in-app, at once) or `pending` (an outside channel, after the commit). */
export type DeliveryStart = 'sent' | 'pending';

/**
 * One way a notification reaches a person (N7). `in_app`: the row in the bell *is* the delivery.
 * `push`: Web Push to the person's devices, sent after the commit through the outbox
 * (`PushNotificationListener`). Email / WhatsApp / SMS later are new adapters the same way, plus a
 * value in `NOTIFICATION_CHANNELS`; no module changes.
 */
export interface NotificationChannelAdapter {
  key: NotificationChannel;
  /** Whether people can use it now (its school settings are filled in). */
  available(): boolean;
  /** The status a new delivery gets. */
  start(): DeliveryStart;
}

/** The bell itself: delivered the moment the notification row exists. */
@Injectable()
export class InAppChannel implements NotificationChannelAdapter {
  readonly key = 'in_app' as const;

  available(): boolean {
    return true;
  }

  start(): DeliveryStart {
    return 'sent';
  }
}

/**
 * Web Push (owner, 2026-11-21): live when the server has its VAPID keys (`VAPID_*`). Its
 * delivery starts `pending`; the outbox listener sends it and marks it `sent` / `failed` /
 * `skipped`. Whether a person gets it follows the type's in-app switch and their devices.
 */
@Injectable()
export class PushChannel implements NotificationChannelAdapter {
  readonly key = 'push' as const;
  private readonly configured: boolean;

  constructor(config: ConfigService) {
    this.configured = config.get<AppConfig['push']>('push') != null;
  }

  available(): boolean {
    return this.configured;
  }

  start(): DeliveryStart {
    return 'pending';
  }
}

/** Every channel adapter, in `NOTIFICATION_CHANNELS` order. */
@Injectable()
export class NotificationChannels {
  private readonly adapters: Map<NotificationChannel, NotificationChannelAdapter>;

  constructor(inApp: InAppChannel, push: PushChannel) {
    this.adapters = new Map<NotificationChannel, NotificationChannelAdapter>([
      [inApp.key, inApp],
      [push.key, push],
    ]);
    for (const key of NOTIFICATION_CHANNELS) {
      if (!this.adapters.has(key)) throw new Error(`Notification channel "${key}" has no adapter`);
    }
  }

  /** Every channel with whether it is live (in_app always; push with the VAPID keys). */
  states(): { channel: NotificationChannel; available: boolean }[] {
    return NOTIFICATION_CHANNELS.map((channel) => ({
      channel,
      available: this.isAvailable(channel),
    }));
  }

  /** True for a known channel that people can use now. */
  isAvailable(channel: string): channel is NotificationChannel {
    return this.adapters.get(channel as NotificationChannel)?.available() ?? false;
  }

  start(channel: NotificationChannel): DeliveryStart {
    const adapter = this.adapters.get(channel);
    if (!adapter) throw new Error(`Notification channel "${channel}" has no adapter`);
    return adapter.start();
  }
}
