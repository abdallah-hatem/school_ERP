import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { PUBLIC_FILES_PREFIX } from '@school-erp/shared';
import type { NextFunction, Request, Response } from 'express';
import { UsersService } from '../../users';
import { TokensService } from '../services/tokens.service';
import { accessTokenFrom } from '../tokens/extract-token';

/**
 * Guards `/files/…` however the files are served (a controller or static middleware): the
 * logo under `PUBLIC_FILES_PREFIX` is public because the sign-in page shows it; every other
 * file needs a signed-in, active user.
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
    if (path.startsWith(PUBLIC_FILES_PREFIX) && !climbs) return next();

    const payload = await this.tokens.verifyAccess(accessTokenFrom(req));
    const user = payload ? await this.users.findActiveAuthUser(payload.sub) : null;
    if (!user) throw new UnauthorizedException();
    next();
  }
}
