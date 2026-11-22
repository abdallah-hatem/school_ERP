import {
  bucketApplies,
  RATE_LIMIT_BUCKETS,
  rateLimitFor,
  rateLimitKey,
  rateLimitTracker,
  retryAfterSeconds,
  subjectKey,
  type RateLimits,
} from './rate-limit.pure';

/*
 * A whole school may share one public IP (an office NAT, or the app on its own server): nothing a
 * person does in normal use is counted per IP alone at a low limit (docs/ARCHITECTURE.md →
 * Security → Rate limits).
 */

const LIMITS: RateLimits = { ttlSeconds: 60, global: 300, globalIp: 1200, auth: 10, authIp: 200, refresh: 60, heavy: 20 };
const NAT = '41.33.2.1';

describe('which buckets count a route', () => {
  it('global covers every route; authIp the auth and refresh routes; the rest only their own', () => {
    for (const route of [undefined, 'auth', 'refresh', 'heavy'] as const) expect(bucketApplies('global', route)).toBe(true);
    expect([undefined, 'auth', 'refresh', 'heavy'].map((r) => bucketApplies('authIp', r as never))).toEqual([false, true, true, false]);
    expect(bucketApplies('auth', 'auth')).toBe(true);
    expect(bucketApplies('auth', 'refresh')).toBe(false);
    expect(bucketApplies('refresh', 'refresh')).toBe(true);
    expect(bucketApplies('heavy', 'heavy')).toBe(true);
    expect(bucketApplies('heavy', undefined)).toBe(false);
  });
});

describe('who a bucket counts by', () => {
  it('sign-in: per email + IP — two emails from one IP each get their own count', () => {
    const a = rateLimitTracker('auth', { ip: NAT, subject: { kind: 'email', email: 'mona@school.test' } });
    const b = rateLimitTracker('auth', { ip: NAT, subject: { kind: 'email', email: 'omar@school.test' } });
    expect(a).not.toBe(b);
    expect(a).toBe(`email:mona@school.test|ip:${NAT}`);
  });

  it('the email is normalised like the lockout: case and spaces don’t make a new count', () => {
    const typed = (email: string) => rateLimitTracker('auth', { ip: NAT, subject: { kind: 'email', email } });
    expect(typed('  Mona@School.TEST ')).toBe(typed('mona@school.test'));
  });

  it('one email from many IPs: a separate count per IP here — the per-account lockout (email alone) is what stops it', () => {
    const keys = ['1.1.1.1', '2.2.2.2', '3.3.3.3'].map((ip) =>
      rateLimitTracker('auth', { ip, subject: { kind: 'email', email: 'mona@school.test' } }),
    );
    expect(new Set(keys).size).toBe(3);
  });

  it('password change: the user + IP; admin reset: the target user + IP', () => {
    expect(rateLimitTracker('auth', { userId: 'admin', ip: NAT, subject: { kind: 'user', userId: 'u7' } })).toBe(`user:u7|ip:${NAT}`);
  });

  it('the per-IP ceiling (authIp) counts the IP alone, whoever is named', () => {
    const a = rateLimitTracker('authIp', { ip: NAT, subject: { kind: 'email', email: 'a@x.test' } });
    const b = rateLimitTracker('authIp', { ip: NAT, subject: { kind: 'email', email: 'b@x.test' } });
    expect(a).toBe(b);
    expect(a).toBe(`ip:${NAT}`);
  });

  it('refresh: per session (its token, hashed — never the token itself); per IP without one', () => {
    const s1 = rateLimitTracker('refresh', { ip: NAT, subject: { kind: 'session', token: 'token-1' } });
    const s2 = rateLimitTracker('refresh', { ip: NAT, subject: { kind: 'session', token: 'token-2' } });
    expect(s1).not.toBe(s2);
    expect(s1).toMatch(/^session:[0-9a-f]{32}$/);
    expect(s1).not.toContain('token-1');
    expect(rateLimitTracker('refresh', { ip: NAT, subject: { kind: 'session', token: '' } })).toBe(`ip:${NAT}`);
  });

  it('global and heavy: the signed-in user (one web server IP carries the whole school); else the IP', () => {
    expect(rateLimitTracker('global', { userId: 'u1', ip: '10.0.0.2' })).toBe('user:u1');
    expect(rateLimitTracker('heavy', { userId: 'u1', ip: '10.0.0.2' })).toBe('user:u1');
    expect(rateLimitTracker('global', { ip: NAT })).toBe(`ip:${NAT}`);
  });

  it('an empty subject counts by IP alone', () => {
    expect(subjectKey(null)).toBeNull();
    expect(subjectKey({ kind: 'email', email: '  ' })).toBeNull();
    expect(rateLimitTracker('auth', { ip: NAT, subject: { kind: 'email', email: '' } })).toBe(`ip:${NAT}`);
  });
});

describe('limits', () => {
  it('global: per user signed in, the higher per-IP figure signed out; the rest as set', () => {
    expect(rateLimitFor('global', LIMITS, true)).toBe(300);
    expect(rateLimitFor('global', LIMITS, false)).toBe(1200);
    expect(rateLimitFor('auth', LIMITS, false)).toBe(10);
    expect(rateLimitFor('authIp', LIMITS, false)).toBe(200);
  });

  it('one key per bucket and caller, whatever the route', () => {
    const keys = RATE_LIMIT_BUCKETS.map((b) => rateLimitKey(b, 'ip:1.2.3.4'));
    expect(new Set(keys).size).toBe(RATE_LIMIT_BUCKETS.length);
  });

  it('retry-after: whole seconds, at least 1', () => {
    expect([0, 0.2, 42, 41.1].map(retryAfterSeconds)).toEqual([1, 1, 42, 42]);
  });
});
