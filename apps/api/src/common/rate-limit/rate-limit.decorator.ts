import { SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { RateLimitSubject, RouteRateLimit } from './rate-limit.pure';

export const RATE_LIMIT_ROUTE = 'rateLimitRoute';

/** A route's rate limit: its bucket, and whose request it is (for `auth` and `refresh`). */
export interface RouteRateLimitMeta {
  bucket: RouteRateLimit;
  subject?: (req: Request & { user?: { id?: string } }) => RateLimitSubject;
}

/**
 * Adds a stricter rate limit to a route, on top of the global one (`rate-limit.pure.ts`):
 * `auth` (sign-in, password changes — give `subject`: the account the attempt is about),
 * `refresh` (give the session's token as `subject`) or `heavy` (exports, uploads).
 *
 * @example @RateLimit('auth', (req) => ({ kind: 'email', email: String(req.body?.email ?? '') }))
 * @example @RateLimit('heavy')
 */
export const RateLimit = (bucket: RouteRateLimit, subject?: RouteRateLimitMeta['subject']) =>
  SetMetadata(RATE_LIMIT_ROUTE, { bucket, subject } satisfies RouteRateLimitMeta);
