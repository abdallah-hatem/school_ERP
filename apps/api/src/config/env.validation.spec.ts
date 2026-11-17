import { validateEnv } from './env.validation';

const URL = 'postgresql://u:p@localhost:5442/db';

describe('validateEnv', () => {
  it('fails at boot when DATABASE_URL is missing', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });

  it('rejects a non-postgres DATABASE_URL', () => {
    expect(() => validateEnv({ DATABASE_URL: 'mysql://x' })).toThrow(/postgresql/);
  });

  it('applies defaults and converts PORT to a number', () => {
    const env = validateEnv({ DATABASE_URL: URL, PORT: '4000' });
    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
  });

  it('rejects an invalid PORT and NODE_ENV', () => {
    expect(() => validateEnv({ DATABASE_URL: URL, PORT: '70000' })).toThrow(/PORT/);
    expect(() => validateEnv({ DATABASE_URL: URL, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });
});
