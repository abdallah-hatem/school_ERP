/*
 * The outbox's rules (owner, 2026-11-18), as plain values and functions.
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

/** Wait after failure 1, 2, 3, 4; every later failure waits the last value (2 h). */
export const RETRY_DELAYS_MS = [10 * SECOND, MINUTE, 5 * MINUTE, 30 * MINUTE, 2 * HOUR] as const;

/**
 * A delivery is dead after this many failures (kept, logged; an admin can retry it). `attempts` on a
 * delivery counts failures only: delivered at the first try, it stays 0.
 */
export const MAX_FAILURES = 10;

/** How long a worker holds a claimed delivery before another may take it (a crash, a slow listener). */
export const CLAIM_LEASE_MS = 5 * MINUTE;

/**
 * A pass claims what is due up to this long after its own start: the poll's ticks wander by a few
 * milliseconds, and a retry due at a tick must not wait for the next one (30 s later).
 */
export const CLAIM_TOLERANCE_MS = SECOND;

/** How many due deliveries one pass claims. */
export const CLAIM_BATCH = 50;

/** Delivered events are deleted after this long; dead and pending ones are kept. */
export const DELIVERED_RETENTION_MS = 30 * 24 * HOUR;

/** Longest error text kept on a delivery. */
export const OUTBOX_ERROR_MAX_LENGTH = 4000;

/** How long to wait after the `failures`-th failure (1-based). */
export function retryDelayMs(failures: number): number {
  const index = Math.min(Math.max(failures, 1), RETRY_DELAYS_MS.length) - 1;
  return RETRY_DELAYS_MS[index];
}

/**
 * What a failure does: retry at `nextAttemptAt`, or give up (dead) at the 10th. The wait counts
 * from `claimedAt`, the start of the pass that claimed the delivery — not from the failure, a few
 * milliseconds later — so a retry lands on a poll tick instead of just missing it.
 */
export function afterFailure(
  failures: number,
  claimedAt: Date,
): { status: 'pending' | 'dead'; nextAttemptAt: Date } {
  return {
    status: failures >= MAX_FAILURES ? 'dead' : 'pending',
    nextAttemptAt: new Date(claimedAt.getTime() + retryDelayMs(failures)),
  };
}

/** The latest `next_attempt_at` a pass started at `claimedAt` claims (`<=`, inclusive). */
export function claimDueBy(claimedAt: Date): Date {
  return new Date(claimedAt.getTime() + CLAIM_TOLERANCE_MS);
}

/** The error text stored on a failed delivery: the stack when there is one, cut to a sane length. */
export function outboxErrorText(e: unknown): string {
  const text = e instanceof Error ? (e.stack ?? `${e.name}: ${e.message}`) : String(e);
  return text.length > OUTBOX_ERROR_MAX_LENGTH ? text.slice(0, OUTBOX_ERROR_MAX_LENGTH) : text;
}
