import { AUTH_COOKIES } from '@school-erp/shared';

/**
 * Session-cookie plumbing shared by `apiFetch` (Server Actions), the proxy (`src/proxy.ts`) and
 * the `/api/auth/refresh` route. Server only.
 *
 * The API sets the session as httpOnly cookies on its own responses (login, refresh, logout).
 * The browser never talks to the API directly, so the web server reads those `Set-Cookie`
 * headers and re-issues the same cookies on its own origin.
 */

export const ACCESS_TOKEN_KEY = process.env.NEXT_PUBLIC_AUTH_TOKEN_KEY || AUTH_COOKIES.access;
export const REFRESH_TOKEN_KEY = process.env.NEXT_PUBLIC_REFRESH_TOKEN_KEY || AUTH_COOKIES.refresh;

/** Defaults when the API's cookie carries no Max-Age: 15 minutes / 14 days. */
const DEFAULT_ACCESS_MAX_AGE = 60 * 15;
const DEFAULT_REFRESH_MAX_AGE = 60 * 60 * 24 * 14;

export interface TokenPair {
  access_token: string;
  refresh_token?: string;
  /** Seconds. */
  accessMaxAge: number;
  refreshMaxAge: number;
}

export interface CookieWrite {
  name: string;
  value: string;
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
}

/** One place for the session cookies' attributes. */
export function authCookie(name: string, value: string, maxAge: number): CookieWrite {
  return {
    name,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  };
}

/** The cookies to write for a token pair (the refresh one only when rotated). */
export function sessionCookies(tokens: TokenPair): CookieWrite[] {
  const out = [authCookie(ACCESS_TOKEN_KEY, tokens.access_token, tokens.accessMaxAge)];
  if (tokens.refresh_token) {
    out.push(authCookie(REFRESH_TOKEN_KEY, tokens.refresh_token, tokens.refreshMaxAge));
  }
  return out;
}

interface ParsedCookie {
  value: string;
  maxAge?: number;
}

/** The API's auth cookies from `Set-Cookie` headers. An empty value means "cleared". */
export function parseAuthSetCookies(setCookies: string[]): {
  access?: ParsedCookie;
  refresh?: ParsedCookie;
} {
  const out: { access?: ParsedCookie; refresh?: ParsedCookie } = {};
  for (const header of setCookies) {
    const [pair = '', ...attrs] = header.split(';');
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    let value = pair.slice(eq + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      // keep raw
    }
    const maxAgeAttr = attrs.map((a) => a.trim()).find((a) => /^max-age=/i.test(a));
    const maxAge = maxAgeAttr ? Number(maxAgeAttr.split('=')[1]) : undefined;
    const parsed = {
      value,
      maxAge: Number.isFinite(maxAge) ? maxAge : undefined,
    };
    if (name === AUTH_COOKIES.access) out.access = parsed;
    if (name === AUTH_COOKIES.refresh) out.refresh = parsed;
  }
  return out;
}

/** A token pair from the API's `Set-Cookie` headers, or null when there is no access token. */
export function tokenPairFromSetCookies(setCookies: string[]): TokenPair | null {
  const { access, refresh } = parseAuthSetCookies(setCookies);
  if (!access?.value) return null;
  return {
    access_token: access.value,
    refresh_token: refresh?.value || undefined,
    accessMaxAge: access.maxAge ?? DEFAULT_ACCESS_MAX_AGE,
    refreshMaxAge: refresh?.maxAge ?? DEFAULT_REFRESH_MAX_AGE,
  };
}

/** Rotates the refresh token at the API. Null when it is missing, expired, revoked or reused. */
export async function refreshTokens(refreshToken: string): Promise<TokenPair | null> {
  const baseURL = process.env.BASE_URL;
  if (!baseURL) return null;
  try {
    const res = await fetch(`${baseURL}/auth/refresh`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${refreshToken}`,
      },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return tokenPairFromSetCookies(res.headers.getSetCookie());
  } catch {
    return null;
  }
}

/**
 * The payload of a JWT, without verifying it. For routing only (is there a live session, which
 * role's home) — the API verifies the token on every call.
 */
export function decodeJwtPayload(token: string | undefined): Record<string, unknown> | null {
  const part = token?.split('.')[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '='));
    const payload: unknown = JSON.parse(json);
    return typeof payload === 'object' && payload !== null
      ? (payload as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** True when the access token exists and is not expired (with a few seconds' margin). */
export function isAccessTokenLive(token: string | undefined, nowMs = Date.now()): boolean {
  const exp = decodeJwtPayload(token)?.exp;
  return typeof exp === 'number' && exp * 1000 > nowMs + 5_000;
}
