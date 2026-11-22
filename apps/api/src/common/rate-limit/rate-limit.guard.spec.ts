import { CanActivate, Controller, ExecutionContext, Get, INestApplication, Injectable, Module, Post } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ErrorCode } from '@school-erp/shared';
import type { Express, Request } from 'express';
import request from 'supertest';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter';
import { RateLimit } from './rate-limit.decorator';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimitModule } from './rate-limit.module';
import type { RateLimits } from './rate-limit.pure';
import { RATE_LIMITS } from './rate-limit.tokens';

/*
 * The guard on a tiny app (no database): who each bucket counts by — a school behind one IP must
 * be able to sign in together — that a bucket's count spans its routes, and the 429 in the usual
 * envelope. A stand-in auth guard signs a request in as the user in `x-user`, like JwtAuthGuard
 * does before this guard runs.
 */

const LIMITS: RateLimits = { ttlSeconds: 60, global: 5, globalIp: 8, auth: 2, authIp: 6, refresh: 3, heavy: 2 };

@Injectable()
class FakeAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { user?: { id: string } }>();
    const id = req.headers['x-user'];
    if (typeof id === 'string') req.user = { id };
    return true;
  }
}

const emailOf = (req: Request) => {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  return typeof email === 'string' ? email : '';
};

@Controller()
class TestController {
  @Get('a')
  a() {
    return { ok: true };
  }

  @Get('b')
  b() {
    return { ok: true };
  }

  @Post('login')
  @RateLimit('auth', (req) => ({ kind: 'email', email: emailOf(req) }))
  login() {
    return { ok: true };
  }

  @Post('password')
  @RateLimit('auth', (req) => ({ kind: 'user', userId: req.user?.id ?? '' }))
  password() {
    return { ok: true };
  }

  @Post('refresh')
  @RateLimit('refresh', (req) => ({ kind: 'session', token: String(req.headers['x-refresh'] ?? '') }))
  refresh() {
    return { ok: true };
  }

  @Get('export')
  @RateLimit('heavy')
  export() {
    return { ok: true };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({ http: { trustCloudflare: false } })] }),
    RateLimitModule,
  ],
  controllers: [TestController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: FakeAuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
class TestAppModule {}

describe('RateLimitGuard', () => {
  let app: INestApplication;

  async function start(trustProxy?: string): Promise<void> {
    const moduleRef = await Test.createTestingModule({ imports: [TestAppModule] })
      .overrideProvider(RATE_LIMITS)
      .useValue(LIMITS)
      .compile();
    app = moduleRef.createNestApplication();
    if (trustProxy) (app.getHttpAdapter().getInstance() as Express).set('trust proxy', trustProxy);
    await app.init();
  }

  afterEach(() => app.close());

  const get = (path: string, user?: string) => {
    const req = request(app.getHttpServer()).get(path);
    return user ? req.set('x-user', user) : req;
  };
  const login = (email: string, ip?: string) => {
    const req = request(app.getHttpServer()).post('/login').send({ email, password: 'x' });
    return ip ? req.set('X-Forwarded-For', ip) : req;
  };

  describe('one IP', () => {
    beforeEach(() => start());

    it('signed in: counted per user, so many users from one IP are never throttled together', async () => {
      for (let i = 0; i < LIMITS.global; i++) {
        for (const user of ['u1', 'u2', 'u3']) await get('/a', user).expect(200);
      }
      await get('/a', 'u1').expect(429);
      await get('/a', 'u4').expect(200);
    });

    it('the global count spans routes', async () => {
      for (let i = 0; i < 3; i++) await get('/a', 'u1').expect(200);
      for (let i = 0; i < 2; i++) await get('/b', 'u1').expect(200);
      await get('/b', 'u1').expect(429);
    });

    it('signed out: per IP, with the higher signed-out limit', async () => {
      for (let i = 0; i < LIMITS.globalIp; i++) await get('/a').expect(200);
      await get('/a').expect(429);
      await get('/a', 'u1').expect(200);
    });

    it('sign-in: two emails from one IP each get their own count; the next on one email → 429 envelope (AR)', async () => {
      for (let i = 0; i < LIMITS.auth; i++) {
        await login('mona@school.test').expect(201);
        await login('omar@school.test').expect(201);
      }
      const res = await login(' MONA@school.test').set('Accept-Language', 'ar').expect(429);
      expect(res.body).toMatchObject({ success: false, statusCode: 429, error: ErrorCode.TOO_MANY_REQUESTS });
      expect(res.body.params.count).toBeGreaterThanOrEqual(1);
      expect(res.body.message).toMatch(/طلبات كثيرة جدًا/);
      expect(res.headers['retry-after-auth']).toBeDefined();
      await login('nada@school.test').expect(201);
    });

    it('the per-IP ceiling stops one IP trying many accounts (password spraying)', async () => {
      for (let i = 0; i < LIMITS.authIp; i++) await login(`user${i}@school.test`).expect(201);
      await login('another@school.test').expect(429);
      // Other routes from that IP go on.
      await get('/a', 'u1').expect(200);
    });

    it('password changes: per user + IP; the ceiling counts them with sign-ins', async () => {
      const change = (user: string) => request(app.getHttpServer()).post('/password').set('x-user', user);
      await change('u1').expect(201);
      await change('u1').expect(201);
      await change('u1').expect(429);
      await change('u2').expect(201);
    });

    it('refresh: per session; another session from the same IP has its own count', async () => {
      const refresh = (token: string) => request(app.getHttpServer()).post('/refresh').set('x-refresh', token);
      for (let i = 0; i < LIMITS.refresh; i++) await refresh('tab-1').expect(201);
      await refresh('tab-1').expect(429);
      await refresh('tab-2').expect(201);
    });

    it('heavy (exports, uploads): per user, on top of the global limit', async () => {
      await get('/export', 'u1').expect(200);
      await get('/export', 'u1').expect(200);
      const res = await get('/export', 'u1').expect(429);
      expect(res.body.message).toMatch(/Too many requests/);
      await get('/export', 'u2').expect(200);
    });
  });

  it('one email from many IPs is not stopped here (each IP its own count) — the per-account lockout is what stops it', async () => {
    await start('loopback');
    for (let i = 1; i <= 6; i++) await login('mona@school.test', `203.0.113.${i}`).expect(201);
  });
});
