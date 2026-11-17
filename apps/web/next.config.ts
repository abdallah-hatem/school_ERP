import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@school-erp/shared'],
  // Arabic is the default locale (spec); the proxy (src/proxy.ts) prefixes the visitor's language.
  async redirects() {
    return [{ source: '/', destination: '/ar', permanent: false }];
  },
  // Files (the school logo on the sign-in page, later uploads) are served by the API; the
  // browser only ever talks to this origin. The session cookie travels with the request.
  async rewrites() {
    const api = process.env.BASE_URL;
    return api ? [{ source: '/files/:path*', destination: `${api}/files/:path*` }] : [];
  },
};

export default nextConfig;
