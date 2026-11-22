import { INestApplication } from '@nestjs/common';
import { AUTH_COOKIES, ErrorCode, type UserAccount } from '@school-erp/shared';
import { RATE_LIMITS, type RateLimits } from '../src/common/rate-limit';
import { DatabaseService } from '../src/database/database.service';
import { http, unique } from './helpers';
import { ANONYMOUS_HEADER, createAppAsTestUser } from './helpers/as-test-user';

/*
 * Security hardening (docs/ARCHITECTURE.md → Security): the API's response headers, the rate limits
 * (429 in the usual envelope; per user once signed in, so a school behind one IP isn't one caller),
 * uploads checked by their bytes, and SVG logos stored as PNG. The limits here are this file's own,
 * small enough to reach; the other suites run with limits nobody reaches (setup-env.ts).
 * Users are made through the API (POST /users) and sign in through POST /auth/login.
 */

const LIMITS: RateLimits = { ttlSeconds: 60, global: 30, auth: 6, refresh: 10, heavy: 10 };
const PASSWORD = 'correct-horse-battery-staple';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** `name=value; …` for the session cookies a sign-in set. */
function sessionCookie(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? (raw as string[]) : raw ? [String(raw)] : [];
  return list
    .map((c) => c.split(';')[0] ?? '')
    .filter((pair) => pair.startsWith(`${AUTH_COOKIES.access}=`) || pair.startsWith(`${AUTH_COOKIES.refresh}=`))
    .join('; ');
}

describe('security hardening (e2e)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  const userIds: string[] = [];
  const triedEmails: string[] = [];

  beforeAll(async () => {
    ({ app } = await createAppAsTestUser((b) => b.overrideProvider(RATE_LIMITS).useValue(LIMITS)));
    db = app.get(DatabaseService);
  });

  afterAll(async () => {
    const made = await db.user.findMany({ where: { id: { in: userIds } }, select: { email: true } });
    await db.loginAttempt.deleteMany({ where: { email: { in: [...made.map((u) => u.email), ...triedEmails] } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } }); // tokens cascade
    await app.close();
  });

  describe('response headers', () => {
    it('a JSON answer carries the JSON-API policy and the usual hardening headers', async () => {
      const res = await http(app).get('/settings/school').expect(200);
      const csp = res.headers['content-security-policy'];
      expect(csp).toContain("default-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(res.headers).toMatchObject({
        'x-frame-options': 'DENY',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'strict-origin-when-cross-origin',
        'cross-origin-resource-policy': 'same-site',
      });
      expect(res.headers['x-powered-by']).toBeUndefined();
      // Session cookies aren't Secure here (NODE_ENV=test): no HSTS on a plain-http server.
      expect(res.headers['strict-transport-security']).toBeUndefined();
    });

    it('errors and signed-out answers carry them too', async () => {
      const res = await http(app).get('/settings/school').set(ANONYMOUS_HEADER, '1').expect(401);
      expect(res.headers['content-security-policy']).toContain("default-src 'none'");
      expect(res.headers['x-frame-options']).toBe('DENY');
    });
  });

  describe('uploads', () => {
    it('a program renamed logo.png (declared image/png) → 400 INVALID_FILE_TYPE', async () => {
      const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(256, 0x90)]);
      const res = await http(app)
        .post('/settings/school/logo')
        .attach('file', exe, { filename: 'logo.png', contentType: 'image/png' })
        .expect(400);
      expect(res.body).toMatchObject({ success: false, error: ErrorCode.INVALID_FILE_TYPE });
    });

    it('an SVG logo — script and all — is stored and served as a PNG', async () => {
      const svg = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20">' +
          '<script>alert(document.cookie)</script>' +
          '<rect width="40" height="20" fill="#0b7a68" onload="alert(1)"/></svg>',
      );
      const res = await http(app)
        .post('/settings/school/logo')
        .attach('file', svg, { filename: 'logo.svg', contentType: 'image/svg+xml' })
        .expect(201);
      const logoUrl: string = res.body.data.logoUrl;
      expect(logoUrl).toMatch(/^\/files\/logo\/logo-[0-9a-f-]+\.png$/);
      const file = await http(app).get(logoUrl).set(ANONYMOUS_HEADER, '1').expect(200);
      expect(file.headers['content-type']).toBe('image/png');
      const body = Buffer.from(file.body as Buffer);
      expect(body.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
      expect(body.includes(Buffer.from('alert'))).toBe(false);
    });
  });

  describe('rate limits', () => {
    it('several users signed in from one IP are each counted alone: together far over the limit, none refused', async () => {
      const users: string[] = [];
      for (let i = 0; i < 3; i++) {
        const email = `${unique('rl')}@school.test`.toLowerCase();
        const made = await http(app)
          .post('/users')
          .send({ name: `Rate ${i}`, email, password: PASSWORD, roleIds: [] })
          .expect(201);
        userIds.push((made.body.data as UserAccount).id);
        const login = await http(app)
          .post('/auth/login')
          .set(ANONYMOUS_HEADER, '1')
          .send({ email, password: PASSWORD })
          .expect(200);
        users.push(sessionCookie(login));
      }
      // 3 users × 25 = 75 requests from 127.0.0.1 against a global limit of 30: all answered.
      for (let round = 0; round < 25; round++) {
        const answers = await Promise.all(
          users.map((cookie) => http(app).get('/auth/me').set(ANONYMOUS_HEADER, '1').set('Cookie', cookie)),
        );
        expect(answers.map((r) => r.status)).toEqual([200, 200, 200]);
      }
      // One of them going on past their own 30 is refused; the others are not.
      const [first, second] = users as [string, string];
      for (let i = 0; i < 5; i++) {
        await http(app).get('/auth/me').set(ANONYMOUS_HEADER, '1').set('Cookie', first).expect(200);
      }
      const over = await http(app).get('/auth/me').set(ANONYMOUS_HEADER, '1').set('Cookie', first).expect(429);
      expect(over.body.error).toBe(ErrorCode.TOO_MANY_REQUESTS);
      await http(app).get('/auth/me').set(ANONYMOUS_HEADER, '1').set('Cookie', second).expect(200);
      // The admin (another user on the same IP) still works.
      await http(app).get('/settings/school').expect(200);
    });

    it('rapid sign-ins from one IP → 429 TOO_MANY_REQUESTS in the envelope, whatever X-Forwarded-For claims', async () => {
      const statuses: number[] = [];
      let refused: { body: Record<string, unknown>; headers: Record<string, unknown> } | null = null;
      // Different emails each time, so the per-account lockout never decides; the IP limit does.
      for (let i = 0; i < LIMITS.auth + 1 && !refused; i++) {
        const email = `${unique('nobody')}@school.test`.toLowerCase();
        triedEmails.push(email);
        const res = await http(app)
          .post('/auth/login')
          .set(ANONYMOUS_HEADER, '1')
          .set('X-Forwarded-For', `203.0.113.${i + 1}`) // ignored: no proxy is trusted here
          .set('Accept-Language', 'en')
          .send({ email, password: 'wrong-password-123' });
        statuses.push(res.status);
        if (res.status === 429) refused = res;
      }
      // Earlier sign-ins in this file used part of the window: wrong passwords until the limit, then 429.
      expect(statuses.slice(0, -1).every((s) => s === 401)).toBe(true);
      expect(statuses.at(-1)).toBe(429);
      expect(refused?.body).toMatchObject({
        success: false,
        statusCode: 429,
        error: ErrorCode.TOO_MANY_REQUESTS,
        params: { count: expect.any(Number) },
      });
      expect(refused?.body.message).toMatch(/^Too many requests\. Try again in \d+ seconds?\.$/);
      expect(refused?.headers['retry-after-auth']).toBeDefined();

      // In Arabic for an Arabic page; the password change shares the same per-IP count.
      const ar = await http(app)
        .post('/auth/login')
        .set(ANONYMOUS_HEADER, '1')
        .set('Accept-Language', 'ar')
        .send({ email: 'nobody@school.test', password: 'wrong-password-123' })
        .expect(429);
      expect(ar.body.message).toMatch(/^طلبات كثيرة جدًا/);
      await http(app)
        .post('/account/password')
        .send({ currentPassword: 'x'.repeat(12), newPassword: 'y'.repeat(12) })
        .expect(429);

      // Everything else from that IP goes on.
      await http(app).get('/settings/school').expect(200);
      await http(app).get('/health').expect(200);
    });
  });
});
