import type { NextRequest } from 'next/server';
import { manifestFor } from '@/core/pwa/manifest';
import { getSchoolBranding } from '@/core/settings/get-branding';
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE } from '@/shared/lib/i18n';

/**
 * `/manifest.webmanifest?lang=en|ar` — the installed app's manifest, from the school's name and
 * logo in settings (the public endpoint the shell uses). Never a hard-coded school. Not per user,
 * but it follows the settings, so the browser revalidates it instead of keeping an old name.
 */
export async function GET(req: NextRequest) {
  const asked = req.nextUrl.searchParams.get('lang') ?? req.cookies.get(LOCALE_COOKIE)?.value ?? '';
  const locale = isLocale(asked) ? asked : DEFAULT_LOCALE;
  const manifest = manifestFor(await getSchoolBranding(), locale);
  return new Response(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
}
