import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { PUBLIC_FILES_PREFIXES } from '@school-erp/shared';
import type { NextFunction, Request, Response } from 'express';
import { UsersService } from '../../users';
import { TokensService } from '../services/tokens.service';
import { accessTokenFrom } from '../tokens/extract-token';

/**
 * Guards `/files/…` however the files are served (a controller or static middleware): the
 * logo and the app icons drawn from it (`PUBLIC_FILES_PREFIXES`) are public because the sign-in
 * page and the installed app show them; every other file needs a signed-in, active user.
 */
@Injectable()
export class FilesAccessMiddleware implements NestMiddleware {
  constructor(
    private readonly tokens: TokensService,
    private readonly users: UsersService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const path = (req.originalUrl ?? req.url).split('?')[0] ?? '';
    // A literal `..` segment could climb out of the public folder: never treat it as public.
    // Encoded names (`..%2F…`) stay one route parameter; the logo route refuses them (404).
    const climbs = path.split('/').some((segment) => segment === '..' || segment === '.');
    if (PUBLIC_FILES_PREFIXES.some((prefix) => path.startsWith(prefix)) && !climbs) return next();

    const payload = await this.tokens.verifyAccess(accessTokenFrom(req));
    const session = payload ? await this.users.findActiveSession(payload.sub) : null;
    // The same check as every API request (L-1): an ended sign-in opens no file either.
    if (!payload || !session || !(await this.tokens.stillValid(payload, session.validAfter))) {
      throw new UnauthorizedException();
    }
    next();
  }
}
