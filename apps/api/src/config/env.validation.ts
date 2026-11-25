import 'reflect-metadata';
import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export const NODE_ENVS = ['development', 'test', 'production'] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

/** An empty `KEY=` line in an env file counts as not set. */
const emptyToUndefined = ({ value }: { value: unknown }) => (value === '' ? undefined : value);

/** Every environment variable the API reads. A missing required one fails at boot. */
export class EnvironmentVariables {
  @IsOptional()
  @IsIn(NODE_ENVS)
  NODE_ENV: NodeEnv = 'development';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0) // 0 = any free port (e2e)
  @Max(65535)
  PORT: number = 3001;

  @IsString()
  @Matches(/^postgres(ql)?:\/\//, { message: 'DATABASE_URL must be a postgresql:// URL' })
  DATABASE_URL: string;

  @IsOptional()
  @IsString()
  CORS_ORIGIN: string = 'http://localhost:3000';

  /** Where uploaded files (the school logo…) are stored on disk; relative to the working dir. */
  @IsOptional()
  @IsString()
  UPLOADS_DIR: string = 'uploads';
  /** Signs access tokens. Required, at least 32 characters; never committed. */
  @IsString()
  @MinLength(32, { message: 'JWT_ACCESS_SECRET must be at least 32 characters' })
  JWT_ACCESS_SECRET: string;

  /** Access token lifetime in seconds (default 15 minutes). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  JWT_ACCESS_TTL_SECONDS: number = 900;

  /** Refresh token lifetime in days (default 14). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  REFRESH_TOKEN_TTL_DAYS: number = 14;

  /**
   * A rotated refresh token reused within this many seconds gets the pair its first use got (security
   * review L5: idempotent, never a new one) — parallel requests refreshing at once. Default 10 s; reuse
   * after it revokes the family.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(120)
  REFRESH_REUSE_GRACE_SECONDS: number = 10;

  /** `Secure` flag on the session cookies. Defaults to true in production. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? undefined : value === true || value === 'true',
  )
  @IsBoolean()
  COOKIE_SECURE?: boolean;

  /**
   * Express `trust proxy` (docs/ARCHITECTURE.md → Security): unset = trust nobody, so the client
   * IP is the socket's and `X-Forwarded-For` is ignored. Set it only when a proxy in front sets
   * that header: a hop count (`1`), or addresses / presets (`loopback, uniquelocal`, `10.0.0.0/8`).
   * `true` trusts every hop and lets any client choose its own IP — refused.
   */
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @Matches(/^(?!\s*true\s*$).+$/i, { message: 'TRUST_PROXY=true would trust any client: give a hop count or addresses' })
  TRUST_PROXY?: string;

  /**
   * Behind Cloudflare: take the client IP from `CF-Connecting-IP` — only on requests that came
   * through a trusted proxy (TRUST_PROXY), and only safe when the server accepts nothing but
   * Cloudflare (and the web app) on its public ports. Default off.
   */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === undefined || value === '' ? undefined : value === true || value === 'true',
  )
  @IsBoolean()
  TRUST_CLOUDFLARE?: boolean;

  /** Rate limits (docs/ARCHITECTURE.md → Security): the window, in seconds, every limit counts in. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  RATE_LIMIT_TTL_SECONDS: number = 60;

  /** Requests per window for every route, per signed-in user. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  RATE_LIMIT_GLOBAL: number = 300;

  /**
   * Signed-out requests per window per client IP (the sign-in page, the logo, the app icons). High:
   * a whole school can share one IP, and every device loads these at the 8 AM rush.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  RATE_LIMIT_GLOBAL_IP: number = 1200;

  /**
   * Sign-in attempts per window per account + IP (the email typed; for a password change the user,
   * for an admin reset the target), on top of the per-account lockout.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  RATE_LIMIT_AUTH: number = 10;

  /**
   * Sign-ins, password changes and refreshes together per window per client IP: a ceiling a school
   * behind one NAT never reaches, but a script trying many accounts does.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  RATE_LIMIT_AUTH_IP: number = 200;

  /** Refreshes per window per session (a page load refreshes once per parallel request). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  RATE_LIMIT_REFRESH: number = 60;

  /** Exports and uploads per window per user (per IP when signed out). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  RATE_LIMIT_HEAVY: number = 20;

  /**
   * Contract PDFs (headless Chromium, contract templates spec): the browser to launch — the image's
   * Chromium headless shell; unset = playwright-core's own download (dev, CI).
   */
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  PDF_CHROMIUM_PATH?: string;

  /** At most this many PDFs are made at once; the rest wait in the queue (edge case 17). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8)
  PDF_RENDER_CONCURRENCY: number = 2;

  /** A PDF taking longer than this (queue wait excluded) fails with PDF_RENDER_FAILED (edge case 16). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  PDF_RENDER_TIMEOUT_MS: number = 20_000;

  /** At most this many PDFs wait for a slot; one more is refused at once with PDF_RENDER_BUSY. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(200)
  PDF_RENDER_QUEUE_SIZE: number = 10;

  /** A PDF waiting longer than this for a slot is refused (PDF_RENDER_BUSY) before any render starts. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  PDF_RENDER_QUEUE_WAIT_MS: number = 30_000;

  /**
   * Whether scheduled jobs (core/jobs) run on their clock. Defaults to on, except under
   * NODE_ENV=test: unit and e2e tests run a job only by triggering it (`JobRunner.run(name)`).
   */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? undefined : value === true || value === 'true',
  )
  @IsBoolean()
  JOBS_ENABLED?: boolean;

  /**
   * Web Push (VAPID) keys, base64url — `npx web-push generate-vapid-keys`, or `pnpm run setup` for a
   * fresh clone. Optional: without them push alerts are off ("not set up on this server"); set
   * all three or none. Never committed.
   */
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{80,100}$/, { message: 'VAPID_PUBLIC_KEY must be a base64url P-256 public key' })
  VAPID_PUBLIC_KEY?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{40,50}$/, { message: 'VAPID_PRIVATE_KEY must be a base64url P-256 private key' })
  VAPID_PRIVATE_KEY?: string;

  /** Who runs this server, for the push services: `mailto:…` or an `https://` URL. */
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @Matches(/^(mailto:|https:\/\/)\S+$/, { message: 'VAPID_SUBJECT must be a mailto: or https:// URL' })
  VAPID_SUBJECT?: string;
}

/** The three VAPID values together, or null when push is off. Some but not all → an error at boot. */
export function vapidFrom(
  env: Pick<EnvironmentVariables, 'VAPID_PUBLIC_KEY' | 'VAPID_PRIVATE_KEY' | 'VAPID_SUBJECT'>,
): { publicKey: string; privateKey: string; subject: string } | null {
  const { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey, VAPID_SUBJECT: subject } = env;
  const set = [publicKey, privateKey, subject].filter((v) => v !== undefined && v !== '');
  if (set.length === 0) return null;
  if (!publicKey || !privateKey || !subject) {
    throw new Error(
      'Invalid environment configuration — VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT go together: set all three or none',
    );
  }
  return { publicKey, privateKey, subject };
}

/** Used by `ConfigModule.forRoot({ validate })`. Throws with every problem listed. */
export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, config, { enableImplicitConversion: false });
  const errors = validateSync(env, { skipMissingProperties: false, whitelist: false });
  if (errors.length > 0) {
    const details = errors
      .map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('; ');
    throw new Error(`Invalid environment configuration — ${details}`);
  }
  return env;
}
