import { AUTH_COOKIES } from '@school-erp/shared';
import type { Request } from 'express';
import { bearerToken, parseCookieHeader } from '../../../common/utils/cookies.util';

/**
 * Tokens travel in httpOnly cookies (browser → API) or as a bearer header (the web server
 * forwarding the cookie it holds). The cookie wins when both are present.
 */
function fromRequest(req: Pick<Request, 'headers'>, cookie: string): string | undefined {
  const cookies = parseCookieHeader(req.headers.cookie);
  return cookies[cookie] || bearerToken(req.headers.authorization);
}

export const accessTokenFrom = (req: Pick<Request, 'headers'>) =>
  fromRequest(req, AUTH_COOKIES.access);

export const refreshTokenFrom = (req: Pick<Request, 'headers'>) =>
  fromRequest(req, AUTH_COOKIES.refresh);
