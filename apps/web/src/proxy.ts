import type { NextRequest } from 'next/server';
import { authProxy } from '@/core/auth/proxy';
import { apiOrigin, contentSecurityPolicy, createNonce, NONCE_HEADER } from '@/lib/security-headers';

/**
 * Every page request (Next 16's `proxy`, formerly `middleware`): a fresh CSP nonce, then locale +
 * auth routing (the logic lives in core/auth so it can be tested). The policy goes on the request
 * too — Next reads the nonce from it and puts it on its own scripts, the streamed reveal included —
 * and on the response, where the browser enforces it (docs/ARCHITECTURE.md → Security).
 */
export async function proxy(req: NextRequest) {
  const nonce = createNonce();
  const csp = contentSecurityPolicy({
    nonce,
    dev: process.env.NODE_ENV === 'development',
    apiOrigin: apiOrigin({ API_PUBLIC_ORIGIN: process.env.API_PUBLIC_ORIGIN, BASE_URL: process.env.BASE_URL }),
  });
  const res = await authProxy(req, { 'content-security-policy': csp, [NONCE_HEADER]: nonce });
  res.headers.set('Content-Security-Policy', csp);
  return res;
}

export const config = {
  // Pages only: not Next internals, route handlers, the API's public files or the app's own files
  // with an extension (the service worker, the manifest, the offline page, the favicon). Any other
  // address with an extension (`/x.php`) comes through, so its 404 is the locale's not-found page
  // with the nonce CSP, in the visitor's language (docs/ARCHITECTURE.md → Error pages).
  matcher: ['/((?!_next/|api/|files/|favicon\\.ico$|sw\\.js$|manifest\\.webmanifest$|offline\\.html$).*)'],
};
