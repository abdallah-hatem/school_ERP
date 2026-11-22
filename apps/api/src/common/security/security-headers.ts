import type { RequestHandler } from 'express';
import helmet from 'helmet';

/**
 * The API's response headers (helmet), set for a JSON API (docs/ARCHITECTURE.md → Security):
 * - `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; …` — a JSON answer opened
 *   in a tab can't run or load anything. The files routes set their own policy (`FILE_CSP`).
 * - `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
 *   `Referrer-Policy: strict-origin-when-cross-origin`.
 * - `Cross-Origin-Resource-Policy: same-site` — the web app (same site: its own origin through the
 *   `/files` rewrite, or a sibling subdomain) still loads the logo and app icons; other sites can't.
 * - `Strict-Transport-Security` only when the session cookies are `Secure` (an https deployment):
 *   on a plain-http dev or CI server it would be ignored at best, and pin http hosts at worst.
 */
export function securityHeaders(opts: { hsts: boolean }): RequestHandler {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    frameguard: { action: 'deny' },
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: opts.hsts ? { maxAge: 31_536_000, includeSubDomains: false } : false,
  });
}
