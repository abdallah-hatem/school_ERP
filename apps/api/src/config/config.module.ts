import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { configuration } from './configuration';
import { validateEnv } from './env.validation';

/** Global config. Validation runs at boot, so a missing DATABASE_URL stops the app immediately. */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      load: [configuration],
    }),
  ],
})
export class AppConfigModule {}
