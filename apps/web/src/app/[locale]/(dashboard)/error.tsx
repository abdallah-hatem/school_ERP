'use client';

import { useSchoolBranding } from '@/core/settings';
import { RouteError } from '@/shared/components/layout/route-error';
import { useTranslation } from '@/shared/providers/i18n-provider';

/**
 * Every dashboard page's error screen, inside the shell (one boundary for all sections — the
 * sidebar and top bar stay). Shows Next's digest as the reference code (docs/ARCHITECTURE.md →
 * Error pages).
 */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { locale } = useTranslation();
  const { branding } = useSchoolBranding();
  return <RouteError error={error} reset={reset} siteName={locale === 'ar' ? branding.nameAr : branding.nameEn} />;
}
