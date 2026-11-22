/*
 * The rate limits' rules (docs/ARCHITECTURE.md → Security), pure so they are tested alone.
 *
 * Four buckets, each counting requests in one window (`ttlSeconds`):
 * - `global` — every route: per user when signed in, per client IP otherwise;
 * - `auth` — sign-in and password changes (`@RateLimit('auth')`): per client IP, on top of the
 *   per-account lockout (core/sign-in-limit);
 * - `refresh` — the session refresh (`@RateLimit('refresh')`): per client IP;
 * - `heavy` — exports and uploads (`@RateLimit('heavy')`): per user (per IP signed out).
 *
 * A bucket's count is shared by every route it covers (the key is bucket + who), so spreading a
 * burst over several routes doesn't multiply the limit.
 */

export const RATE_LIMIT_BUCKETS = ['global', 'auth', 'refresh', 'heavy'] as const;
export type RateLimitBucket = (typeof RATE_LIMIT_BUCKETS)[number];
/** The buckets a route opts into with `@RateLimit(…)`; `global` covers every route already. */
export type RouteRateLimit = Exclude<RateLimitBucket, 'global'>;

export interface RateLimits {
  ttlSeconds: number;
  global: number;
  auth: number;
  refresh: number;
  heavy: number;
}

/** Whether a bucket counts this request: `global` always, the others only on their own routes. */
export function bucketApplies(bucket: RateLimitBucket, route: RouteRateLimit | undefined): boolean {
  return bucket === 'global' || bucket === route;
}

/**
 * Who a bucket counts by. `global` and `heavy`: the signed-in user — every page the web app's
 * server renders reaches the API from that one server's IP, so counting by IP would make the whole
 * school one caller — else the client IP. `auth` and `refresh` are about who is trying, before a
 * session exists: always the client IP.
 */
export function rateLimitTracker(
  bucket: RateLimitBucket,
  who: { userId?: string | null; ip: string },
): string {
  if ((bucket === 'global' || bucket === 'heavy') && who.userId) return `user:${who.userId}`;
  return `ip:${who.ip}`;
}

/** The storage key: one count per bucket and caller, across every route of that bucket. */
export function rateLimitKey(bucket: RateLimitBucket, tracker: string): string {
  return `${bucket}:${tracker}`;
}

/** The 429's `params.count`: whole seconds until the caller may try again (at least 1). */
export function retryAfterSeconds(timeToBlockExpire: number): number {
  return Math.max(1, Math.ceil(timeToBlockExpire));
}
