import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { PlaceholderJwtStrategy } from './strategies/placeholder-jwt.strategy';

/** core/auth — login, refresh, logout, me (T2). */
@Module({
  imports: [PassportModule],
  providers: [PlaceholderJwtStrategy],
})
export class AuthModule {}
