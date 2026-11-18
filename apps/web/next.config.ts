import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@school-erp/shared'],
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
