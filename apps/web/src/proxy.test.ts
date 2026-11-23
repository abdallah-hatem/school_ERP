import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config, proxy } from './proxy';

/*
 * The page proxy's security part (docs/ARCHITECTURE.md → Security): every page response carries a
 * Content-Security-Policy with a fresh nonce, and the render gets the same policy and nonce on its
 * request (Next takes the nonce from there for its own scripts, the streamed reveal included).
 */

/** An unsigned JWT-shaped token — the proxy only reads `exp` for routing. */
function token(expInSeconds: number): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256' })}.${b64({ sub: 'u-1', exp: Math.floor(Date.now() / 1000) + expInSeconds })}.sig`;
}

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

const nonceOf = (csp: string | null) => /'nonce-([^']+)'/.exec(csp ?? '')?.[1];

describe('proxy: Content-Security-Policy', () => {
  it('a signed-in page: the policy on the response, and the same policy + nonce on the render’s request', async () => {
    const res = await proxy(new NextRequest('http://localhost:3000/en/employees', { headers: { cookie: `auth_token=${token(600)}` } }));
    const csp = res.headers.get('content-security-policy');
    expect(csp).toContain("script-src 'self' 'nonce-");
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain('connect-src \'self\' http://api.test');
    // NextResponse.next({ request: { headers } }) hands them over as x-middleware-request-* headers.
    expect(res.headers.get('x-middleware-request-content-security-policy')).toBe(csp);
    expect(res.headers.get('x-middleware-request-x-nonce')).toBe(nonceOf(csp));
  });

  it('a new nonce for every response', async () => {
    const page = () => proxy(new NextRequest('http://localhost:3000/en/login'));
    const [a, b] = await Promise.all([page(), page()]);
    expect(nonceOf(a.headers.get('content-security-policy'))).toBeTruthy();
    expect(nonceOf(a.headers.get('content-security-policy'))).not.toBe(nonceOf(b.headers.get('content-security-policy')));
  });

  it('a redirect (signed out on a protected page) carries the policy too', async () => {
    const res = await proxy(new NextRequest('http://localhost:3000/en/payroll'));
    expect(res.status).toBe(307);
    expect(res.headers.get('content-security-policy')).toContain("object-src 'none'");
  });

  it('unsafe-eval only in development', async () => {
    const prod = await proxy(new NextRequest('http://localhost:3000/en/login'));
    expect(prod.headers.get('content-security-policy')).not.toContain('unsafe-eval');
    vi.stubEnv('NODE_ENV', 'development');
    const dev = await proxy(new NextRequest('http://localhost:3000/en/login'));
    expect(dev.headers.get('content-security-policy')).toContain("'unsafe-eval'");
  });

  it('a refresh in place passes the browser’s client-address headers to the API (its refresh limit is per IP)', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    await proxy(
      new NextRequest('http://localhost:3000/en/employees', {
        headers: { cookie: 'refresh_token=r1', 'x-forwarded-for': '41.33.2.1', 'cf-connecting-ip': '41.33.2.1' },
      }),
    );
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.headers).toMatchObject({ 'x-forwarded-for': '41.33.2.1', 'cf-connecting-ip': '41.33.2.1' });
  });
});

describe('which requests the proxy sees (config.matcher)', () => {
  const matches = (path: string) => new RegExp(`^${config.matcher[0]}$`).test(path);

  it('pages, and unknown addresses with an extension (their 404 gets the nonce CSP and the language)', () => {
    for (const path of ['/', '/en', '/en/employees/12', '/no-such.php', '/ar/x.php', '/.env', '/apple-touch-icon.png']) {
      expect(matches(path), path).toBe(true);
    }
  });

  it("not Next internals, route handlers, the API's files or the app's own files", () => {
    for (const path of ['/_next/static/x.js', '/api/auth/refresh', '/files/logo.png', '/favicon.ico', '/sw.js', '/manifest.webmanifest', '/offline.html']) {
      expect(matches(path), path).toBe(false);
    }
  });
});
