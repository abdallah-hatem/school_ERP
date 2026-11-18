import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { AppConfig } from '../../config';
import { PermissionsModule } from '../permissions';
import { SignInLimitModule } from '../sign-in-limit';
import { UsersModule } from '../users';
import { AuthController } from './controllers/auth.controller';
import { AuthCookiesInterceptor } from './interceptors/auth-cookies.interceptor';
import { FilesAccessMiddleware } from './middleware/files-access.middleware';
import { SessionsEndedListener } from './listeners/sessions-ended.listener';
import { RefreshTokensRepository } from './repositories/refresh-tokens.repository';
import { AuthService } from './services/auth.service';
import { TokensService } from './services/tokens.service';
import { JwtStrategy } from './strategies/jwt.strategy';

/** core/auth — login, refresh, logout, me; the `jwt` strategy behind the global guard. */
@Module({
  imports: [
    PassportModule,
    UsersModule,
    PermissionsModule,
    SignInLimitModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const auth = config.getOrThrow<AppConfig['auth']>('auth');
        return {
          secret: auth.accessSecret,
          signOptions: { expiresIn: auth.accessTtlSeconds, algorithm: 'HS256' },
          verifyOptions: { algorithms: ['HS256'] },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokensService,
    RefreshTokensRepository,
    JwtStrategy,
    AuthCookiesInterceptor,
    FilesAccessMiddleware,
    SessionsEndedListener,
  ],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(FilesAccessMiddleware)
      .forRoutes({ path: 'files/*path', method: RequestMethod.ALL });
  }
}
