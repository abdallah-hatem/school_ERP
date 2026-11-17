import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AUTH_COOKIES } from '@school-erp/shared';
import type { CookieOptions, Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { AppConfig } from '../../../config';
import { TokensService } from '../services/tokens.service';
import { ClearedSession, IssuedSession } from '../session';

/** The refresh cookie only travels to the auth routes. */
const REFRESH_COOKIE_PATH = '/auth';

/** Writes the session cookies for auth results and keeps tokens out of the body. */
@Injectable()
export class AuthCookiesInterceptor implements NestInterceptor {
  private readonly secure: boolean;

  constructor(
    private readonly tokens: TokensService,
    config: ConfigService,
  ) {
    this.secure = config.getOrThrow<AppConfig['auth']>('auth').cookieSecure;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const res = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      map((result: unknown) => {
        if (result instanceof IssuedSession) {
          res.cookie(AUTH_COOKIES.access, result.tokens.accessToken, {
            ...this.base('/'),
            maxAge: this.tokens.accessTtlSeconds * 1000,
          });
          res.cookie(AUTH_COOKIES.refresh, result.tokens.refreshToken, {
            ...this.base(REFRESH_COOKIE_PATH),
            maxAge: this.tokens.refreshTtlSeconds * 1000,
          });
          return { user: result.user };
        }
        if (result instanceof ClearedSession) {
          res.clearCookie(AUTH_COOKIES.access, this.base('/'));
          res.clearCookie(AUTH_COOKIES.refresh, this.base(REFRESH_COOKIE_PATH));
          return {};
        }
        return result;
      }),
    );
  }

  private base(path: string): CookieOptions {
    return { httpOnly: true, secure: this.secure, sameSite: 'lax', path };
  }
}
