import { LANG_COOKIE, LOGIN_PATH } from '@school-erp/shared';
import { NextResponse, type NextRequest } from 'next/server';
import {
  ACCESS_TOKEN_KEY,
  decodeJwtPayload,
  isAccessTokenLive,
  REFRESH_TOKEN_KEY,
  refreshTokens,
  sessionCookies,
  type TokenPair,
} from '@/lib/middlewareFunctions';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/shared/lib/i18n';
import { homeFor, loginPathFor } from './paths';

/** Pages a signed-in user never sees (they go home instead). */
const GUEST_ONLY = new Set([LOGIN_PATH]);

function preferredLocale(req: NextRequest): Locale {
  const fromCookie = req.cookies.get(LANG_COOKIE)?.value ?? '';
  return isLocale(fromCookie) ? fromCookie : DEFAULT_LOCALE;
}

function clearSession(res: NextResponse): NextResponse {
  res.cookies.delete(ACCESS_TOKEN_KEY);
  res.cookies.delete(REFRESH_TOKEN_KEY);
  return res;
}

function redirectTo(req: NextRequest, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, req.url));
}

/**
 * Routes every page request by session, before anything renders (building-frontends → Auth
 * routing):
 * - no locale in the path → the visitor's language (`lang` cookie, else Arabic);
 * - signed out on a protected page → the login page, keeping the path to come back to;
 * - signed in on a guest-only page (login) → the role's home;
 * - access token expired but refresh token valid → refreshed in place: the new access token is
 *   forwarded to this same request and both cookies are set on its response. No refresh URL
 *   ever shows in the address bar. Only a failed refresh lands on login.
 */
export async function authProxy(req: NextRequest): Promise<NextResponse> {
  const { pathname, search } = req.nextUrl;
  const [, first = '', ...rest] = pathname.split('/');

  if (!isLocale(first)) {
    return redirectTo(req, `/${preferredLocale(req)}${pathname === '/' ? '' : pathname}${search}`);
  }
  const locale = first;
  const page = `/${rest.join('/')}`.replace(/\/+$/, '') || '/';
  const guestOnly = GUEST_ONLY.has(page);

  let access = req.cookies.get(ACCESS_TOKEN_KEY)?.value;
  const refresh = req.cookies.get(REFRESH_TOKEN_KEY)?.value;
  let refreshed: TokenPair | null = null;

  if (!isAccessTokenLive(access) && refresh) {
    refreshed = await refreshTokens(refresh);
    access = refreshed?.access_token;
  }
  const signedIn = isAccessTokenLive(access);
  const staleSession = !signedIn && Boolean(refresh || req.cookies.get(ACCESS_TOKEN_KEY));

  if (!signedIn) {
    if (guestOnly) {
      const res = NextResponse.next();
      return staleSession ? clearSession(res) : res;
    }
    const res = redirectTo(req, loginPathFor(locale, `${pathname}${search}`));
    return staleSession ? clearSession(res) : res;
  }

  const role = decodeJwtPayload(access)?.role;
  const writes = refreshed ? sessionCookies(refreshed) : [];

  let res: NextResponse;
  if (guestOnly) {
    res = redirectTo(req, homeFor(typeof role === 'string' ? role : undefined, locale));
  } else {
    // Forward the fresh tokens to this request so the page's API calls use them right away.
    writes.forEach((c) => req.cookies.set(c.name, c.value));
    const headers = new Headers(req.headers);
    headers.set('x-pathname', `${pathname}${search}`);
    res = NextResponse.next({ request: { headers } });
  }
  writes.forEach((c) => res.cookies.set(c));
  return res;
}
