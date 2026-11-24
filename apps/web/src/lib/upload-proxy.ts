import { ErrorCode } from '@school-erp/shared';
import { NextResponse, type NextRequest } from 'next/server';
import {
  ACCESS_TOKEN_KEY,
  isAccessTokenLive,
  REFRESH_TOKEN_KEY,
  refreshTokens,
  sessionCookies,
  type CookieWrite,
} from '@/lib/middlewareFunctions';
import { expireTags } from '@/lib/revalidate';
import { clientAddressHeaders } from '@/lib/security-headers';
import { LOCALE_COOKIE, requestLocale } from '@/shared/lib/i18n';

/*
 * Large uploads (a contract's signed copy, its letters) go through a Route Handler, not a Server
 * Action (docs/ARCHITECTURE.md → Security → Uploads). Server Actions keep a small body limit for
 * every action — the sign-in one included — so a large body can't be pushed at the app before
 * sign-in. Here the size is capped per upload, a session is required before the body is read, and
 * the body is streamed to the API (never buffered whole); the API checks the session, the
 * permission and the file again.
 */

/** Room for the multipart envelope (boundaries, headers, the file name) around the file itself. */
const ENVELOPE_BYTES = 64 * 1024;

function refusal(status: number, error: string, message: string): NextResponse {
  return NextResponse.json({ success: false, error, message }, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

/** The host of an `Origin` header, or null (missing, `null`, malformed). */
function hostOf(origin: string | null): string | null {
  try {
    return origin ? new URL(origin).host : null;
  } catch {
    return null;
  }
}

/** A copy of `body` that errors once more than `limit` bytes have passed (a lying Content-Length). */
function capped(body: ReadableStream<Uint8Array>, limit: number): ReadableStream<Uint8Array> {
  let seen = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > limit) controller.error(new Error('upload: body over its limit'));
        else controller.enqueue(chunk);
      },
    }),
  );
}

/**
 * Forwards the multipart upload in `req` to the API's `apiPath` (POST). Refuses before reading the
 * body: no session → 401; not multipart → 400; no length or more than `maxBytes` (+ the envelope)
 * → 413 `FILE_TOO_LARGE`. An access token about to expire is refreshed first (the stream can't be
 * sent twice). The API's answer comes back as is; a success expires `tags`.
 */
export async function proxyUpload(
  req: NextRequest,
  { apiPath, maxBytes, tags }: { apiPath: string; maxBytes: number; tags: readonly string[] },
): Promise<NextResponse> {
  const baseURL = process.env.BASE_URL;
  if (!baseURL) return refusal(503, ErrorCode.INTERNAL_ERROR, 'The API is not configured.');
  // Same-origin only, like Server Actions: another site's page can't post a file in the user's name.
  const origin = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (!host || hostOf(origin) !== host) {
    return refusal(403, ErrorCode.FORBIDDEN, 'Uploads come from this app only.');
  }

  let access = req.cookies.get(ACCESS_TOKEN_KEY)?.value;
  let renewed: CookieWrite[] = [];
  if (!isAccessTokenLive(access)) {
    const refresh = req.cookies.get(REFRESH_TOKEN_KEY)?.value;
    const tokens = refresh ? await refreshTokens(refresh, clientAddressHeaders(req.headers)) : null;
    if (!tokens) return refusal(401, ErrorCode.UNAUTHORIZED, 'Your session has expired, please log in again');
    access = tokens.access_token;
    renewed = sessionCookies(tokens);
  }

  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.startsWith('multipart/form-data') || !req.body) {
    return refusal(400, ErrorCode.BAD_REQUEST, 'Send the file as multipart/form-data.');
  }
  const limit = maxBytes + ENVELOPE_BYTES;
  const length = Number(req.headers.get('content-length'));
  if (!Number.isFinite(length) || length <= 0 || length > limit) {
    return refusal(413, ErrorCode.FILE_TOO_LARGE, 'The file is too large.');
  }

  const lang = requestLocale({ referer: req.headers.get('referer'), cookie: req.cookies.get(LOCALE_COOKIE)?.value });
  let res: Response;
  try {
    res = await fetch(`${baseURL}${apiPath}`, {
      method: 'POST',
      headers: {
        ...clientAddressHeaders(req.headers),
        Accept: 'application/json',
        'Accept-Language': lang,
        'Content-Type': contentType,
        Authorization: `Bearer ${access}`,
      },
      body: capped(req.body, limit),
      // A streamed request body (Node's fetch needs it said).
      duplex: 'half',
      cache: 'no-store',
    } as RequestInit & { duplex: 'half' });
  } catch {
    return refusal(502, ErrorCode.INTERNAL_ERROR, 'The file could not be sent. Try again.');
  }

  const body: unknown = await res.json().catch(() => null);
  if (res.ok) expireTags(tags, false);
  const out = NextResponse.json(body ?? { success: res.ok }, {
    status: res.status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
  renewed.forEach((c) => out.cookies.set(c));
  return out;
}
