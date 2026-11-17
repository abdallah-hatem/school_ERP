import { HOME_PATH, LOGIN_PATH, SET_PASSWORD_PATH } from '@school-erp/shared';
import type { Locale } from '@/shared/lib/i18n';

/**
 * Every signed-in user's home: the dashboard, which shows each person only what their permissions
 * allow (roles are data, so no role has a home of its own). Every redirect "home" goes through this.
 */
export function homeFor(locale: Locale): string {
  return `/${locale}${HOME_PATH}`;
}

export function loginPathFor(locale: Locale, next?: string): string {
  const base = `/${locale}${LOGIN_PATH}`;
  return next ? `${base}?next=${encodeURIComponent(next)}` : base;
}

/**
 * The forced "Set a new password" page (R9, spec P3), keeping where the user was going so they
 * land there once they have chosen their own password.
 */
export function setPasswordPathFor(locale: Locale, next?: string | null): string {
  const base = `/${locale}${SET_PASSWORD_PATH}`;
  return next ? `${base}?next=${encodeURIComponent(next)}` : base;
}

/**
 * A return path from `?next=` that is safe to redirect to: same-origin, absolute path, not the
 * login or set-password page itself. Anything else (`//evil.com`, `https://…`, `/\evil`) gives null.
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || next.length > 2048) return null;
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null;
  if (/[\u0000-\u001f]/.test(next)) return null;
  const pathname = next.split(/[?#]/)[0] ?? '';
  if (pathname.endsWith(LOGIN_PATH) || pathname.endsWith(SET_PASSWORD_PATH)) return null;
  return next;
}
