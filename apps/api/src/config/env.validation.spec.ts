import { validateEnv } from './env.validation';

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
    expect(env.REFRESH_REUSE_GRACE_SECONDS).toBe(30);
  });

  it('rejects an invalid PORT and NODE_ENV', () => {
    expect(() => validateEnv({ ...BASE, PORT: '70000' })).toThrow(/PORT/);
    expect(() => validateEnv({ ...BASE, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('fails at boot when the JWT secret is missing or short', () => {
    expect(() => validateEnv({ DATABASE_URL: URL })).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => validateEnv({ ...BASE, JWT_ACCESS_SECRET: 'short' })).toThrow(/32 characters/);
  });

  it('reads COOKIE_SECURE as a boolean', () => {
    expect(validateEnv({ ...BASE, COOKIE_SECURE: 'true' }).COOKIE_SECURE).toBe(true);
    expect(validateEnv({ ...BASE, COOKIE_SECURE: 'false' }).COOKIE_SECURE).toBe(false);
    expect(validateEnv(BASE).COOKIE_SECURE).toBeUndefined();
  });
});
