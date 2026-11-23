import { cookies } from 'next/headers';
import { ACCESS_TOKEN_KEY, isAccessTokenLive } from '@/lib/middlewareFunctions';

/**
 * Whether the request carries a live session, by the proxy's own test (an unexpired access token;
 * the proxy has already refreshed an expired one in place and forwarded it to the render). No API
 * call. Used only to pick the way out a public screen offers — the 404's "Back to the dashboard"
 * or "Sign in" — never what it shows. Server only, so it is not exported from `core/auth`'s index
 * (client components import that).
 */
export async function hasLiveSession(): Promise<boolean> {
  const jar = await cookies();
  return isAccessTokenLive(jar.get(ACCESS_TOKEN_KEY)?.value);
}
