import { appIconVersion } from '@school-erp/shared';
import type { NextRequest } from 'next/server';
import { GET_APP_ICON } from '@/core/pwa/apis';
import { offlineHtml } from '@/core/pwa/offline-page';
import { getSchoolBranding } from '@/core/settings/get-branding';
import { DEFAULT_LOCALE, isLocale } from '@/shared/lib/i18n';

/**
 * `/offline.html?lang=en|ar` — the branded offline page the service worker keeps and shows when a
 * page can't load (owner, 2026-11-21). The school's name and icon only: nothing personal, so it is
 * the one page the service worker may store.
 */
export async function GET(req: NextRequest) {
  const asked = req.nextUrl.searchParams.get('lang') ?? '';
  const locale = isLocale(asked) ? asked : DEFAULT_LOCALE;
  const branding = await getSchoolBranding();
  const icon = await GET_APP_ICON('icon-192.png', appIconVersion(branding.logoUrl));
  const iconDataUrl = icon.success && icon.data ? `data:image/png;base64,${icon.data.base64}` : null;
  const html = offlineHtml({
    locale,
    schoolName: locale === 'ar' ? branding.nameAr : branding.nameEn,
    iconDataUrl,
  });
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
  });
}
