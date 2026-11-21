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
  jobs: {
    /** Scheduled jobs run on their clock (off under NODE_ENV=test unless JOBS_ENABLED=true). */
    enabled: boolean;
  };
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
    jobs: { enabled: env.JOBS_ENABLED ?? env.NODE_ENV !== 'test' },
    push: vapidFrom(env),
  };
};
