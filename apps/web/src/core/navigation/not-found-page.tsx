'use client';

import { SchoolBrandingProvider, type SchoolBranding } from '@/core/settings';
import { SchoolBrand } from '@/core/settings/school-brand';
import styles from '@/shared/components/errors/error-art.module.css';
import { NotFoundScreen } from '@/shared/components/errors/not-found-screen';
import { LocaleSwitch } from '@/shared/components/layout/locale-switch';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';

/**
 * A wrong address, outside the shell, signed in or not (`app/[locale]/not-found.tsx`, reached
 * through `[...missing]`): the school's name and the language switch on top, the "404" and the way
 * out in the middle (option 2 of design/mockups/error-pages.html).
 */
export function NotFoundPage({ branding, signedIn }: { branding: SchoolBranding; signedIn: boolean }) {
  const { locale } = useTranslation();
  return (
    <SchoolBrandingProvider initial={branding}>
      <main className={cn('flex min-h-dvh flex-col', styles.glow)}>
        <div className="flex items-center justify-between gap-3 p-4 sm:px-10 sm:py-6">
          <SchoolBrand />
          <LocaleSwitch />
        </div>
        <div className="flex flex-1 flex-col justify-center px-4 pt-2 pb-6 sm:pb-10">
          <NotFoundScreen
            variant="page"
            signedIn={signedIn}
            siteName={locale === 'ar' ? branding.nameAr : branding.nameEn}
          />
        </div>
      </main>
    </SchoolBrandingProvider>
  );
}
