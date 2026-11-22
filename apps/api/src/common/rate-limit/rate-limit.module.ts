import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule, type ThrottlerModuleOptions } from '@nestjs/throttler';
import { RATE_LIMIT_BUCKETS, type RateLimits } from './rate-limit.pure';

/** The limits in force (`AppConfig.rateLimit`). A token, so an e2e test can set its own. */
export const RATE_LIMITS = Symbol('RATE_LIMITS');

@Module({
  providers: [
    {
      provide: RATE_LIMITS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): RateLimits => config.getOrThrow<RateLimits>('rateLimit'),
    },
  ],
  exports: [RATE_LIMITS],
})
export class RateLimitConfigModule {}

/**
 * The rate limits' counters: one named throttler per bucket, kept in memory — one API process
 * per school (docs/ARCHITECTURE.md → Deployment model); a second replica would need a shared
 * store. `RateLimitGuard` (registered in AppModule after the auth guard) applies them.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [RateLimitConfigModule],
      inject: [RATE_LIMITS],
      useFactory: (limits: RateLimits): ThrottlerModuleOptions => ({
        throttlers: RATE_LIMIT_BUCKETS.map((name) => ({
          name,
          ttl: limits.ttlSeconds * 1000,
          limit: limits[name],
        })),
      }),
    }),
  ],
  exports: [ThrottlerModule],
})
export class RateLimitModule {}
