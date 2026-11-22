import { createHash } from 'node:crypto';
import { normalizeEmail } from '../utils/password.util';

/*
 * The rate limits' rules (docs/ARCHITECTURE.md → Security → Rate limits), pure so they are tested
 * alone.
 *
 * A whole school can sit behind ONE public IP (an office NAT, or the app on the school's own
 * server), so nothing a person does in normal use is counted per IP alone at a low limit — the
 * 8 AM sign-in rush must never lock the staff out. Five buckets, each counting in one window:
 *
 * - `global` — every route: per user when signed in; per client IP when signed out, with its own,
 *   higher limit (a school's devices load the sign-in page, its logo and app icons together);
 * - `auth` — sign-in and password changes (`@RateLimit('auth', subject)`): per **account + IP** —
 *   the email typed for a sign-in, the user for a password change, the target for an admin
 *   reset — on top of the per-account lockout (core/sign-in-limit), which counts the email alone
 *   from any IP;
 * - `authIp` — the same routes and the refresh, per client IP, with a high ceiling: a NAT full of
 *   staff never reaches it, a script trying many accounts (password spraying) does;
 * - `refresh` — the session refresh (`@RateLimit('refresh', subject)`): per session (the refresh
 *   token), per IP when there is no token;
 * - `heavy` — exports and uploads (`@RateLimit('heavy')`): per user (per IP signed out).
 *
 * A bucket's count is shared by every route it covers, so spreading a burst over routes doesn't
 * multiply the limit.
 */

export const RATE_LIMIT_BUCKETS = ['global', 'auth', 'authIp', 'refresh', 'heavy'] as const;
export type RateLimitBucket = (typeof RATE_LIMIT_BUCKETS)[number];
/** The buckets a route opts into with `@RateLimit(…)`; `global` covers every route already. */
export type RouteRateLimit = 'auth' | 'refresh' | 'heavy';

export interface RateLimits {
  ttlSeconds: number;
  /** Per signed-in user. */
  global: number;
  /** Per client IP, signed out. */
  globalIp: number;
  /** Per account + IP on sign-in and password changes. */
  auth: number;
  /** Per client IP on sign-in, password changes and refresh together. */
  authIp: number;
  /** Per session on refresh. */
  refresh: number;
  heavy: number;
}

/** Whether a bucket counts this request: `global` always; `authIp` on auth and refresh routes. */
export function bucketApplies(bucket: RateLimitBucket, route: RouteRateLimit | undefined): boolean {
  if (bucket === 'global') return true;
  if (bucket === 'authIp') return route === 'auth' || route === 'refresh';
  return bucket === route;
}

/**
 * Whose request this is, as a route's `subject` names it: the email typed (sign-in), a user id
 * (one's own password, an admin's reset of someone's), or the refresh token. Null: none given.
 */
export type RateLimitSubject =
  | { kind: 'email'; email: string }
  | { kind: 'user'; userId: string }
  | { kind: 'session'; token: string }
  | null;

/** The account part of a key: emails lower-cased and trimmed like the lockout; tokens hashed. */
export function subjectKey(subject: RateLimitSubject): string | null {
  if (!subject) return null;
  switch (subject.kind) {
    case 'email': {
      const email = normalizeEmail(subject.email);
      return email ? `email:${email}` : null;
    }
    case 'user':
      return subject.userId ? `user:${subject.userId}` : null;
    case 'session':
      // Never the token itself in memory keys or logs.
      return subject.token ? `session:${createHash('sha256').update(subject.token).digest('hex').slice(0, 32)}` : null;
  }
}

/** Who a bucket counts by (see the buckets above). */
export function rateLimitTracker(
  bucket: RateLimitBucket,
  who: { userId?: string | null; ip: string; subject?: RateLimitSubject },
): string {
  const ip = `ip:${who.ip}`;
  const subject = subjectKey(who.subject ?? null);
  switch (bucket) {
    case 'global':
    case 'heavy':
      return who.userId ? `user:${who.userId}` : ip;
    case 'authIp':
      return ip;
    case 'auth':
      return subject ? `${subject}|${ip}` : ip;
    case 'refresh':
      return subject ?? ip;
  }
}

/** A bucket's limit for this caller: `global` is higher signed out (counted per IP, not person). */
export function rateLimitFor(bucket: RateLimitBucket, limits: RateLimits, signedIn: boolean): number {
  if (bucket === 'global') return signedIn ? limits.global : limits.globalIp;
  return limits[bucket];
}

/** The storage key: one count per bucket and caller, across every route of that bucket. */
export function rateLimitKey(bucket: RateLimitBucket, tracker: string): string {
  return `${bucket}:${tracker}`;
}

/** The 429's `params.count`: whole seconds until the caller may try again (at least 1). */
export function retryAfterSeconds(timeToBlockExpire: number): number {
  return Math.max(1, Math.ceil(timeToBlockExpire));
}
