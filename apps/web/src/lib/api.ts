'use server';

import { revalidateTag } from 'next/cache';
import { cookies, headers as nextHeaders } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  ACCESS_TOKEN_KEY,
  parseAuthSetCookies,
  REFRESH_TOKEN_KEY,
  refreshTokens,
  sessionCookies,
  authCookie,
} from '@/lib/middlewareFunctions';
import type { ApiResult, DownloadedFile } from '@/lib/types';
import { LOCALE_COOKIE, requestLocale } from '@/shared/lib/i18n';

/*
 * The transport layer (building-frontends → fetch-wrapper). Server only. Endpoints live in
 * `src/modules/<name>/apis.ts` ("use server"), one SCREAMING_CASE function per route, each calling
 * apiFetch then handleResponse. Nothing else calls fetch() against the API.
 */

// Retry read-only requests on transient network failures. Off by default.
const API_RETRY_ENABLED = process.env.ENABLE_API_RETRY === 'true';
const API_RETRY_ATTEMPTS = 3;

type ApiFetchOptions = Omit<RequestInit, 'body'> & {
  body?: BodyInit | Record<string, unknown> | unknown[] | null;
  includeAuth?: boolean;
  /** When true, use the refresh token (not the access token) as the bearer. */
  useRefreshToken?: boolean;
  params?: Record<string, string | string[] | undefined>;
  revalidateTags?: string[];
  ignore401Redirect?: boolean;
  /**
   * Copy the session cookies the API sets (login) or clears (logout) onto this app's origin.
   * Server Actions and Route Handlers only — a render can't write cookies.
   */
  forwardAuthCookies?: boolean;
  /**
   * `file`: a successful response is a download (xlsx…), returned as `data: DownloadedFile`.
   * Errors still parse as the JSON envelope.
   */
  responseType?: 'json' | 'file';
  /** Internal: prevents recursion when the refresh attempt itself returns 401. */
  _skipRefresh?: boolean;
};

interface UnauthorizedSignal {
  unauthorized: true;
  redirect: string;
  message: string;
}

function isUnauthorizedSignal(err: unknown): err is UnauthorizedSignal {
  return (
    typeof err === 'object' && err !== null && (err as UnauthorizedSignal).unauthorized === true
  );
}

function isNextControlFlow(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return (
    typeof digest === 'string' &&
    (digest.startsWith('NEXT_REDIRECT') || digest.startsWith('NEXT_NOT_FOUND'))
  );
}

function normalizeHeaders(h?: HeadersInit): Record<string, string> {
  if (!h) return {};
  if (h instanceof Headers) return Object.fromEntries(h.entries());
  if (Array.isArray(h)) return Object.fromEntries(h);
  return h;
}

function isPlainObject(obj: unknown): obj is Record<string, unknown> | unknown[] {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    !(obj instanceof FormData) &&
    !(obj instanceof ArrayBuffer) &&
    !(obj instanceof Blob) &&
    !(obj instanceof URLSearchParams)
  );
}

export async function apiFetch<T = unknown>(
  url: string,
  options: ApiFetchOptions = {},
): Promise<ApiResult<T>> {
  const baseURL = process.env.BASE_URL ?? '';

  let fullUrl = baseURL + url;
  if (options.params) {
    const query = new URLSearchParams(
      Object.entries(options.params).reduce<Record<string, string>>((acc, [key, value]) => {
        if (value !== undefined) acc[key] = Array.isArray(value) ? value.join(',') : value;
        return acc;
      }, {}),
    ).toString();
    if (query) fullUrl += (url.includes('?') ? '&' : '?') + query;
  }

  const includeAuth = options.includeAuth !== false;
  const isFormData = options.body instanceof FormData;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...normalizeHeaders(options.headers),
  };
  if (!isFormData) headers['Content-Type'] = 'application/json';

  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_KEY)?.value;
  const refreshToken = cookieStore.get(REFRESH_TOKEN_KEY)?.value;
  // The page's own language, not the cookie: every toast and error matches the screen.
  const requestHeaders = await nextHeaders();
  const lang = requestLocale({
    pathname: requestHeaders.get('x-pathname'),
    referer: requestHeaders.get('referer'),
    cookie: cookieStore.get(LOCALE_COOKIE)?.value,
  });

  if (options.useRefreshToken) {
    if (refreshToken) headers.Authorization = `Bearer ${refreshToken}`;
  } else if (includeAuth && accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  if (!headers['Accept-Language']) headers['Accept-Language'] = lang;

  const body: BodyInit | null | undefined = isPlainObject(options.body)
    ? JSON.stringify(options.body)
    : (options.body as BodyInit | null | undefined);

  return executeRequest<T>(fullUrl, options, headers, body);
}

/**
 * `fetch` with a small retry for transient network failures (stale keep-alive sockets etc.).
 * Only idempotent verbs are retried, so a POST can't double-submit.
 */
async function fetchWithRetry(url: string, init: RequestInit, attempts: number): Promise<Response> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      lastErr = err;
      if (i < attempts) await new Promise((r) => setTimeout(r, 150 * i));
    }
  }
  throw lastErr;
}

async function executeRequest<T>(
  fullUrl: string,
  options: ApiFetchOptions,
  headers: Record<string, string>,
  body: BodyInit | null | undefined,
): Promise<ApiResult<T>> {
  try {
    const method = (options.method || 'GET').toUpperCase();
    const isIdempotent = ['GET', 'HEAD', 'OPTIONS'].includes(method);
    const attempts = API_RETRY_ENABLED && isIdempotent ? API_RETRY_ATTEMPTS : 1;
    const res = await fetchWithRetry(fullUrl, { ...options, headers, body }, attempts);

    options.revalidateTags?.forEach((tag) => revalidateTag(tag, 'default'));
    if (options.forwardAuthCookies) await forwardAuthCookies(res);

    if (
      res.status === 401 &&
      !options.ignore401Redirect &&
      !options._skipRefresh &&
      !options.useRefreshToken
    ) {
      const hdrs = await nextHeaders();
      // Only a Server Action (`next-action` header) may write cookies: refresh inline and retry
      // once. A render hands off to /api/auth/refresh, which redirects back (T2).
      const isServerAction = !!hdrs.get('next-action');

      if (isServerAction) {
        const cookieStore = await cookies();
        try {
          const refreshToken = cookieStore.get(REFRESH_TOKEN_KEY)?.value;
          const tokens = refreshToken ? await refreshTokens(refreshToken) : null;
          if (tokens) {
            sessionCookies(tokens).forEach((c) => cookieStore.set(c));
            return executeRequest<T>(
              fullUrl,
              { ...options, _skipRefresh: true },
              { ...headers, Authorization: `Bearer ${tokens.access_token}` },
              body,
            );
          }
        } catch {
          // Inline refresh failed unexpectedly — fall through to logout.
        }
        cookieStore.delete(ACCESS_TOKEN_KEY);
        cookieStore.delete(REFRESH_TOKEN_KEY);
      } else {
        const pathname = hdrs.get('x-pathname') || '/';
        redirect(`/api/auth/refresh?next=${encodeURIComponent(pathname)}`);
      }

      // Runs where t() is unavailable — the one deliberate hardcoded EN/AR pair (skill note).
      const fallbackMessage =
        headers['Accept-Language'] === 'en'
          ? 'Your session has expired, please log in again'
          : 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مرة أخرى';
      let beMessage = '';
      try {
        const errBody = (await res.clone().json()) as { message?: unknown };
        beMessage = typeof errBody?.message === 'string' ? errBody.message : '';
      } catch {
        // ignore
      }
      const signal: UnauthorizedSignal = {
        unauthorized: true,
        redirect: '/login',
        message: beMessage || fallbackMessage,
      };
      throw signal;
    }

    if (options.responseType === 'file' && res.ok) return (await parseFile(res)) as ApiResult<T>;
    return await parseResponse<T>(res);
  } catch (err: unknown) {
    if (isUnauthorizedSignal(err)) {
      return {
        unauthorized: true,
        redirect: err.redirect,
        message: err.message,
      };
    }
    if (isNextControlFlow(err)) throw err;
    const message = err instanceof Error ? err.message : 'Network error';
    console.error('[apiFetch] network error:', message);
    return {
      success: false,
      status: 0,
      message,
      data: null,
      networkError: true,
    };
  }
}

/** Mirrors the API's session cookies onto this origin (set when present, delete when cleared). */
async function forwardAuthCookies(res: Response): Promise<void> {
  const { access, refresh } = parseAuthSetCookies(res.headers.getSetCookie());
  const cookieStore = await cookies();
  for (const [name, cookie] of [
    [ACCESS_TOKEN_KEY, access],
    [REFRESH_TOKEN_KEY, refresh],
  ] as const) {
    if (!cookie) continue;
    if (!cookie.value || cookie.maxAge === 0) cookieStore.delete(name);
    else cookieStore.set(authCookie(name, cookie.value, cookie.maxAge ?? 60 * 15));
  }
}

/** A file the API sent; the name comes from Content-Disposition. */
async function parseFile(res: Response): Promise<ApiResult<DownloadedFile>> {
  const disposition = res.headers.get('content-disposition') ?? '';
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  const data: DownloadedFile = {
    fileName: match?.[1] ? decodeURIComponent(match[1]) : 'download',
    contentType: res.headers.get('content-type') ?? 'application/octet-stream',
    base64: Buffer.from(await res.arrayBuffer()).toString('base64'),
  };
  return { success: true, status: res.status, data };
}

async function parseResponse<T>(res: Response): Promise<ApiResult<T>> {
  const contentType = res.headers.get('content-type');
  // A lying content-type shouldn't reject the whole request.
  const body: unknown = contentType?.includes('json')
    ? await res.json().catch(() => null)
    : await res.text();

  // Only a PLAIN OBJECT merges into the result; strings and arrays ride under `data`.
  const merge: Record<string, unknown> =
    typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : { data: body };

  // Envelope fields LAST: a resource's own `status` must not overwrite the HTTP status.
  if (!res.ok) {
    return {
      ...merge,
      success: false,
      status: res.status,
      message: typeof merge.message === 'string' ? merge.message : 'An error occurred',
      errors: merge.errors,
    };
  }
  return { ...merge, success: true, status: res.status } as ApiResult<T>;
}
