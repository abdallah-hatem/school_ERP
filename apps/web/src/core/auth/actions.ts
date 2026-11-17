'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from '@/lib/middlewareFunctions';
import { DEFAULT_LOCALE, isLocale } from '@/shared/lib/i18n';
import { LOGIN, LOGOUT } from './apis';
import { homeFor, loginPathFor, safeNextPath } from './paths';

export interface SignInInput {
  email: string;
  password: string;
  locale: string;
  next?: string;
}

export interface SignInResult {
  /** The API's message, translated by the page's language ('' when it sent none). */
  error: string;
}

/**
 * Signs in at the API (which sets the session cookies, mirrored onto this origin), then goes back
 * to `next` or the role's home. Returns only on failure.
 */
export async function signIn(input: SignInInput): Promise<SignInResult> {
  const locale = isLocale(input.locale) ? input.locale : DEFAULT_LOCALE;
  const res = await LOGIN({
    data: { email: input.email, password: input.password },
    lang: locale,
  });
  if (!res.success) {
    return { error: typeof res.message === 'string' ? res.message : '' };
  }
  redirect(safeNextPath(input.next) ?? homeFor(res.data?.user.role, locale));
}

/**
 * The same sign-in for a form posted before the page's scripts run (no JS yet): the password goes
 * in a POST body, never the URL. On failure it reloads the sign-in page, keeping `next`.
 */
export async function signInWithForm(form: FormData): Promise<void> {
  const rawLocale = String(form.get('locale') ?? '');
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const next = safeNextPath(String(form.get('next') ?? '')) ?? undefined;
  await signIn({
    email: String(form.get('email') ?? ''),
    password: String(form.get('password') ?? ''),
    locale,
    next,
  });
  redirect(loginPathFor(locale, next));
}

/** Ends the session at the API and here, whatever the API answers, then shows sign-in. */
export async function signOut(locale: string): Promise<void> {
  await LOGOUT();
  const cookieStore = await cookies();
  cookieStore.delete(ACCESS_TOKEN_KEY);
  cookieStore.delete(REFRESH_TOKEN_KEY);
  redirect(loginPathFor(isLocale(locale) ? locale : DEFAULT_LOCALE));
}
