import { ExecutionContext, INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import type { AuthUser } from '@school-erp/shared';
import type { Request } from 'express';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { JwtAuthGuard } from '../../src/common/guards/jwt-auth.guard';
import { DatabaseService } from '../../src/database/database.service';

/** The fixed signed-in user for e2e tests. Stored as a real `users` row so foreign keys hold. */
export const TEST_USER_EMAIL = 'e2e-test-user@example.test';

/** Send this header to act as a signed-out caller (no cookie): the real guard decides. */
export const ANONYMOUS_HEADER = 'x-test-anonymous';

/**
 * Boots the real AppModule (same setup as main.ts) with the global JWT guard signing every
 * request in as a fixed test user — e2e tests don't depend on the auth module.
 *
 * The guard is registered as `APP_GUARD` with `useClass`, which `overrideGuard` can't reach, so
 * its `canActivate` is replaced on the prototype instead (jest isolates modules per test file).
 * `customize` can add further overrides before compiling.
 *
 * @example const { app, user } = await createAppAsTestUser();
 */
export async function createAppAsTestUser(
  customize: (builder: TestingModuleBuilder) => TestingModuleBuilder = (b) => b,
): Promise<{ app: INestApplication; user: AuthUser }> {
  const user: AuthUser = { id: '', email: TEST_USER_EMAIL, name: 'E2E Test User', role: 'HR_ADMIN' };
  // Called with the guard as `this` below.
  const realCanActivate = JwtAuthGuard.prototype.canActivate;
  jest.spyOn(JwtAuthGuard.prototype, 'canActivate').mockImplementation(function (
    this: JwtAuthGuard,
    context: ExecutionContext,
  ) {
    const req = context.switchToHttp().getRequest<Request>();
    // A signed-out caller goes through the real guard: `@Public()` passes, the rest get 401.
    if (req.headers[ANONYMOUS_HEADER]) return realCanActivate.call(this, context);
    req.user = user;
    return true;
  });

  const moduleRef = await customize(Test.createTestingModule({ imports: [AppModule] })).compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  const row = await app.get(DatabaseService).user.upsert({
    where: { email: TEST_USER_EMAIL },
    create: { email: TEST_USER_EMAIL, name: user.name, passwordHash: 'not-a-real-hash' },
    update: {},
    select: { id: true },
  });
  user.id = row.id;

  await app.listen(app.get(ConfigService).getOrThrow<number>('port'));
  return { app, user };
}
