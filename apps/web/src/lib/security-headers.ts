/*
 * The web app's security headers (docs/ARCHITECTURE.md → Security). Pure, so they are tested
 * alone; `src/proxy.ts` puts the Content-Security-Policy on every page with a fresh nonce, and
 * `next.config.ts` puts the static headers on every response.
 *
 * A new external origin the browser must reach (a script, an image host, an API) is added here —
 * otherwise the browser blocks it (docs/CONVENTIONS.md → Security).
 */

/** The request header carrying the page's nonce to the render (Next reads it from the CSP itself). */
export const NONCE_HEADER = 'x-nonce';

/** A fresh nonce for one response: 128 random bits, base64. */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/**
 * The origin of the API as the browser could reach it, for `img-src` / `connect-src`:
 * `API_PUBLIC_ORIGIN` when set, else the origin of `BASE_URL`. Today the browser only talks to this
 * app (files go through the `/files` rewrite), so this is the allowance for direct use later.
 * Nothing (or an unparsable value) → none.
 */
export function apiOrigin(env: { API_PUBLIC_ORIGIN?: string; BASE_URL?: string }): string | null {
  for (const value of [env.API_PUBLIC_ORIGIN, env.BASE_URL]) {
    if (!value) continue;
    try {
      return new URL(value).origin;
    } catch {
      // not a URL: try the next one
    }
  }
  return null;
}

/**
 * The page's Content-Security-Policy.
 * - `script-src 'nonce-…' 'strict-dynamic'`: only scripts carrying this response's nonce run —
 *   Next puts it on its own scripts, including the streamed reveal (`$RC`) — and what they load.
 *   `'self'` is ignored next to `'strict-dynamic'` by current browsers; it is there for old ones.
 *   `'unsafe-eval'` in development only (React's dev tools and Fast Refresh evaluate code).
 * - `style-src 'unsafe-inline'`: React renders `style={…}` as inline style attributes (the
 *   charts, the sidebar's widths, branding colours), and a nonce can't cover an attribute. Styles
 *   can't run script, so this leaves the script policy whole.
 * - `img-src data: blob:`: inlined icons and the photo preview before upload.
 * - nothing may frame the app, change its base URL or post its forms elsewhere; no plugins.
 */
export function contentSecurityPolicy(opts: { nonce: string; dev: boolean; apiOrigin: string | null }): string {
  const api = opts.apiOrigin ? [opts.apiOrigin] : [];
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'", `'nonce-${opts.nonce}'`, "'strict-dynamic'", ...(opts.dev ? ["'unsafe-eval'"] : [])],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', ...api],
    'font-src': ["'self'"],
    'connect-src': ["'self'", ...api],
    'worker-src': ["'self'"],
    'manifest-src': ["'self'"],
    'frame-ancestors': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'object-src': ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${[...new Set(values)].join(' ')}`)
    .join('; ');
}

/**
 * Headers on every response of the web app (pages, route handlers, static files) — next.config.ts.
 * Camera, microphone and geolocation are off: nothing in the app uses them, so no page (or script
 * that slipped in) can ask.
 */
export const STATIC_SECURITY_HEADERS: ReadonlyArray<{ key: string; value: string }> = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

/** The client's address headers the web server passes on to the API (the rate limits count by them). */
const CLIENT_ADDRESS_HEADERS = ['x-forwarded-for', 'cf-connecting-ip'] as const;

/**
 * The client-address headers of the browser's request, to forward on the server's own call to the
 * API. The API believes them only from a proxy it trusts (`TRUST_PROXY`, `TRUST_CLOUDFLARE`);
 * without them every signed-out request — sign-in included — would count as the web server's IP.
 */
export function clientAddressHeaders(from: Pick<Headers, 'get'>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of CLIENT_ADDRESS_HEADERS) {
    const value = from.get(name);
    if (value) out[name] = value;
  }
  return out;
}
