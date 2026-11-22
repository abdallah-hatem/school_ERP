import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseInterceptors } from '@nestjs/common';
import type { AuthUser, SessionUser } from '@school-erp/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { RateLimit } from '../../../common/rate-limit';
import { RefreshTokenValue } from '../decorators/refresh-token.decorator';
import { refreshTokenFrom } from '../tokens/extract-token';
import { LoginDto } from '../dto/login.dto';
import { AuthCookiesInterceptor } from '../interceptors/auth-cookies.interceptor';
import { AuthService } from '../services/auth.service';
import { ClearedSession, type IssuedSession } from '../session';
import { Audited, NotAudited } from '../../audit';
import { AllowedBeforePasswordChange, PermissionsService, SignedIn } from '../../permissions';
import { UsersService } from '../../users';

/** The email a sign-in names, before validation (the rate limit runs before the body pipe). */
function emailTyped(body: unknown): string {
  const email = (body as { email?: unknown } | undefined)?.email;
  return typeof email === 'string' ? email : '';
}

/** There is no sign-up route (§2: accounts come from the seed). */
@Controller('auth')
@UseInterceptors(AuthCookiesInterceptor)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly permissions: PermissionsService,
    private readonly users: UsersService,
  ) {}

  @Public()
  @NotAudited(
    'records its own entries: core.auth.sign_in in one transaction with the session; failed sign-ins and lockouts each in their own, since a request transaction would hold a connection while they wait for another',
  )
  @Post('login')
  // Per email typed + IP: a school behind one IP signs in together (docs/ARCHITECTURE.md → Security).
  @RateLimit('auth', (req) => ({ kind: 'email', email: emailTyped(req.body) }))
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<IssuedSession> {
    return this.auth.login(dto.email, dto.password);
  }

  @Public()
  @NotAudited('token refresh rotates the session; not an audited action in v1')
  @Post('refresh')
  // Per session (its refresh token); per IP when there is none.
  @RateLimit('refresh', (req) => ({ kind: 'session', token: refreshTokenFrom(req) ?? '' }))
  @HttpCode(HttpStatus.OK)
  refresh(@RefreshTokenValue() refreshToken: string | undefined): Promise<IssuedSession> {
    return this.auth.refresh(refreshToken);
  }

  @Audited('core.auth.sign_out')
  @Post('logout')
  @SignedIn()
  @AllowedBeforePasswordChange()
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
   * reads them (R6) — and the roles themselves (the user chip). Read fresh on every request, so a
   * role change shows without a new sign-in. `employee`: the linked employee's photo and gender
   * (the chip's avatar). Also answered while `mustChangePassword` is set: the
   * web app reads the flag here and sends the user to "Set a new password".
   */
  @Get('me')
  @SignedIn()
  @AllowedBeforePasswordChange()
  async me(@CurrentUser() user: AuthUser): Promise<SessionUser> {
    const [permissions, roles, employee] = await Promise.all([
      this.permissions.permissionsFor(user),
      this.users.rolesOf(user.id),
      this.users.avatarOf(user.id),
    ]);
    return { ...user, permissions, roles, employee };
  }
}
