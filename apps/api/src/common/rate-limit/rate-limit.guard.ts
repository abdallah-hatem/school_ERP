import { ExecutionContext, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerLimitDetail,
  type ThrottlerModuleOptions,
  type ThrottlerRequest,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import { ErrorCode } from '@school-erp/shared';
import type { Request } from 'express';
import { CodedException } from '../errors/coded.exception';
import { clientIpOf } from '../security/client-ip';
import { RATE_LIMIT_ROUTE, type RouteRateLimitMeta } from './rate-limit.decorator';
import { RATE_LIMITS } from './rate-limit.tokens';
import {
  bucketApplies,
  rateLimitFor,
  rateLimitKey,
  rateLimitTracker,
  retryAfterSeconds,
  type RateLimitBucket,
  type RateLimits,
  type RateLimitSubject,
} from './rate-limit.pure';

type RequestWithUser = Request & { user?: { id?: string } };

/**
 * The rate limits (`rate-limit.pure.ts`) as a global guard. It runs after `JwtAuthGuard`, so a
 * signed-in caller is counted by user. Over a limit → 429 `TOO_MANY_REQUESTS` in the usual
 * envelope, `params.count` = seconds to wait, plus a `Retry-After-<bucket>` header.
 */
@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  private readonly trustCloudflare: boolean;

  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
    config: ConfigService,
    @Inject(RATE_LIMITS) private readonly limits: RateLimits,
  ) {
    super(options, storage, reflector);
    this.trustCloudflare = config.get<boolean>('http.trustCloudflare') ?? false;
  }

  protected override async handleRequest(props: ThrottlerRequest): Promise<boolean> {
    const bucket = props.throttler.name as RateLimitBucket;
    const route = this.reflector.getAllAndOverride<RouteRateLimitMeta | undefined>(RATE_LIMIT_ROUTE, [
      props.context.getHandler(),
      props.context.getClass(),
    ]);
    if (!bucketApplies(bucket, route?.bucket)) return true;
    const req = props.context.switchToHttp().getRequest<RequestWithUser>();
    const subject: RateLimitSubject = route?.subject?.(req) ?? null;
    return super.handleRequest({
      ...props,
      limit: rateLimitFor(bucket, this.limits, Boolean(req.user?.id)),
      getTracker: () =>
        rateLimitTracker(bucket, {
          userId: req.user?.id,
          ip: clientIpOf(req, { trustCloudflare: this.trustCloudflare }),
          subject,
        }),
      generateKey: (_context, tracker) => rateLimitKey(bucket, tracker),
    });
  }

  protected override throwThrottlingException(
    _context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    throw CodedException.withParams(HttpStatus.TOO_MANY_REQUESTS, ErrorCode.TOO_MANY_REQUESTS, {
      count: retryAfterSeconds(detail.timeToBlockExpire),
    });
  }
}
