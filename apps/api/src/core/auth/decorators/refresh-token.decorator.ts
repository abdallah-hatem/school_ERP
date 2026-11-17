import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { refreshTokenFrom } from '../tokens/extract-token';

/** The raw refresh token from its cookie (or a bearer header), or undefined. */
export const RefreshTokenValue = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined =>
    refreshTokenFrom(ctx.switchToHttp().getRequest<Request>()),
);
