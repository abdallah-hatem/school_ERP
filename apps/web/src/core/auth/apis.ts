'use server';

import type { ChangePasswordRequest, LoginRequest, LoginResponse, SessionUser } from '@school-erp/shared';
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

/**
 * `POST /account/password` — the signed-in user sets their own password: from My account (with the
 * current one) or on the forced "Set a new password" page after a temporary one (the new one only).
 */
export async function CHANGE_OWN_PASSWORD(data: ChangePasswordRequest) {
  const response = await apiFetch<Record<string, never>>('/account/password', {
    method: 'POST',
    body: { ...data },
  });
  return handleResponse({ response, showErrorToast: false });
}

export async function GET_ME() {
  return apiFetch<SessionUser>('/auth/me', {
    cache: 'no-store',
    ignore401Redirect: true,
  });
}
