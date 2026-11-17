import { bearerToken, parseCookieHeader } from './cookies.util';

describe('parseCookieHeader', () => {
  it('splits name=value pairs and decodes values', () => {
    expect(parseCookieHeader('a=1; b=x%20y;c=')).toEqual({ a: '1', b: 'x y', c: '' });
  });

  it('keeps the first of duplicate names and skips junk', () => {
    expect(parseCookieHeader('a=1; a=2; junk; =x')).toEqual({ a: '1' });
  });

  it('returns {} without a header', () => {
    expect(parseCookieHeader(undefined)).toEqual({});
  });
});

describe('bearerToken', () => {
  it('reads a bearer token, case-insensitively', () => {
    expect(bearerToken('Bearer abc.def')).toBe('abc.def');
    expect(bearerToken('bearer abc')).toBe('abc');
  });

  it('ignores other schemes and empty values', () => {
    expect(bearerToken('Basic abc')).toBeUndefined();
    expect(bearerToken('Bearer ')).toBeUndefined();
    expect(bearerToken(undefined)).toBeUndefined();
  });
});
