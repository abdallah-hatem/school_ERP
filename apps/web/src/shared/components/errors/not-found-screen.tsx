'use client';

import { HOME_PATH, LOGIN_PATH } from '@school-erp/shared';
import Link from 'next/link';
import { Button } from '@/shared/components/ui/button';
import { HomeIcon, SignInIcon } from '@/shared/components/ui/icons';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { NotFoundArt } from './error-art';
import { StatusScreen } from './status-screen';

/**
 * Not found, option 2 of design/mockups/error-pages.html (the soft-3D "404").
 * - `page`: a wrong address, outside the shell — "Page not found"; Back to the dashboard when
 *   signed in, Sign in when not.
 * - `shell`: inside the shell — a missing record, one outside the viewer's scope or a page their
 *   roles can't open, all with the same words ("We couldn't find that page"), so it never tells
 *   whether something exists.
 */
export function NotFoundScreen({
  variant,
  signedIn,
  siteName,
}: {
  variant: 'page' | 'shell';
  signedIn: boolean;
  /** The tab title's suffix: the school's name. */
  siteName: string;
}) {
  const { locale, t } = useTranslation();
  const title = variant === 'page' ? t('ui.errorPages.notFoundTitle') : t('ui.states.notFoundTitle');
  const body = variant === 'page' ? t('ui.errorPages.notFoundBody') : t('ui.states.notFoundBody');

  return (
    <StatusScreen
      art={<NotFoundArt />}
      artWidth={variant === 'page' ? 'sm:max-w-150' : 'sm:max-w-120'}
      title={title}
      body={body}
      documentTitle={`${title} · ${siteName}`}
      actions={
        signedIn ? (
          <Button variant="primary" asChild>
            <Link href={`/${locale}${HOME_PATH}`}>
              <HomeIcon />
              {t('ui.errorPages.backToDashboard')}
            </Link>
          </Button>
        ) : (
          <Button variant="primary" asChild>
            <Link href={`/${locale}${LOGIN_PATH}`}>
              <SignInIcon className="rtl:-scale-x-100" />
              {t('ui.errorPages.signIn')}
            </Link>
          </Button>
        )
      }
    />
  );
}
