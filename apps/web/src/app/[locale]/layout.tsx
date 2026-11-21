import { APP_THEME, appIconPath } from '@school-erp/shared';
import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { manifestPath } from '@/core/pwa/manifest';
import { ServiceWorkerRegistrar } from '@/core/pwa/components/service-worker';
import { getSchoolBranding } from '@/core/settings/get-branding';
import { fontVariables } from '@/shared/lib/fonts';
import { dirFor, getBaseMessages, getCommonMessages, isLocale, LOCALES } from '@/shared/lib/i18n';
import { AppProviders } from '@/shared/providers/app-providers';
import '../globals.css';

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

/** The browser's toolbar and the installed app's title bar: the brand teal (light theme only). */
export const viewport: Viewport = { themeColor: APP_THEME.themeColor };

/**
 * Every page: the product name as the fallback title, and the installable app (owner, 2026-11-21)
 * — the manifest in the page's language, the school's icons (drawn from its logo by the API,
 * versioned by it), and the iOS Home Screen tags (its title is the school's name).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const branding = await getSchoolBranding();
  const school = locale === 'ar' ? branding.nameAr : branding.nameEn;
  return {
    title: getCommonMessages(locale).app.name,
    manifest: manifestPath(locale),
    icons: {
      icon: [{ url: appIconPath('favicon-32.png', branding.logoUrl), sizes: '32x32', type: 'image/png' }],
      apple: [{ url: appIconPath('apple-touch-icon.png', branding.logoUrl), sizes: '180x180' }],
    },
    appleWebApp: { capable: true, title: school, statusBarStyle: 'default' },
    // Next writes `mobile-web-app-capable`; older iOS reads only the Apple name.
    other: { 'apple-mobile-web-app-capable': 'yes' },
  };
}

/** Root layout: sets `lang` and `dir` from the locale segment (en | ar), fonts and providers. */
export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return (
    <html lang={locale} dir={dirFor(locale)} className={fontVariables}>
      <body className="min-h-dvh antialiased">
        <AppProviders locale={locale} messages={getBaseMessages(locale)}>
          {children}
        </AppProviders>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
