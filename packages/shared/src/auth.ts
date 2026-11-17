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

/** Shortest password an admin or a user may set (R9). */
export const PASSWORD_MIN_LENGTH = 10;

/**
 * Every signed-in user's home, relative to the locale (`/ar` + home): the dashboard, which shows
 * each person only what their permissions allow. Roles are data, so no role has a home of its own.
 */
export const HOME_PATH = '';

/** Path segment of the sign-in page under `/<locale>`. */
export const LOGIN_PATH = '/login';

/**
 * The forced "Set a new password" page under `/<locale>` (R9, spec P3): a user who signed in with a
 * temporary password is sent here and can't use the app until they choose their own.
 */
export const SET_PASSWORD_PATH = '/set-password';
