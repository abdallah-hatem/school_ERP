import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import webPush from 'web-push';
import type { AppConfig } from '../../../config';

/** Where one device's alerts go: its push service endpoint and its keys (from the browser). */
export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushSendOptions {
  /** Seconds the push service keeps it for a device that is off. */
  ttl: number;
  /** Replaces an undelivered alert with the same topic (≤ 32 URL-safe characters). */
  topic: string;
  urgency: 'normal' | 'high';
}

/** How long one push service may take to answer before the attempt counts as failed. */
export const PUSH_TIMEOUT_MS = 10_000;

/**
 * Sends one Web Push message (RFC 8030 / 8291 / 8292). `web-push` encrypts the payload for the
 * device's keys and signs the VAPID header; the request itself goes through `fetch` with a timeout,
 * so a slow push service can't hold the outbox delivery (and its connection) for long. Returns the
 * push service's status; a network error or timeout throws. Without VAPID keys it is never called
 * (the push channel is not available).
 */
@Injectable()
export class PushSender {
  constructor(private readonly config: ConfigService) {}

  async send(target: PushTarget, payload: string, options: PushSendOptions): Promise<number> {
    const vapid = this.config.get<AppConfig['push']>('push');
    if (!vapid) throw new Error('Push alerts are not set up on this server (VAPID_* missing)');
    const request = webPush.generateRequestDetails(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      payload,
      {
        vapidDetails: vapid,
        TTL: options.ttl,
        topic: options.topic,
        urgency: options.urgency,
        contentEncoding: 'aes128gcm',
      },
    );
    const response = await fetch(request.endpoint, {
      method: request.method,
      headers: request.headers as Record<string, string>,
      body: request.body ?? undefined,
      signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
    });
    // The body is never needed; drain it so the connection is released.
    await response.arrayBuffer().catch(() => undefined);
    return response.status;
  }
}
