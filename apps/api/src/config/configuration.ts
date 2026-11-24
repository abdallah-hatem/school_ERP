import { parseTrustProxy } from '../common/security/client-ip';
import type { RateLimits } from '../common/rate-limit/rate-limit.pure';
import { validateEnv, vapidFrom, type NodeEnv } from './env.validation';

/** Typed application config. The only place `process.env` is read (house lint rule). */
export interface AppConfig {
  nodeEnv: NodeEnv;
  port: number;
  databaseUrl: string;
  corsOrigin: string;
  uploadsDir: string;
  auth: {
    accessSecret: string;
    accessTtlSeconds: number;
    refreshTtlDays: number;
    refreshReuseGraceSeconds: number;
    cookieSecure: boolean;
  };
  /** Who sits in front of the API (docs/ARCHITECTURE.md → Security). */
  http: {
    /** Express `trust proxy`: null = none (the socket's address is the client). */
    trustProxy: number | string | null;
    /** Read `CF-Connecting-IP` on requests through a trusted proxy. */
    trustCloudflare: boolean;
  };
  /** Requests allowed per `ttlSeconds` window, per bucket (`common/rate-limit`). */
  rateLimit: RateLimits;
  jobs: {
    /** Scheduled jobs run on their clock (off under NODE_ENV=test unless JOBS_ENABLED=true). */
    enabled: boolean;
  };
  /** Contract PDFs: the Chromium to launch (null = playwright-core's), renders at once, the time limit. */
  pdf: { chromiumPath: string | null; concurrency: number; timeoutMs: number };
  /** Web Push (VAPID); null: push alerts are off on this server. */
  push: { publicKey: string; privateKey: string; subject: string } | null;
}

export const configuration = (): AppConfig => {
  const env = validateEnv(process.env);
  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    corsOrigin: env.CORS_ORIGIN,
    uploadsDir: env.UPLOADS_DIR,
    auth: {
      accessSecret: env.JWT_ACCESS_SECRET,
      accessTtlSeconds: env.JWT_ACCESS_TTL_SECONDS,
      refreshTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
      refreshReuseGraceSeconds: env.REFRESH_REUSE_GRACE_SECONDS,
      cookieSecure: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
    },
    http: {
      trustProxy: parseTrustProxy(env.TRUST_PROXY),
      trustCloudflare: env.TRUST_CLOUDFLARE ?? false,
    },
    rateLimit: {
      ttlSeconds: env.RATE_LIMIT_TTL_SECONDS,
      global: env.RATE_LIMIT_GLOBAL,
      globalIp: env.RATE_LIMIT_GLOBAL_IP,
      auth: env.RATE_LIMIT_AUTH,
      authIp: env.RATE_LIMIT_AUTH_IP,
      refresh: env.RATE_LIMIT_REFRESH,
      heavy: env.RATE_LIMIT_HEAVY,
    },
    jobs: { enabled: env.JOBS_ENABLED ?? env.NODE_ENV !== 'test' },
    pdf: {
      chromiumPath: env.PDF_CHROMIUM_PATH ?? null,
      concurrency: env.PDF_RENDER_CONCURRENCY,
      timeoutMs: env.PDF_RENDER_TIMEOUT_MS,
    },
    push: vapidFrom(env),
  };
};
