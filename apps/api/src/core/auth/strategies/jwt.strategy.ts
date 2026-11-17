import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { AuthUser } from '@school-erp/shared';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AppConfig } from '../../../config';
import { UsersService } from '../../users';
import type { AccessPayload } from '../services/tokens.service';
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
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([(req) => accessTokenFrom(req) ?? null]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<AppConfig['auth']>('auth').accessSecret,
      algorithms: ['HS256'],
    });
  }

  async validate(payload: AccessPayload): Promise<AuthUser> {
    const user = await this.users.findActiveAuthUser(payload.sub);
    if (!user) throw new UnauthorizedException();
    return user;
  }
}
