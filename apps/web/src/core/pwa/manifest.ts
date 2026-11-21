import { APP_THEME, appIconPath } from '@school-erp/shared';
import type { SchoolBranding } from '@/core/settings/branding';
import { dirFor, type Locale } from '@/shared/lib/i18n';

/** The installed app's manifest (W3C Web App Manifest), as `/manifest.webmanifest` serves it. */
export interface WebAppManifest {
  id: string;
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: 'standalone';
  background_color: string;
  theme_color: string;
  lang: Locale;
  dir: 'ltr' | 'rtl';
  icons: { src: string; sizes: string; type: 'image/png'; purpose: 'any' | 'maskable' }[];
}

/** The path the layout links: one manifest per language, so the installed app is named in it. */
export function manifestPath(locale: Locale): string {
  return `/manifest.webmanifest?lang=${locale}`;
}

/**
 * The manifest for the school (owner, 2026-11-21): its name in the language and its logo's icons
 * (drawn by the API, versioned by the logo — `appIconPath`), the generic icon without a logo. One
 * app (`id: '/'`) whatever the language; it opens on the home page of that language, inside the
 * whole app (`scope: '/'`), in its own window. Colours are the design tokens (`APP_THEME`).
 */
export function manifestFor(branding: SchoolBranding, locale: Locale): WebAppManifest {
  const name = locale === 'ar' ? branding.nameAr : branding.nameEn;
  return {
    id: '/',
    name,
    short_name: name,
    start_url: `/${locale}`,
    scope: '/',
    display: 'standalone',
    background_color: APP_THEME.backgroundColor,
    theme_color: APP_THEME.themeColor,
    lang: locale,
    dir: dirFor(locale),
    icons: [
      { src: appIconPath('icon-192.png', branding.logoUrl), sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: appIconPath('icon-512.png', branding.logoUrl), sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: appIconPath('maskable-512.png', branding.logoUrl), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
