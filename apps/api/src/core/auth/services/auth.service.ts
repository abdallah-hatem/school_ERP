import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode, type AuthUser } from '@school-erp/shared';
import { CodedException } from '../../../common/errors/coded.exception';
import { UsersService } from '../../users';
import { IssuedSession } from '../session';
import { TokensService } from './tokens.service';

/** Sign-in, refresh and sign-out. Cookies are written by AuthCookiesInterceptor. */
@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly tokens: TokensService,
  ) {}

  /** Wrong password, unknown email and inactive user all get the same 401 (no hint). */
  async login(email: string, password: string): Promise<IssuedSession> {
    const user = await this.users.verifyCredentials(email, password);
    if (!user) throw new CodedException(HttpStatus.UNAUTHORIZED, ErrorCode.INVALID_CREDENTIALS);
    return this.issue(user, await this.tokens.issueRefresh(user.id));
  }

  async refresh(rawRefreshToken: string | undefined): Promise<IssuedSession> {
    const rotated = await this.tokens.rotate(rawRefreshToken);
    if (!rotated.ok) {
      throw new CodedException(HttpStatus.UNAUTHORIZED, ErrorCode.INVALID_REFRESH_TOKEN);
    }
    const user = await this.users.findActiveAuthUser(rotated.userId);
    if (!user) {
      await this.tokens.revokeFamily(rotated.familyId);
      throw new CodedException(HttpStatus.UNAUTHORIZED, ErrorCode.INVALID_REFRESH_TOKEN);
    }
    return this.issue(user, rotated.refreshToken);
  }

  async logout(user: AuthUser, rawRefreshToken: string | undefined): Promise<void> {
    await this.tokens.revoke(rawRefreshToken, user.id);
  }

  private async issue(user: AuthUser, refreshToken: string): Promise<IssuedSession> {
    return new IssuedSession(user, {
      accessToken: await this.tokens.signAccess(user),
      refreshToken,
    });
  }
}
