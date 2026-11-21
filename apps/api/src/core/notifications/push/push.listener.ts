import { Injectable, Logger } from '@nestjs/common';
import {
  LANGUAGES,
  NotificationEvent,
  type Language,
  type NotificationPushRequestedEvent,
} from '@school-erp/shared';
import { OutboxListener, type OutboxEventListener } from '../../events';
import { SettingsService } from '../../settings';
import { NotificationInbox } from '../notification-inbox.service';
import { PushDevicesRepository } from '../repositories/push-devices.repository';
import { PushSender } from './push-sender';
import { pushMessageFor, pushOutcome, pushTopic } from './push.pure';

/** The listener's stable name: it names its outbox delivery rows. */
export const PUSH_LISTENER = 'core.notifications.push';

/** A push service keeps an alert this long for a device that is off (then it is dropped). */
export const PUSH_TTL_SECONDS = 24 * 60 * 60;

/** Thrown when no device took the alert and at least one may take it later: the outbox retries. */
export class PushNotDeliveredError extends Error {
  constructor(detail: string) {
    super(`No device took the alert yet: ${detail}`);
    this.name = PushNotDeliveredError.name;
  }
}

/**
 * Sends a notification's Web Push alert to each of its reader's devices (§11 → Push, owner
 * 2026-11-21), after the change that made it committed — through the outbox, so a push service
 * that is down is retried (10 s, 1 min, 5 min, …) and never slows down or fails the change.
 *
 * - The alert says what the bell says **now**, read through `NotificationInbox` with the reader's
 *   current permissions (N11): a notification they may no longer see, already read, or already
 *   handled sends nothing. Never money or typed text (`pushMessageFor`).
 * - Each device gets it in its own language (the app's language when alerts were turned on there).
 * - A device whose push service answers 404 / 410 is gone: it is dropped (`revoked_at`, `expired`).
 * - Retried only when **no** device took it and one may later (429, 5xx, timeout): a retry never
 *   sends a second copy to a device that already got it. A device that fails while another
 *   succeeded is logged and skipped this time.
 *
 * Runs in the outbox delivery's transaction (its bookkeeping commits with the "delivered" mark).
 */
@OutboxListener({ event: NotificationEvent.PUSH_REQUESTED, name: PUSH_LISTENER })
@Injectable()
export class PushNotificationListener
  implements OutboxEventListener<typeof NotificationEvent.PUSH_REQUESTED>
{
  private readonly logger = new Logger(PushNotificationListener.name);

  constructor(
    private readonly devices: PushDevicesRepository,
    private readonly inbox: NotificationInbox,
    private readonly settings: SettingsService,
    private readonly sender: PushSender,
  ) {}

  async handle(event: NotificationPushRequestedEvent): Promise<void> {
    const now = new Date();
    if (!(await this.devices.notificationExists(event.notificationId))) return;
    const [targets, view] = await Promise.all([
      this.devices.activeOf(event.recipientId),
      this.inbox.findVisible({ id: event.recipientId }, event.notificationId),
    ]);
    if (targets.length === 0 || !view || view.readAt !== null || view.openCount === 0) {
      await this.devices.recordDelivery(event.notificationId, { status: 'skipped', error: null, at: now });
      return;
    }

    const { logoUrl } = await this.settings.getPublicSchoolSettings();
    const results = await Promise.all(
      targets.map(async (device) => {
        const locale: Language = (LANGUAGES as readonly string[]).includes(device.locale)
          ? (device.locale as Language)
          : 'en';
        const payload = JSON.stringify(pushMessageFor(view, locale, { logoUrl, now }));
        try {
          const status = await this.sender.send(device, payload, {
            ttl: PUSH_TTL_SECONDS,
            topic: pushTopic(view.id),
            urgency: view.category === 'approval' ? 'high' : 'normal',
          });
          return { device, outcome: pushOutcome(status), detail: `HTTP ${status}` };
        } catch (e) {
          return { device, outcome: 'retry' as const, detail: (e as Error).message };
        }
      }),
    );

    const sent = results.filter((r) => r.outcome === 'sent').map((r) => r.device.id);
    const gone = results.filter((r) => r.outcome === 'gone').map((r) => r.device.id);
    const failed = results.filter((r) => r.outcome === 'retry' || r.outcome === 'refused');
    await this.devices.markUsed(sent, now);
    await this.devices.revoke(gone, 'expired', now);
    for (const f of failed) {
      this.logger.warn(`push to device ${f.device.id} failed (${f.outcome}): ${f.detail}`);
    }

    const error = failed.length > 0 ? failed.map((f) => f.detail).join('; ').slice(0, 1000) : null;
    if (sent.length === 0 && failed.some((f) => f.outcome === 'retry')) {
      // Thrown before any write sticks: the delivery's transaction rolls back and is retried.
      throw new PushNotDeliveredError(error ?? 'unknown');
    }
    await this.devices.recordDelivery(event.notificationId, {
      status: sent.length > 0 ? 'sent' : gone.length > 0 && failed.length === 0 ? 'skipped' : 'failed',
      error,
      at: now,
    });
  }
}
