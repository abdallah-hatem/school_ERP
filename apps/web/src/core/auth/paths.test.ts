import { describe, expect, it } from 'vitest';
import { tokenPairFromSetCookies } from '@/lib/middlewareFunctions';
import { homeFor, loginPathFor, safeNextPath } from './paths';

describe('safeNextPath (after login → the kept return path)', () => {
  it.each(['/ar', '/en/employees', '/ar/payroll?month=2026-11#line-3'])('keeps %s', (p) => {
    expect(safeNextPath(p)).toBe(p);
  });

  it.each([
    'https://evil.example',
    '//evil.example/ar',
    '/\\evil.example',
    'ar/employees',
    '/ar/login',
    '/en/login?next=/ar',
    '/ar\u0000x',
    '',
    null,
    undefined,
  ])('rejects %j (open redirect or a loop)', (p) => {
    expect(safeNextPath(p)).toBeNull();
  });
});

describe('homeFor / loginPathFor', () => {
  it('sends the HR admin to the dashboard of their language', () => {
    expect(homeFor('HR_ADMIN', 'ar')).toBe('/ar');
    expect(homeFor('HR_ADMIN', 'en')).toBe('/en');
  });

  it('an unknown role still lands on a page that exists', () => {
    expect(homeFor('SOMETHING_ELSE', 'en')).toBe('/en');
  });

  it('keeps the return path encoded', () => {
    expect(loginPathFor('ar', '/ar/payroll?month=2026-11')).toBe(
      '/ar/login?next=%2Far%2Fpayroll%3Fmonth%3D2026-11',
    );
  });
});

describe('tokenPairFromSetCookies', () => {
  it('reads the API session cookies and their lifetimes', () => {
    expect(
      tokenPairFromSetCookies([
        'auth_token=a.b.c; Max-Age=900; Path=/; HttpOnly',
        'refresh_token=r1; Max-Age=1209600; Path=/auth; HttpOnly',
        'other=x',
      ]),
    ).toEqual({
      access_token: 'a.b.c',
      refresh_token: 'r1',
      accessMaxAge: 900,
      refreshMaxAge: 1209600,
    });
  });

  it('is null when the API cleared or did not send the access cookie', () => {
    expect(
      tokenPairFromSetCookies(['auth_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT']),
    ).toBeNull();
    expect(tokenPairFromSetCookies([])).toBeNull();
  });
});
