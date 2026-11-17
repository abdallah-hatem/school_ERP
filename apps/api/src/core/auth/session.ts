import type { AuthUser } from '@school-erp/shared';
import type { TokenPair } from './services/tokens.service';

/**
 * What the auth controller returns. AuthCookiesInterceptor turns it into cookies and strips the
 * tokens, so no token ever appears in a response body.
 */
export class IssuedSession {
  constructor(
    readonly user: AuthUser,
    readonly tokens: TokenPair,
  ) {}
}

/** Returned by logout: the interceptor clears both cookies. */
export class ClearedSession {}
