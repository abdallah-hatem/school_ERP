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
   * A rotated refresh token reused within this many seconds gets a new pair in the same family
   * (parallel requests refreshing at once). Reuse after it revokes the family.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(120)
  REFRESH_REUSE_GRACE_SECONDS: number = 30;

  /** `Secure` flag on the session cookies. Defaults to true in production. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? undefined : value === true || value === 'true',
  )
  @IsBoolean()
  COOKIE_SECURE?: boolean;
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
