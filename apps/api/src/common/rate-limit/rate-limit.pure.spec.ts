import {
  bucketApplies,
  RATE_LIMIT_BUCKETS,
  rateLimitKey,
  rateLimitTracker,
  retryAfterSeconds,
} from './rate-limit.pure';

describe('rate limit rules', () => {
  it('global covers every route; auth, refresh and heavy only their own', () => {
    for (const route of [undefined, 'auth', 'refresh', 'heavy'] as const) {
      expect(bucketApplies('global', route)).toBe(true);
    }
    expect(bucketApplies('auth', 'auth')).toBe(true);
    expect(bucketApplies('auth', undefined)).toBe(false);
    expect(bucketApplies('auth', 'heavy')).toBe(false);
    expect(bucketApplies('heavy', 'heavy')).toBe(true);
    expect(bucketApplies('refresh', 'auth')).toBe(false);
  });

  it('global and heavy count a signed-in caller by user — one server IP carries the whole school', () => {
    expect(rateLimitTracker('global', { userId: 'u1', ip: '10.0.0.2' })).toBe('user:u1');
    expect(rateLimitTracker('heavy', { userId: 'u1', ip: '10.0.0.2' })).toBe('user:u1');
    expect(rateLimitTracker('global', { userId: 'u2', ip: '10.0.0.2' })).not.toBe(
      rateLimitTracker('global', { userId: 'u1', ip: '10.0.0.2' }),
    );
  });

  it('signed out: by client IP', () => {
    expect(rateLimitTracker('global', { userId: undefined, ip: '41.33.2.1' })).toBe('ip:41.33.2.1');
    expect(rateLimitTracker('heavy', { userId: null, ip: '41.33.2.1' })).toBe('ip:41.33.2.1');
  });

  it('auth and refresh always by client IP, even with a session (who is trying, not who they say)', () => {
    expect(rateLimitTracker('auth', { userId: 'u1', ip: '41.33.2.1' })).toBe('ip:41.33.2.1');
    expect(rateLimitTracker('refresh', { userId: 'u1', ip: '41.33.2.1' })).toBe('ip:41.33.2.1');
  });

  it('one key per bucket and caller, whatever the route', () => {
    const keys = RATE_LIMIT_BUCKETS.map((b) => rateLimitKey(b, 'ip:1.2.3.4'));
    expect(new Set(keys).size).toBe(RATE_LIMIT_BUCKETS.length);
    expect(rateLimitKey('auth', 'ip:1.2.3.4')).toBe('auth:ip:1.2.3.4');
  });

  it('retry-after: whole seconds, at least 1', () => {
    expect(retryAfterSeconds(0)).toBe(1);
    expect(retryAfterSeconds(0.2)).toBe(1);
    expect(retryAfterSeconds(42)).toBe(42);
    expect(retryAfterSeconds(41.1)).toBe(42);
  });
});
