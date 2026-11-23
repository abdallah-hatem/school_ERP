import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { AuthUser } from '@school-erp/shared';
import { ExtractJwt, Strategy } from 'passport-jwt';
import {
  SESSION_FAMILY_KEY,
  type RequestWithSession,
} from '../../../common/decorators/current-session.decorator';
import type { AppConfig } from '../../../config';
import { UsersService } from '../../users';
import { TokensService, type AccessPayload } from '../services/tokens.service';
import { accessTokenFrom } from '../tokens/extract-token';

/**
 * The `jwt` strategy behind the global JwtAuthGuard. Reads the access token from the httpOnly
 * cookie (or a bearer header), verifies it, and attaches the current active user to the request.
 * A user deactivated since the token was issued is refused at once.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly users: UsersService,
    private readonly tokens: TokensService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([(req) => accessTokenFrom(req) ?? null]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<AppConfig['auth']>('auth').accessSecret,
      algorithms: ['HS256'],
      passReqToCallback: true,
    });
  }

  async validate(req: RequestWithSession, payload: AccessPayload): Promise<AuthUser> {
    const session = await this.users.findActiveSession(payload.sub);
    if (!session) throw new UnauthorizedException();
    const { user, passwordChangedAt } = session;
    // L-1 (security review): a token issued before the password last changed is good only while its
    // sign-in is still alive — the one that changed it is kept, the others were ended, and their
    // tokens stop now rather than at expiry. A token without `fam` (issued before 2026-11-23) can't
    // say which sign-in it is: after a password change it is refused once and the person signs in.
    // The extra read happens only for tokens older than the change.
    if (!(await this.tokens.stillValid(payload, passwordChangedAt))) throw new UnauthorizedException();
    // Which sign-in this is (`CurrentSession`): a password change keeps it and ends the others (M3).
    if (typeof payload.fam === 'string') req[SESSION_FAMILY_KEY] = payload.fam;
    return user;
  }
}
