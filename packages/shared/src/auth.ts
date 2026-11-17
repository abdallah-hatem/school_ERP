import type { UserRole } from './enums';

/**
 * Session cookies (core/auth). The API sets them on login / refresh and clears them on logout;
 * the web app keeps them httpOnly and sends the access token back on every API call.
 */
export const AUTH_COOKIES = {
  access: 'auth_token',
  refresh: 'refresh_token',
} as const;

/** Language cookie the web app sets; the API reads `Accept-Language`. */
export const LANG_COOKIE = 'lang';

/**
 * Files under this prefix are readable without a session (the sign-in page shows the school
 * logo). Every other `/files/…` path needs one. Logo uploads must be stored under it.
 */
export const PUBLIC_FILES_PREFIX = '/files/logo/';
export const FILES_PREFIX = '/files/';

/** Seeded HR admin (§2: accounts come from the seed; no self sign-up). */
export const SEED_ADMIN_EMAIL = 'admin@school.local';

/** Each role's home page, relative to the locale (`/ar` + home). One role for the demo (§2). */
export const ROLE_HOME: Record<UserRole, string> = {
  HR_ADMIN: '',
};

/** Path segment of the sign-in page under `/<locale>`. */
export const LOGIN_PATH = '/login';
