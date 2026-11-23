import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { hasLiveSession } from '@/core/auth/live-session';
import { NotFoundPage } from '@/core/navigation/not-found-page';
import { getSchoolBranding } from '@/core/settings/get-branding';
import { fontVariables } from '@/shared/lib/fonts';
import { DEFAULT_LOCALE, dirFor, getBaseMessages, getCommonMessages, isLocale, type Locale } from '@/shared/lib/i18n';
import { AppProviders } from '@/shared/providers/app-providers';
import './globals.css';

/** The language of the address when the proxy saw it (`x-pathname`), else the default (English). */
async function localeOfRequest(): Promise<Locale> {
  const first = ((await headers()).get('x-pathname') ?? '').split('/')[1] ?? '';
  return isLocale(first) ? first : DEFAULT_LOCALE;
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await localeOfRequest();
  const ui = getBaseMessages(locale).ui as { errorPages: { notFoundTitle: string } };
  return { title: `${ui.errorPages.notFoundTitle} · ${getCommonMessages(locale).app.name}` };
}

/**
 * An address outside every route the proxy doesn't see (an unknown `/api/…`); every other wrong
 * address gets `app/[locale]/not-found.tsx`. Next renders this without any layout, so it brings
 * its own document, styles, fonts and providers. Same screen as the locale one, but without the
 * nonce CSP (docs/ARCHITECTURE.md → Error pages, "The gap").
 */
export default async function GlobalNotFound() {
  const [locale, branding, signedIn] = await Promise.all([localeOfRequest(), getSchoolBranding(), hasLiveSession()]);
  return (
    <html lang={locale} dir={dirFor(locale)} className={fontVariables}>
      <body className="min-h-dvh antialiased">
        <AppProviders locale={locale} messages={getBaseMessages(locale)}>
          <NotFoundPage branding={branding} signedIn={signedIn} />
        </AppProviders>
      </body>
    </html>
  );
}
