import { Injectable } from '@nestjs/common';
import { NOTIFICATION_CHANNELS, type NotificationChannel } from '@school-erp/shared';

/** How a delivery row starts: `sent` (in-app, at once) or `pending` (an outside channel, after the commit). */
export type DeliveryStart = 'sent' | 'pending';

/**
 * One way a notification reaches a person (N7). `in_app` is the only one built: the row in the
 * bell *is* the delivery. Email / WhatsApp / SMS later are new adapters — a job sends their
 * `pending` deliveries after the commit — plus a value in `NOTIFICATION_CHANNELS`; no module changes.
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

/** Every channel adapter, in `NOTIFICATION_CHANNELS` order. */
@Injectable()
export class NotificationChannels {
  private readonly adapters: Map<NotificationChannel, NotificationChannelAdapter>;

  constructor(inApp: InAppChannel) {
    this.adapters = new Map([[inApp.key, inApp]]);
    for (const key of NOTIFICATION_CHANNELS) {
      if (!this.adapters.has(key)) throw new Error(`Notification channel "${key}" has no adapter`);
    }
  }

  /** Every channel with whether it is live (today: in_app, live). */
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
