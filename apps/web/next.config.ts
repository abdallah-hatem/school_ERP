import type { NextConfig } from 'next';
import { STATIC_SECURITY_HEADERS } from './src/lib/security-headers';

/**
 * Test-only pages (`page.e2e.tsx`, e.g. the forced server error of the error-pages smoke spec) are
 * pages only in a build made with `NEXT_PUBLIC_E2E_HOOKS=true` (scripts/smoke.sh). In every other
 * build Next doesn't read them, so those routes can't exist in production.
 */
const E2E_PAGE_EXTENSIONS = process.env.NEXT_PUBLIC_E2E_HOOKS === 'true' ? ['e2e.tsx'] : [];

const nextConfig: NextConfig = {
  transpilePackages: ['@school-erp/shared'],
  poweredByHeader: false,
  pageExtensions: ['tsx', 'ts', 'jsx', 'js', ...E2E_PAGE_EXTENSIONS],
  // Uploads go through Server Actions (`apis.ts`). Their body was capped at Next's 1 MB default, so
  // a phone photo of a contract page (≤ 10 MB, CONTRACT_SIGNED_COPY_UPLOAD) — or a 2 MB employee
  // photo — failed before reaching the API. 11 MB leaves room for the multipart envelope; the API
  // still enforces each upload's own limit. The proxy reads the same body, so its cap matches.
  experimental: {
    serverActions: { bodySizeLimit: '11mb' },
    proxyClientMaxBodySize: '11mb',
  },
  // On every response. The Content-Security-Policy needs a nonce per page, so the proxy sets it
  // (src/proxy.ts; docs/ARCHITECTURE.md → Security).
  async headers() {
    return [{ source: '/:path*', headers: [...STATIC_SECURITY_HEADERS] }];
  },
  // No locale redirect here: the proxy (src/proxy.ts) prefixes the visitor's language (`lang`
  // cookie, else English — the default since 2026-11-17). A config redirect runs before the proxy
  // and used to force `/` to Arabic.
  // Files (the school logo on the sign-in page, later uploads) are served by the API; the
  // browser only ever talks to this origin. The session cookie travels with the request.
  async rewrites() {
    const api = process.env.BASE_URL;
    return api ? [{ source: '/files/:path*', destination: `${api}/files/:path*` }] : [];
  },
};

export default nextConfig;
