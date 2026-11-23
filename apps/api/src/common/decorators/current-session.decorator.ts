import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** Where the auth strategy puts the sign-in (refresh-token family) the request's access token belongs to. */
export const SESSION_FAMILY_KEY = 'sessionFamilyId';

export type RequestWithSession = Request & { [SESSION_FAMILY_KEY]?: string };

/**
 * The sign-in the request comes from: the refresh-token family its access token was issued for
 * (`fam` in the token), or undefined for a token issued before it carried one. Used to keep the
 * caller's own sign-in when the others end (a password change, security review M3).
 */
export const CurrentSession = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined =>
    ctx.switchToHttp().getRequest<RequestWithSession>()[SESSION_FAMILY_KEY],
);
