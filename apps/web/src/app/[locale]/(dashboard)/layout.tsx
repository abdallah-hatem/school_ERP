import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '@/core/navigation/app-shell';
import { getSchoolBranding } from '@/core/settings/get-branding';
import { SchoolBrandingProvider, titleTemplateFor } from '@/core/settings';
import { isLocale } from '@/shared/lib/i18n';

/** Tab titles read `"<page> · <school name>"` in the current language (product name as fallback). */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: titleTemplateFor(await getSchoolBranding(), locale) };
}

/** Signed-in screens: sidebar / rail / drawer shell with the school's name and logo. */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const branding = await getSchoolBranding();
  return (
    <SchoolBrandingProvider initial={branding}>
      <AppShell>{children}</AppShell>
    </SchoolBrandingProvider>
  );
}
