import { INestApplication, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { DiscoveryModule, DiscoveryService, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import {
  AUTH_COOKIES,
  ErrorCode,
  PERMISSION_KEYS,
  PUBLIC_FILES_PREFIX,
  SEED_ADMIN_ROLES,
} from '@school-erp/shared';
import { createHash } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { IS_PUBLIC_KEY } from '../src/common/decorators/public.decorator';
import { hashPassword } from '../src/common/utils/password.util';
import { DatabaseService } from '../src/database/database.service';
import { http, unique } from './helpers';
import { giveRoles } from './helpers/as-test-user';

/** A minimal PNG (signature + padding) for the logo upload. */
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1),
]);

const PASSWORD = 'correct-horse-battery-staple';
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

/** `name=value` pairs from a response's Set-Cookie headers. */
function cookiesOf(res: { headers: Record<string, unknown> }): Record<string, string> {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? (raw as string[]) : raw ? [String(raw)] : [];
  return Object.fromEntries(
    list.map((c) => {
      const [pair = ''] = c.split(';');
      const eq = pair.indexOf('=');
      return [pair.slice(0, eq), decodeURIComponent(pair.slice(eq + 1))];
    }),
  );
}

const cookieHeader = (cookies: Record<string, string>) =>
  Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');

describe('auth (e2e)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let jwt: JwtService;
  const userIds: string[] = [];

  async function makeUser(opts: { isActive?: boolean } = {}) {
    const email = `${unique('user')}@school.test`.toLowerCase();
    const user = await db.user.create({
      data: {
        email,
        name: 'Test Admin',
        passwordHash: await hashPassword(PASSWORD, 4),
        isActive: opts.isActive ?? true,
      },
    });
    userIds.push(user.id);
    // Like the seeded admin (P2: access comes from roles).
    await giveRoles(db, user.id, SEED_ADMIN_ROLES);
    return user;
  }

  const login = (email: string, password = PASSWORD) =>
    http(app).post('/auth/login').send({ email, password });

  /** `METHOD /path` for every registered handler not marked @Public(); params filled in. */
  function guardedRoutes(): string[] {
    const reflector = app.get(Reflector);
    const out: string[] = [];
    for (const { instance, metatype } of app.get(DiscoveryService).getControllers()) {
      if (!instance || !metatype) continue;
      const base = String(Reflect.getMetadata(PATH_METADATA, metatype) ?? '');
      const proto = Object.getPrototypeOf(instance) as Record<string, unknown>;
      for (const name of Object.getOwnPropertyNames(proto)) {
        const handler = proto[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        const sub = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
        if (sub === undefined) continue;
        const isPublic = reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [handler, metatype]);
        if (isPublic) continue;
        const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as number];
        const path = `/${base}/${sub}`
          .replace(/\/+/g, '/')
          .replace(/\/$/, '')
          .replace(/:[A-Za-z]+/g, '00000000-0000-4000-8000-000000000000');
        out.push(`${method} ${path || '/'}`);
      }
    }
    return out;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, DiscoveryModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.listen(app.get(ConfigService).getOrThrow<number>('port'));
    db = app.get(DatabaseService);
    jwt = app.get(JwtService);
  });

  afterAll(async () => {
    await db.schoolSetting.deleteMany({ where: { updatedById: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } }); // tokens cascade
    await app.close();
  });

  it('Wrong password → 401, generic message, no hint which field was wrong', async () => {
    const user = await makeUser();
    const res = await login(user.email, 'wrong-password').set('Accept-Language', 'en').expect(401);
    expect(res.body).toMatchObject({ success: false, error: ErrorCode.INVALID_CREDENTIALS });
    expect(res.body.message).toBe('Email or password is incorrect.');
    expect(cookiesOf(res)).toEqual({});
  });

  it('Unknown email → same 401 as a wrong password', async () => {
    const user = await makeUser();
    const wrong = await login(user.email, 'wrong-password').set('Accept-Language', 'en');
    const unknown = await login('nobody@school.test').set('Accept-Language', 'en');
    expect(unknown.status).toBe(401);
    expect({ error: unknown.body.error, message: unknown.body.message }).toEqual({
      error: wrong.body.error,
      message: wrong.body.message,
    });
  });

  it('An inactive user gets the same 401 as a wrong password', async () => {
    const user = await makeUser({ isActive: false });
    const res = await login(user.email).expect(401);
    expect(res.body.error).toBe(ErrorCode.INVALID_CREDENTIALS);
  });

  it('Email in different case → signs in', async () => {
    const user = await makeUser();
    const res = await login(`  ${user.email.toUpperCase()}`.trim()).expect(200);
    expect(res.body.data.user).toMatchObject({ id: user.id, email: user.email });
  });

  it('Missing / malformed body → 400', async () => {
    const missing = await http(app).post('/auth/login').send({}).expect(400);
    expect(missing.body.error).toBe(ErrorCode.VALIDATION_FAILED);

    await http(app).post('/auth/login').send({ email: 'not-an-email', password: 'x' }).expect(400);
    await http(app).post('/auth/login').send({ email: 'a@b.co', password: 123 }).expect(400);
    await http(app)
      .post('/auth/login')
      .send({ email: 'a@b.co', password: 'x', role: 'HR_ADMIN' }) // unknown field
      .expect(400);

    const malformed = await http(app)
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": "a@b.co", ')
      .expect(400);
    expect(malformed.body.success).toBe(false);
  });

  it('Any non-public route without a cookie → 401', async () => {
    // Every route the app registers (now and as modules land), except the @Public() ones.
    const routes = guardedRoutes();
    expect(routes).toEqual(expect.arrayContaining(['GET /auth/me', 'POST /auth/logout']));
    for (const route of routes) {
      const [method = 'GET', path = '/'] = route.split(' ');
      const res = await http(app)[method.toLowerCase() as 'get'](path).send({});
      expect([route, res.status]).toEqual([route, 401]);
      expect(res.body.error).toBe(ErrorCode.UNAUTHORIZED);
    }
    // A forged or garbage token is no better than none.
    await http(app).get('/auth/me').set('Cookie', `${AUTH_COOKIES.access}=garbage`).expect(401);
  });

  it('A deactivated user is refused even with a valid access token', async () => {
    const user = await makeUser();
    const cookies = cookiesOf(await login(user.email).expect(200));
    await db.user.update({ where: { id: user.id }, data: { isActive: false } });
    await http(app).get('/auth/me').set('Cookie', cookieHeader(cookies)).expect(401);
    await http(app)
      .post('/auth/refresh')
      .set('Cookie', `${AUTH_COOKIES.refresh}=${cookies[AUTH_COOKIES.refresh]}`)
      .expect(401);
  });

  it('Expired access token + valid refresh → refreshed transparently', async () => {
    const user = await makeUser();
    const cookies = cookiesOf(await login(user.email).expect(200));
    const expired = await jwt.signAsync({ sub: user.id, role: user.role }, { expiresIn: -10 });

    await http(app).get('/auth/me').set('Cookie', `${AUTH_COOKIES.access}=${expired}`).expect(401);

    const refreshed = await http(app)
      .post('/auth/refresh')
      .set('Cookie', `${AUTH_COOKIES.refresh}=${cookies[AUTH_COOKIES.refresh]}`)
      .expect(200);
    expect(refreshed.body.data.user.id).toBe(user.id);
    const next = cookiesOf(refreshed);
    expect(next[AUTH_COOKIES.refresh]).not.toBe(cookies[AUTH_COOKIES.refresh]);

    const me = await http(app)
      .get('/auth/me')
      .set('Cookie', `${AUTH_COOKIES.access}=${next[AUTH_COOKIES.access]}`)
      .expect(200);
    expect(me.body.data).toEqual({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      // System admin + HR manager hold every key (P2); the web app's can() reads them.
      permissions: PERMISSION_KEYS,
    });

    // The web server forwards tokens as a bearer header; that works the same way.
    await http(app)
      .post('/auth/refresh')
      .set('Authorization', `Bearer ${next[AUTH_COOKIES.refresh]}`)
      .expect(200);
  });

  it('Reused (rotated) refresh token → 401', async () => {
    const user = await makeUser();
    const first = cookiesOf(await login(user.email).expect(200))[AUTH_COOKIES.refresh];
    const rotated = await http(app)
      .post('/auth/refresh')
      .set('Cookie', `${AUTH_COOKIES.refresh}=${first}`)
      .expect(200);
    const second = cookiesOf(rotated)[AUTH_COOKIES.refresh];

    // Replayed after the grace window (parallel requests get 30 s): treated as theft.
    await db.refreshToken.update({
      where: { tokenHash: sha256(first) },
      data: { usedAt: new Date(Date.now() - 60_000) },
    });
    const replay = await http(app)
      .post('/auth/refresh')
      .set('Cookie', `${AUTH_COOKIES.refresh}=${first}`)
      .expect(401);
    expect(replay.body.error).toBe(ErrorCode.INVALID_REFRESH_TOKEN);

    // …and the whole family is revoked, so the stolen-then-rotated token is dead too.
    await http(app)
      .post('/auth/refresh')
      .set('Cookie', `${AUTH_COOKIES.refresh}=${second}`)
      .expect(401);
  });

  it('Several requests refreshing at once with the same token all succeed (grace window)', async () => {
    const user = await makeUser();
    const token = cookiesOf(await login(user.email).expect(200))[AUTH_COOKIES.refresh];
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        http(app).post('/auth/refresh').set('Cookie', `${AUTH_COOKIES.refresh}=${token}`),
      ),
    );
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    const familyIds = await db.refreshToken.findMany({
      where: { userId: user.id },
      select: { familyId: true },
    });
    expect(new Set(familyIds.map((f) => f.familyId)).size).toBe(1);
  });

  it('An unknown or missing refresh token → 401', async () => {
    await http(app).post('/auth/refresh').expect(401);
    await http(app).post('/auth/refresh').set('Cookie', `${AUTH_COOKIES.refresh}=nope`).expect(401);
  });

  it('POST /auth/register (or any sign-up route) → 404', async () => {
    for (const path of ['/auth/register', '/auth/signup', '/auth/sign-up']) {
      const res = await http(app).post(path).send({ email: 'x@y.co', password: 'secret-secret' });
      expect([path, res.status]).toEqual([path, 404]);
    }
    // R9 — accounts are created by a System admin (POST /users), never by the visitor.
    await http(app)
      .post('/users')
      .send({ name: 'X', email: 'x@y.co', password: 'secret-secret', roleIds: [] })
      .expect(401);
  });

  it('A 400/409 error has the same error code in both languages; message is Arabic with ar, English with en', async () => {
    const send = (lang: string) =>
      http(app).post('/auth/login').set('Accept-Language', lang).send({ email: 'bad' });
    const [en, ar] = await Promise.all([send('en'), send('ar')]);
    expect(en.status).toBe(400);
    expect(ar.status).toBe(400);
    expect(en.body.error).toBe(ErrorCode.VALIDATION_FAILED);
    expect(ar.body.error).toBe(en.body.error);
    expect(en.body.message).toBe('Some fields are invalid.');
    expect(ar.body.message).toBe('بعض الحقول غير صحيحة.');

    // Same for a business error (401 here; auth has no 409 route) and a regional tag.
    const wrong = (lang: string) =>
      http(app)
        .post('/auth/login')
        .set('Accept-Language', lang)
        .send({ email: 'a@b.co', password: 'x' });
    const [en2, ar2] = await Promise.all([wrong('en-US,en;q=0.9'), wrong('ar-EG')]);
    expect(ar2.body.error).toBe(en2.body.error);
    expect(en2.body.message).toBe('Email or password is incorrect.');
    expect(ar2.body.message).toBe('البريد الإلكتروني أو كلمة المرور غير صحيحة.');
  });

  it('GET /files/<logo> without a cookie → 200; any other /files/… without a cookie → 401', async () => {
    const user = await makeUser();
    const cookies = cookieHeader(cookiesOf(await login(user.email).expect(200)));
    const upload = await http(app)
      .post('/settings/school/logo')
      .set('Cookie', cookies)
      .attach('file', PNG, { filename: 'logo.png', contentType: 'image/png' })
      .expect(201);
    const logoUrl: string = upload.body.data.logoUrl;
    expect(logoUrl.startsWith(PUBLIC_FILES_PREFIX)).toBe(true);

    await http(app).get(logoUrl).expect(200);
    await http(app).get('/files/payslips/payslip-2026-11.pdf').expect(401);
    // Climbing out of the public folder never reaches another file.
    await http(app).get('/files/logo/..%2Fpayslips%2Fx.pdf').expect(404);
    // Guarded even where no controller serves the path (e.g. static file serving).
    await http(app).get('/files/uploads/contracts/contract.pdf').expect(401);
    // With a session the request reaches the files route (404: no such file).
    await http(app).get('/files/payslips/payslip-2026-11.pdf').set('Cookie', cookies).expect(404);
  });

  it('GET /settings/school/public without a cookie → 200 with only the 4 identity fields', async () => {
    const res = await http(app).get('/settings/school/public').expect(200);
    expect(Object.keys(res.body.data).sort()).toEqual(
      ['defaultLanguage', 'logoUrl', 'nameAr', 'nameEn'].sort(),
    );
    // The full settings (hours, working days) still need a session.
    await http(app).get('/settings/school').expect(401);
  });

  it('full flow: sign in → me → refresh → sign out → session gone', async () => {
    const user = await makeUser();
    const res = await login(user.email).expect(200);

    // Tokens travel only in httpOnly cookies, never in the body.
    expect(res.body.data).toEqual({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/token/i);
    const setCookie = (res.headers['set-cookie'] as unknown as string[]).join('\n');
    expect(setCookie).toMatch(new RegExp(`${AUTH_COOKIES.access}=[^;]+;.*HttpOnly`));
    expect(setCookie).toMatch(new RegExp(`${AUTH_COOKIES.refresh}=[^;]+;.*HttpOnly`));
    expect(setCookie).toMatch(/SameSite=Lax/);

    let cookies = cookiesOf(res);
    await http(app).get('/auth/me').set('Cookie', cookieHeader(cookies)).expect(200);

    const refreshed = await http(app)
      .post('/auth/refresh')
      .set('Cookie', cookieHeader(cookies))
      .expect(200);
    cookies = cookiesOf(refreshed);

    const out = await http(app)
      .post('/auth/logout')
      .set('Cookie', cookieHeader(cookies))
      .expect(200);
    expect(out.body.data).toEqual({});
    const cleared = (out.headers['set-cookie'] as unknown as string[]).join('\n');
    expect(cleared).toMatch(new RegExp(`${AUTH_COOKIES.access}=;`));
    expect(cleared).toMatch(new RegExp(`${AUTH_COOKIES.refresh}=;`));

    // The refresh token is revoked server-side, not just forgotten by the browser.
    await http(app)
      .post('/auth/refresh')
      .set('Cookie', `${AUTH_COOKIES.refresh}=${cookies[AUTH_COOKIES.refresh]}`)
      .expect(401);
  });
});
