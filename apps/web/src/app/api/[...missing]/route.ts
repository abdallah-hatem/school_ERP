import { ErrorCode } from '@school-erp/shared';
import { NextResponse } from 'next/server';

/**
 * `/api/…` is the web app's own route handlers (`/api/auth/refresh`), never pages. An unknown one
 * answers a JSON 404 in the API's envelope — not an HTML page. Without this, the path fell to the
 * `[locale]` root layout (locale "api" → `notFound()`), which only Next's default 404 can render
 * (docs/ARCHITECTURE.md → Error pages).
 */
function missing(): NextResponse {
  return NextResponse.json(
    { success: false, error: ErrorCode.NOT_FOUND },
    { status: 404, headers: { 'Cache-Control': 'private, no-store' } },
  );
}

export const GET = missing;
export const HEAD = missing;
export const POST = missing;
export const PUT = missing;
export const PATCH = missing;
export const DELETE = missing;
export const OPTIONS = missing;
