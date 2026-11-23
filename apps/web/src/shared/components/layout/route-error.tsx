'use client';

import { HOME_PATH } from '@school-erp/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { ErrorArt } from '@/shared/components/errors/error-art';
import { ReferenceCode } from '@/shared/components/errors/reference-code';
import { StatusScreen } from '@/shared/components/errors/status-screen';
import { Button } from '@/shared/components/ui/button';
import { HomeIcon, RetryIcon } from '@/shared/components/ui/icons';
import { useErrorReference } from '@/shared/lib/error-reference';
import { useTranslation } from '@/shared/providers/i18n-provider';

/**
 * Every dashboard page's error screen (`app/[locale]/(dashboard)/error.tsx`) and the sign-in
 * pages' (`(auth)/error.tsx`): option 2 of design/mockups/error-pages.html — the calm "!" art,
 * "Something went wrong", Try again (refetches the server render, then resets the boundary), Back
 * to the dashboard, and the reference code. Never a blank screen, never the error's text.
 */
export function RouteError({
  error,
  reset,
  showHome = true,
  siteName,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  /** Off on the sign-in pages, where the dashboard is out of reach. */
  showHome?: boolean;
  /** The tab title's suffix: the school's name (the product name when not given). */
  siteName?: string;
}) {
  const { locale, t } = useTranslation();
  const router = useRouter();
  const [retrying, startTransition] = useTransition();
  const code = useErrorReference(error);
  const title = t('ui.errorPages.errorTitle');

  return (
    <div className="flex flex-1 flex-col justify-center py-6 max-md:min-h-[calc(100dvh-8rem)]">
      <StatusScreen
        art={<ErrorArt />}
        artWidth="max-w-[86%] sm:max-w-95"
        title={title}
        body={t('ui.errorPages.errorBody')}
        documentTitle={`${title} · ${siteName ?? t('common.app.name')}`}
        actions={
          <>
            <Button
              variant="primary"
              loading={retrying}
              onClick={() =>
                startTransition(() => {
                  router.refresh();
                  reset();
                })
              }
            >
              {retrying ? null : <RetryIcon />}
              {t('ui.errorPages.retry')}
            </Button>
            {showHome ? (
              <Button asChild>
                <Link href={`/${locale}${HOME_PATH}`}>
                  <HomeIcon />
                  {t('ui.errorPages.backToDashboard')}
                </Link>
              </Button>
            ) : null}
          </>
        }
        footer={<ReferenceCode code={code} />}
      />
    </div>
  );
}
