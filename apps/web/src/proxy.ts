import type { NextRequest } from 'next/server';
import { authProxy } from '@/core/auth/proxy';

/**
 * Locale + auth routing on every page request (Next 16's `proxy`, formerly `middleware`).
 * The logic lives in core/auth so it can be tested.
 */
export function proxy(req: NextRequest) {
  return authProxy(req);
}

export const config = {
  // Pages only: not Next internals, route handlers, the API's public files or static assets.
  matcher: ['/((?!_next/|api/|files/|favicon\\.ico|.*\\.[A-Za-z0-9]+$).*)'],
};
