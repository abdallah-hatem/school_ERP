'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from '@/lib/middlewareFunctions';
import { DEFAULT_LOCALE, isLocale } from '@/shared/lib/i18n';
import { LOGIN, LOGOUT } from './apis';
import { homeFor, loginPathFor, safeNextPath } from './paths';

export interface SignInState {
  /** The API's translated message (by the page's language); '' = failed with no message. */
  error: string | null;
  /** Kept so a failed attempt doesn't make the user type the email again. */
  email?: string;
}

/** The sign-in form's action: on success, back to `next` or the role's home. */
export async function signIn(_prev: SignInState, form: FormData): Promise<SignInState> {
  const rawLocale = String(form.get('locale') ?? '');
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const email = String(form.get('email') ?? '');
  const password = String(form.get('password') ?? '');

  const res = await LOGIN({ data: { email, password }, lang: locale });
  if (!res.success) {
    return {
      error: typeof res.message === 'string' ? res.message : '',
      email,
    };
  }
  const next = safeNextPath(String(form.get('next') ?? ''));
  redirect(next ?? homeFor(res.data?.user.role, locale));
}

/** Ends the session at the API and here, whatever the API answers, then shows sign-in. */
export async function signOut(locale: string): Promise<void> {
  await LOGOUT();
  const cookieStore = await cookies();
  cookieStore.delete(ACCESS_TOKEN_KEY);
  cookieStore.delete(REFRESH_TOKEN_KEY);
  redirect(loginPathFor(isLocale(locale) ? locale : DEFAULT_LOCALE));
}
