import { NextResponse, type NextRequest } from 'next/server';
import { safeNextPath } from '@/core/auth/paths';
import {
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  refreshTokens,
  sessionCookies,
} from '@/lib/middlewareFunctions';

/**
 * Fallback for a render whose API call got a 401 (the access token expired or was revoked after
 * the proxy let the request through): rotate the tokens and go back, or go to sign-in. The proxy
 * refreshes in place first, so this is rare.
 */
export async function GET(req: NextRequest) {
  const next = safeNextPath(req.nextUrl.searchParams.get('next')) ?? '/';
  const refresh = req.cookies.get(REFRESH_TOKEN_KEY)?.value;
  const tokens = refresh ? await refreshTokens(refresh) : null;

  if (!tokens) {
    // `/login` without a locale: the proxy prefixes the visitor's language.
    const res = NextResponse.redirect(new URL('/login', req.url));
    res.cookies.delete(ACCESS_TOKEN_KEY);
    res.cookies.delete(REFRESH_TOKEN_KEY);
    return res;
  }
  const res = NextResponse.redirect(new URL(next, req.url));
  sessionCookies(tokens).forEach((c) => res.cookies.set(c));
  return res;
}
