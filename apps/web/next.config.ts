import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@school-erp/shared'],
  // Arabic is the default locale (spec). T2/T3 replace this with locale-aware middleware.
  async redirects() {
    return [{ source: '/', destination: '/ar', permanent: false }];
  },
};

export default nextConfig;
