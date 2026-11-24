import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Express } from 'express';
import { securityHeaders } from './common/security/security-headers';

/** App-level setup shared by main.ts and the e2e harness, so tests run the real configuration. */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);
  // Proxy headers (X-Forwarded-For) are believed only when the deployment names its proxies
  // (TRUST_PROXY); otherwise the client IP is the socket's (docs/ARCHITECTURE.md → Security).
  const trustProxy = config.get<number | string | null>('http.trustProxy') ?? null;
  if (trustProxy !== null) {
    (app.getHttpAdapter().getInstance() as Express).set('trust proxy', trustProxy);
  }
  // JSON bodies up to 1 MB: a contract template carries two texts of up to 200 KB each (spec →
  // Templates); everything else stays far below. Uploads are multipart, capped by their own rules.
  (app as NestExpressApplication).useBodyParser('json', { limit: '1mb' });
  app.use(securityHeaders({ hsts: config.get<boolean>('auth.cookieSecure') ?? false }));
  app.enableCors({ origin: config.get<string>('corsOrigin'), credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.enableShutdownHooks();
}
