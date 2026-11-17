'use server';

import type { AuthUser, LoginRequest, LoginResponse, SchoolSettings } from '@school-erp/shared';
import { apiFetch } from '@/lib/api';
import { handleResponse } from '@/lib/handleResponse';

/*
 * core/auth endpoints (contract: "Auth — core/auth"). The API sets and clears the session
 * cookies; `forwardAuthCookies` mirrors them onto this origin.
 */

export async function LOGIN({ data, lang }: { data: LoginRequest; lang: string }) {
  const res = await apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    body: { ...data },
    includeAuth: false,
    ignore401Redirect: true,
    forwardAuthCookies: true,
    headers: { 'Accept-Language': lang },
  });
  return handleResponse({ response: res, showErrorToast: false });
}

export async function LOGOUT() {
  const res = await apiFetch<Record<string, never>>('/auth/logout', {
    method: 'POST',
    forwardAuthCookies: true,
    ignore401Redirect: true,
  });
  return handleResponse({ response: res, showErrorToast: false });
}

export async function GET_ME() {
  return apiFetch<AuthUser>('/auth/me', {
    cache: 'no-store',
    ignore401Redirect: true,
  });
}

/** School name and logo for the sign-in page. Any failure (404, 401…) → the page's fallback. */
export async function GET_LOGIN_BRANDING() {
  return apiFetch<SchoolSettings>('/settings/school', {
    includeAuth: false,
    ignore401Redirect: true,
    cache: 'no-store',
  });
}
