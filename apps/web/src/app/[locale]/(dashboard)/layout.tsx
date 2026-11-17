import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getSession, SessionProvider } from '@/core/auth';
import { safeNextPath, setPasswordPathFor } from '@/core/auth/paths';
import { AppShell } from '@/core/navigation/app-shell';
import { getSchoolBranding } from '@/core/settings/get-branding';
import { SchoolBrandingProvider, titleTemplateFor } from '@/core/settings';
import { DEFAULT_LOCALE, isLocale } from '@/shared/lib/i18n';

/** Tab titles read `"<page> · <school name>"` in the current language (product name as fallback). */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: titleTemplateFor(await getSchoolBranding(), locale) };
}

/**
 * Signed-in screens: sidebar / rail / drawer shell with the school's name and logo, and the
 * signed-in person and their permissions (read here, so the first paint already shows them and
 * only what they may use). Someone who signed in with a temporary password never sees a screen:
 * they are sent to "Set a new password" first (R9, spec P3) — the API refuses them anyway.
 */
export default async function DashboardLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const [{ locale: raw }, branding, user] = await Promise.all([params, getSchoolBranding(), getSession()]);
  if (user?.mustChangePassword) {
    const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
    redirect(setPasswordPathFor(locale, safeNextPath((await headers()).get('x-pathname'))));
  }
  return (
    <SchoolBrandingProvider initial={branding}>
      <SessionProvider user={user}>
        <AppShell user={user}>{children}</AppShell>
      </SessionProvider>
    </SchoolBrandingProvider>
  );
}
