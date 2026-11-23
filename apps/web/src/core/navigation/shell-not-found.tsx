'use client';

import { useSchoolBranding } from '@/core/settings';
import { NotFoundScreen } from '@/shared/components/errors/not-found-screen';
import { useTranslation } from '@/shared/providers/i18n-provider';

/** The in-shell not-found (`app/[locale]/(dashboard)/not-found.tsx`), centred in the page area. */
export function ShellNotFound() {
  const { locale } = useTranslation();
  const { branding } = useSchoolBranding();
  return (
    <div className="flex flex-1 flex-col justify-center py-6 max-md:min-h-[calc(100dvh-8rem)]">
      <NotFoundScreen variant="shell" signedIn siteName={locale === 'ar' ? branding.nameAr : branding.nameEn} />
    </div>
  );
}
