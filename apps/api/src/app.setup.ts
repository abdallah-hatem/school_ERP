import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** App-level setup shared by main.ts and the e2e harness, so tests run the real configuration. */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);
  app.enableCors({ origin: config.get<string>('corsOrigin'), credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.enableShutdownHooks();
}
