import type { ReactNode } from 'react';
import { AppShell } from '@/core/navigation/app-shell';
import { getSchoolBranding } from '@/core/settings/get-branding';
import { SchoolBrandingProvider } from '@/core/settings';

/** Signed-in screens: sidebar / rail / drawer shell with the school's name and logo. */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const branding = await getSchoolBranding();
  return (
    <SchoolBrandingProvider initial={branding}>
      <AppShell>{children}</AppShell>
    </SchoolBrandingProvider>
  );
}
