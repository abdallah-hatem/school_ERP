'use server';

import type { LoginRequest, LoginResponse, SessionUser } from '@school-erp/shared';
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
  return apiFetch<SessionUser>('/auth/me', {
    cache: 'no-store',
    ignore401Redirect: true,
  });
}
