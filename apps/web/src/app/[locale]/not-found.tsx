import { hasLiveSession } from '@/core/auth/live-session';
import { NotFoundPage } from '@/core/navigation/not-found-page';
import { getSchoolBranding } from '@/core/settings/get-branding';

/**
 * A wrong address under `/<locale>/…` (the catch-all `[...missing]` sends every unmatched path
 * here), outside the shell, in the address's language, with a real 404 status. The proxy lets a
 * signed-out visitor reach it for an unknown section instead of sending them to sign in
 * (`core/auth/routes.ts`).
 */
export default async function LocaleNotFound() {
  const [branding, signedIn] = await Promise.all([getSchoolBranding(), hasLiveSession()]);
  return <NotFoundPage branding={branding} signedIn={signedIn} />;
}
