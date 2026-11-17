import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '@school-erp/shared';
import type { Request } from 'express';

/**
 * The signed-in user the auth strategy attached to the request (`req.user`). Ownership and
 * "changed by" always come from here, never from the body or params.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined =>
    ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>().user,
);
