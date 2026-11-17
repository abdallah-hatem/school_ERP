import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authProxy } from './proxy';

/** An unsigned JWT-shaped token — the proxy only reads `exp` and `role` for routing. */
function token(expInSeconds: number, role = 'HR_ADMIN'): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + expInSeconds;
  return `${b64({ alg: 'HS256' })}.${b64({ sub: 'u-1', role, exp })}.sig`;
}

function request(path: string, cookies: Record<string, string> = {}): NextRequest {
  const cookie = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: cookie ? { cookie } : {},
  });
}

/** The API's /auth/refresh answer: new cookies in Set-Cookie, `{ user }` in the body. */
function refreshOk(access: string, refresh = 'rotated-refresh') {
  const headers = new Headers({ 'content-type': 'application/json' });
  headers.append('set-cookie', `auth_token=${access}; Max-Age=900; Path=/; HttpOnly; SameSite=Lax`);
  headers.append(
    'set-cookie',
    `refresh_token=${refresh}; Max-Age=1209600; Path=/auth; HttpOnly; SameSite=Lax`,
  );
  return new Response(JSON.stringify({ success: true, data: { user: {} } }), {
    status: 200,
    headers,
  });
}

const location = (res: Response) => {
  const loc = res.headers.get('location');
  return loc ? new URL(loc).pathname + new URL(loc).search : null;
};

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv('BASE_URL', 'http://api.test');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('auth routing (proxy)', () => {
  it('signed-out visitor opening any page → redirected to /login, keeping the path', async () => {
    for (const path of ['/ar', '/ar/employees', '/en/payroll?month=2026-11']) {
      const res = await authProxy(request(path));
      expect(location(res)).toBe(`/${path.split('/')[1]}/login?next=${encodeURIComponent(path)}`);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('signed-in visitor opening /login → redirected to the dashboard (the role home)', async () => {
    const res = await authProxy(request('/en/login', { auth_token: token(600) }));
    expect(location(res)).toBe('/en');
  });

  it('signed-out visitor on /login stays there', async () => {
    const res = await authProxy(request('/ar/login'));
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  it('signed-in visitor on a protected page passes through', async () => {
    const res = await authProxy(request('/ar/employees', { auth_token: token(600) }));
    expect(res.headers.get('location')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('expired access token + valid refresh → refreshed in place, no redirect', async () => {
    const fresh = token(900);
    fetchMock.mockResolvedValueOnce(refreshOk(fresh));
    const res = await authProxy(
      request('/ar/employees', {
        auth_token: token(-60),
        refresh_token: 'old-refresh',
      }),
    );

    expect(res.headers.get('location')).toBeNull();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://api.test/auth/refresh');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer old-refresh');
    // Both cookies set on the response…
    expect(res.cookies.get('auth_token')?.value).toBe(fresh);
    expect(res.cookies.get('refresh_token')?.value).toBe('rotated-refresh');
    expect(res.cookies.get('auth_token')?.httpOnly).toBe(true);
    // …and the new access token forwarded to this same request.
    expect(res.headers.get('x-middleware-request-cookie')).toContain(`auth_token=${fresh}`);
  });

  it('missing access token + valid refresh on /login → refreshed, then sent home', async () => {
    fetchMock.mockResolvedValueOnce(refreshOk(token(900)));
    const res = await authProxy(request('/ar/login', { refresh_token: 'old-refresh' }));
    expect(location(res)).toBe('/ar');
    expect(res.cookies.get('refresh_token')?.value).toBe('rotated-refresh');
  });

  it('failed refresh → login, and the dead cookies are cleared', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 401 }));
    const res = await authProxy(
      request('/en/payroll', {
        auth_token: token(-60),
        refresh_token: 'revoked',
      }),
    );
    expect(location(res)).toBe(`/en/login?next=${encodeURIComponent('/en/payroll')}`);
    expect(res.cookies.get('auth_token')?.value).toBe('');
    expect(res.cookies.get('refresh_token')?.value).toBe('');
  });

  it('several requests refreshing at once with the same refresh token all get through', async () => {
    fetchMock.mockImplementation(async () => refreshOk(token(900)));
    const cookies = { auth_token: token(-60), refresh_token: 'shared-refresh' };
    const results = await Promise.all(
      ['/ar', '/ar/employees', '/ar/payroll', '/ar/settings'].map((p) =>
        authProxy(request(p, cookies)),
      ),
    );
    expect(fetchMock).toHaveBeenCalledTimes(4);
    for (const res of results) {
      expect(res.headers.get('location')).toBeNull();
      expect(res.cookies.get('auth_token')?.value).toBeTruthy();
    }
  });

  it('a path without a locale gets the visitor language (cookie), else Arabic', async () => {
    expect(location(await authProxy(request('/employees')))).toBe('/ar/employees');
    expect(location(await authProxy(request('/login?next=%2Fen', { lang: 'en' })))).toBe(
      '/en/login?next=%2Fen',
    );
  });

  it('a garbage access token counts as signed out', async () => {
    const res = await authProxy(request('/ar/employees', { auth_token: 'not-a-jwt' }));
    expect(location(res)).toContain('/ar/login');
    expect(res.cookies.get('auth_token')?.value).toBe('');
  });
});
