import { LOGIN_PATH, ROLE_HOME, USER_ROLES, type UserRole } from '@school-erp/shared';
import type { Locale } from '@/shared/lib/i18n';

/** Every role has one home; every redirect that sends a user "home" goes through this. */
export function homeFor(role: string | undefined, locale: Locale): string {
  const known = (USER_ROLES as readonly string[]).includes(role ?? '');
  return `/${locale}${known ? ROLE_HOME[role as UserRole] : ''}`;
}

export function loginPathFor(locale: Locale, next?: string): string {
  const base = `/${locale}${LOGIN_PATH}`;
  return next ? `${base}?next=${encodeURIComponent(next)}` : base;
}

/**
 * A return path from `?next=` that is safe to redirect to: same-origin, absolute path, not the
 * login page itself. Anything else (`//evil.com`, `https://…`, `/\evil`) gives null.
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || next.length > 2048) return null;
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null;
  if (/[\u0000-\u001f]/.test(next)) return null;
  const pathname = next.split(/[?#]/)[0] ?? '';
  if (pathname.endsWith(LOGIN_PATH)) return null;
  return next;
}
