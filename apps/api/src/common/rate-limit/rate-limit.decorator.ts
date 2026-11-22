import { SetMetadata } from '@nestjs/common';
import type { RouteRateLimit } from './rate-limit.pure';

export const RATE_LIMIT_BUCKET = 'rateLimitBucket';

/**
 * Adds a stricter rate limit to a route, on top of the global one (`rate-limit.pure.ts`):
 * `auth` (sign-in, password changes), `refresh` (the session refresh) or `heavy` (exports, uploads).
 *
 * @example @RateLimit('heavy') @Get(':month/export')
 */
export const RateLimit = (bucket: RouteRateLimit) => SetMetadata(RATE_LIMIT_BUCKET, bucket);
