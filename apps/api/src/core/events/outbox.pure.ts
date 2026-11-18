/*
 * The outbox's rules (owner, 2026-11-18), as plain values and functions.
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

/** Wait after failure 1, 2, 3, 4; every later failure waits the last value (2 h). */
export const RETRY_DELAYS_MS = [10 * SECOND, MINUTE, 5 * MINUTE, 30 * MINUTE, 2 * HOUR] as const;

/** A delivery is dead after this many failures (kept, logged; an admin can retry it). */
export const MAX_FAILURES = 10;

/** How long a worker holds a claimed delivery before another may take it (a crash, a slow listener). */
export const CLAIM_LEASE_MS = 5 * MINUTE;

/** How many due deliveries one pass claims. */
export const CLAIM_BATCH = 50;

/** Delivered events are deleted after this long; dead and pending ones are kept. */
export const DELIVERED_RETENTION_MS = 30 * 24 * HOUR;

/** Longest error text kept on a delivery. */
export const OUTBOX_ERROR_MAX_LENGTH = 4000;

/** How long to wait after the `failures`-th failure (1-based). */
export function retryDelayMs(failures: number): number {
  const index = Math.min(Math.max(failures, 1), RETRY_DELAYS_MS.length) - 1;
  return RETRY_DELAYS_MS[index]!;
}

/** What a failure does: retry at `nextAttemptAt`, or give up (dead) at the 10th. */
export function afterFailure(
  failures: number,
  now: Date,
): { status: 'pending' | 'dead'; nextAttemptAt: Date } {
  return {
    status: failures >= MAX_FAILURES ? 'dead' : 'pending',
    nextAttemptAt: new Date(now.getTime() + retryDelayMs(failures)),
  };
}

/** The error text stored on a failed delivery: the stack when there is one, cut to a sane length. */
export function outboxErrorText(e: unknown): string {
  const text = e instanceof Error ? (e.stack ?? `${e.name}: ${e.message}`) : String(e);
  return text.length > OUTBOX_ERROR_MAX_LENGTH ? text.slice(0, OUTBOX_ERROR_MAX_LENGTH) : text;
}
