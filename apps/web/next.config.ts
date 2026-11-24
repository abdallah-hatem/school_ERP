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
  // Every Server Action — the sign-in one too — may carry at most 3 MB: enough for the uploads that
  // are still actions (the 2 MB employee photo and school logo) and Next's 1 MB default refused
  // them. Larger uploads (a contract's signed copy, its letters) go through the upload Route
  // Handler instead (`src/lib/upload-proxy.ts`): session first, its own cap, streamed to the API.
  // docs/ARCHITECTURE.md → Security → Uploads.
  experimental: {
    serverActions: { bodySizeLimit: '3mb' },
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
