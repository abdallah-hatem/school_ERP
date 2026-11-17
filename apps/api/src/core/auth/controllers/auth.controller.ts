import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseInterceptors } from '@nestjs/common';
import type { AuthUser } from '@school-erp/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { RefreshTokenValue } from '../decorators/refresh-token.decorator';
import { LoginDto } from '../dto/login.dto';
import { AuthCookiesInterceptor } from '../interceptors/auth-cookies.interceptor';
import { AuthService } from '../services/auth.service';
import { ClearedSession, type IssuedSession } from '../session';

/** There is no sign-up route (§2: accounts come from the seed). */
@Controller('auth')
@UseInterceptors(AuthCookiesInterceptor)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<IssuedSession> {
    return this.auth.login(dto.email, dto.password);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@RefreshTokenValue() refreshToken: string | undefined): Promise<IssuedSession> {
    return this.auth.refresh(refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: AuthUser,
    @RefreshTokenValue() refreshToken: string | undefined,
  ): Promise<ClearedSession> {
    await this.auth.logout(user, refreshToken);
    return new ClearedSession();
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}
