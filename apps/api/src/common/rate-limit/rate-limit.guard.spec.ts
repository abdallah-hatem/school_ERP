import { CanActivate, Controller, ExecutionContext, Get, INestApplication, Injectable, Module, Post } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ErrorCode } from '@school-erp/shared';
import type { Request } from 'express';
import request from 'supertest';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter';
import { RateLimit } from './rate-limit.decorator';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimitModule, RATE_LIMITS } from './rate-limit.module';
import type { RateLimits } from './rate-limit.pure';

/*
 * The guard on a tiny app (no database): who each bucket counts by, that a bucket's count spans its
 * routes, and the 429 in the usual envelope. A stand-in auth guard signs a request in as the user in
 * `x-user`, like JwtAuthGuard does before this guard runs.
 */

const LIMITS: RateLimits = { ttlSeconds: 60, global: 5, auth: 2, refresh: 3, heavy: 2 };

@Injectable()
class FakeAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { user?: { id: string } }>();
    const id = req.headers['x-user'];
    if (typeof id === 'string') req.user = { id };
    return true;
  }
}

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
  @RateLimit('auth')
  login() {
    return { ok: true };
  }

  @Post('password')
  @RateLimit('auth')
  password() {
    return { ok: true };
  }

  @Get('export')
  @RateLimit('heavy')
  export() {
    return { ok: true };
  }
}

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({ http: { trustCloudflare: false } })] }), RateLimitModule],
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

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [TestAppModule] })
      .overrideProvider(RATE_LIMITS)
      .useValue(LIMITS)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(() => app.close());

  const get = (path: string, user?: string) => {
    const req = request(app.getHttpServer()).get(path);
    return user ? req.set('x-user', user) : req;
  };

  it('signed in: counted per user, so many users from one IP are never throttled together', async () => {
    for (let i = 0; i < LIMITS.global; i++) {
      for (const user of ['u1', 'u2', 'u3']) await get('/a', user).expect(200);
    }
    // 15 requests from one IP, none refused; the 6th from u1 is.
    await get('/a', 'u1').expect(429);
    await get('/a', 'u2').expect(429);
    await get('/a', 'u4').expect(200);
  });

  it('the global count spans routes: a burst spread over two routes is still one count', async () => {
    for (let i = 0; i < 3; i++) await get('/a', 'u1').expect(200);
    for (let i = 0; i < 2; i++) await get('/b', 'u1').expect(200);
    await get('/b', 'u1').expect(429);
  });

  it('signed out: counted per IP', async () => {
    for (let i = 0; i < LIMITS.global; i++) await get('/a').expect(200);
    await get('/a').expect(429);
    await get('/a', 'u1').expect(200);
  });

  it('auth: per IP across sign-in and password routes, even for different users; other routes untouched', async () => {
    const post = (path: string, user?: string) => {
      const req = request(app.getHttpServer()).post(path);
      return user ? req.set('x-user', user) : req;
    };
    await post('/login').expect(201);
    await post('/password', 'u1').expect(201);
    const res = await post('/login', 'u2').set('Accept-Language', 'ar').expect(429);
    expect(res.body).toMatchObject({ success: false, statusCode: 429, error: ErrorCode.TOO_MANY_REQUESTS });
    expect(res.body.params.count).toBeGreaterThanOrEqual(1);
    expect(res.body.message).toMatch(/طلبات كثيرة جدًا/);
    expect(res.headers['retry-after-auth']).toBeDefined();
    await get('/a', 'u2').expect(200);
  });

  it('heavy (exports, uploads): per user, on top of the global limit', async () => {
    await get('/export', 'u1').expect(200);
    await get('/export', 'u1').expect(200);
    const res = await get('/export', 'u1').expect(429);
    expect(res.body.message).toMatch(/Too many requests/);
    await get('/export', 'u2').expect(200);
    await get('/a', 'u1').expect(200);
  });
});
