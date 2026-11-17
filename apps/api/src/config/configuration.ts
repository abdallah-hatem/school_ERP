import { validateEnv, type NodeEnv } from './env.validation';

/** Typed application config. The only place `process.env` is read (house lint rule). */
export interface AppConfig {
  nodeEnv: NodeEnv;
  port: number;
  databaseUrl: string;
  corsOrigin: string;
  uploadsDir: string;
}

export const configuration = (): AppConfig => {
  const env = validateEnv(process.env);
  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    corsOrigin: env.CORS_ORIGIN,
    uploadsDir: env.UPLOADS_DIR,
  };
};
