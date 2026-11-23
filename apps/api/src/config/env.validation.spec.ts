import webPush from 'web-push';
import { validateEnv, vapidFrom } from './env.validation';

const URL = 'postgresql://u:p@localhost:5442/db';
const SECRET = 'x'.repeat(32);
const BASE = { DATABASE_URL: URL, JWT_ACCESS_SECRET: SECRET };

describe('validateEnv', () => {
  it('fails at boot when DATABASE_URL is missing', () => {
    expect(() => validateEnv({ JWT_ACCESS_SECRET: SECRET })).toThrow(/DATABASE_URL/);
  });

  it('rejects a non-postgres DATABASE_URL', () => {
    expect(() => validateEnv({ ...BASE, DATABASE_URL: 'mysql://x' })).toThrow(/postgresql/);
  });

  it('applies defaults and converts PORT to a number', () => {
    const env = validateEnv({ ...BASE, PORT: '4000' });
    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.JWT_ACCESS_TTL_SECONDS).toBe(900);
    expect(env.REFRESH_REUSE_GRACE_SECONDS).toBe(10);
  });

  it('rejects an invalid PORT and NODE_ENV', () => {
    expect(() => validateEnv({ ...BASE, PORT: '70000' })).toThrow(/PORT/);
    expect(() => validateEnv({ ...BASE, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('fails at boot when the JWT secret is missing or short', () => {
    expect(() => validateEnv({ DATABASE_URL: URL })).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => validateEnv({ ...BASE, JWT_ACCESS_SECRET: 'short' })).toThrow(/32 characters/);
  });

  describe('VAPID keys (push alerts, 2026-11-21)', () => {
    // A pair made for this run only (never a committed key).
    const keys = webPush.generateVAPIDKeys();
    const VAPID = {
      VAPID_PUBLIC_KEY: keys.publicKey,
      VAPID_PRIVATE_KEY: keys.privateKey,
      VAPID_SUBJECT: 'mailto:it@example.test',
    };

    it('none set (or empty lines) → push off', () => {
      expect(vapidFrom(validateEnv(BASE))).toBeNull();
      expect(
        vapidFrom(validateEnv({ ...BASE, VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', VAPID_SUBJECT: '' })),
      ).toBeNull();
    });

    it('all three → push on', () => {
      expect(vapidFrom(validateEnv({ ...BASE, ...VAPID }))).toEqual({
        publicKey: VAPID.VAPID_PUBLIC_KEY,
        privateKey: VAPID.VAPID_PRIVATE_KEY,
        subject: VAPID.VAPID_SUBJECT,
      });
    });

    it('some but not all, or a malformed one → fails at boot', () => {
      const { VAPID_SUBJECT: _subject, ...two } = VAPID;
      expect(() => vapidFrom(validateEnv({ ...BASE, ...two }))).toThrow(/set all three or none/);
      expect(() => validateEnv({ ...BASE, ...VAPID, VAPID_SUBJECT: 'it@example.test' })).toThrow(/VAPID_SUBJECT/);
      expect(() => validateEnv({ ...BASE, ...VAPID, VAPID_PUBLIC_KEY: 'short' })).toThrow(/VAPID_PUBLIC_KEY/);
    });
  });

  describe('proxies and rate limits (security hardening)', () => {
    it('defaults: no proxy trusted, Cloudflare off; per-IP ceilings high enough for a school behind one NAT', () => {
      const env = validateEnv(BASE);
      expect(env.TRUST_PROXY).toBeUndefined();
      expect(env.TRUST_CLOUDFLARE).toBeUndefined();
      expect(env).toMatchObject({
        RATE_LIMIT_TTL_SECONDS: 60,
        RATE_LIMIT_GLOBAL: 300,
        RATE_LIMIT_GLOBAL_IP: 1200,
        RATE_LIMIT_AUTH: 10,
        RATE_LIMIT_AUTH_IP: 200,
        RATE_LIMIT_REFRESH: 60,
        RATE_LIMIT_HEAVY: 20,
      });
    });

    it('reads the values given; a limit below 1 fails at boot', () => {
      const env = validateEnv({ ...BASE, TRUST_PROXY: 'loopback, uniquelocal', TRUST_CLOUDFLARE: 'true', RATE_LIMIT_AUTH: '5' });
      expect(env).toMatchObject({ TRUST_PROXY: 'loopback, uniquelocal', TRUST_CLOUDFLARE: true, RATE_LIMIT_AUTH: 5 });
      expect(() => validateEnv({ ...BASE, RATE_LIMIT_GLOBAL: '0' })).toThrow(/RATE_LIMIT_GLOBAL/);
    });

    it('TRUST_PROXY=true (any client picks its own IP) fails at boot', () => {
      expect(() => validateEnv({ ...BASE, TRUST_PROXY: 'true' })).toThrow(/TRUST_PROXY/);
      expect(() => validateEnv({ ...BASE, TRUST_PROXY: ' TRUE ' })).toThrow(/TRUST_PROXY/);
    });
  });

  it('reads COOKIE_SECURE as a boolean', () => {
    expect(validateEnv({ ...BASE, COOKIE_SECURE: 'true' }).COOKIE_SECURE).toBe(true);
    expect(validateEnv({ ...BASE, COOKIE_SECURE: 'false' }).COOKIE_SECURE).toBe(false);
    expect(validateEnv(BASE).COOKIE_SECURE).toBeUndefined();
  });
});
