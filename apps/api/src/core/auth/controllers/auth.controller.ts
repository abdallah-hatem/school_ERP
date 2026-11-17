import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseInterceptors } from '@nestjs/common';
import type { AuthUser, SessionUser } from '@school-erp/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { RefreshTokenValue } from '../decorators/refresh-token.decorator';
import { LoginDto } from '../dto/login.dto';
import { AuthCookiesInterceptor } from '../interceptors/auth-cookies.interceptor';
import { AuthService } from '../services/auth.service';
import { ClearedSession, type IssuedSession } from '../session';
import { NotAudited } from '../../audit';
import { PermissionsService, SignedIn } from '../../permissions';

/** There is no sign-up route (§2: accounts come from the seed). */
@Controller('auth')
@UseInterceptors(AuthCookiesInterceptor)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly permissions: PermissionsService,
  ) {}

  @Public()
  @NotAudited('wired in T28')
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<IssuedSession> {
    return this.auth.login(dto.email, dto.password);
  }

  @Public()
  @NotAudited('token refresh rotates the session; not an audited action in v1')
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@RefreshTokenValue() refreshToken: string | undefined): Promise<IssuedSession> {
    return this.auth.refresh(refreshToken);
  }

  @NotAudited('wired in T28')
  @Post('logout')
  @SignedIn()
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: AuthUser,
    @RefreshTokenValue() refreshToken: string | undefined,
  ): Promise<ClearedSession> {
    await this.auth.logout(user, refreshToken);
    return new ClearedSession();
  }

  /**
   * The signed-in user with the permission keys their roles grant now — the web app's `can()`
   * reads them (R6). Read fresh on every request, so a role change shows without a new sign-in.
   */
  @Get('me')
  @SignedIn()
  async me(@CurrentUser() user: AuthUser): Promise<SessionUser> {
    return { ...user, permissions: await this.permissions.permissionsFor(user) };
  }
}
