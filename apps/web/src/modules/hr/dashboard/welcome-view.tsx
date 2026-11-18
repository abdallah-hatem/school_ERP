'use client';

import { canOpenScreen, SIDEBAR_SCREENS } from '@school-erp/shared';
import Link from 'next/link';
import { useSession } from '@/core/auth';
import { NAV_ITEMS, type NavItem } from '@/core/navigation/nav-items';
import { useSchoolBranding } from '@/core/settings';
import { EmptyState } from '@/shared/components/layout/empty-state';
import { PageHeader } from '@/shared/components/layout/page-header';
import { Button } from '@/shared/components/ui/button';
import { PersonIcon } from '@/shared/components/ui/icons';
import { nameIn } from '@/shared/lib/i18n';
import { useTranslation } from '@/shared/providers/i18n-provider';

const GRID = 'grid grid-cols-1 gap-2.5 min-[360px]:grid-cols-2 sm:grid-cols-3 xl:grid-cols-4';
const ITEM = 'h-auto min-h-12 justify-start py-3 text-start whitespace-normal';

/**
 * The screens someone may open, in menu order (the sidebar's entries, read from `SCREENS`), less
 * Home itself. Exported for the tests and the role-access spec's expectations.
 */
export function welcomeScreens(permissions: readonly string[]): NavItem[] {
  const granted = new Set(permissions);
  return SIDEBAR_SCREENS.filter((id) => id !== 'dashboard' && canOpenScreen(granted, id)).map(
    (id) => NAV_ITEMS.find((item) => item.key === id) as NavItem,
  );
}

/**
 * Home for someone without `hr.dashboard.view` (§2, owner's call 2026-11-18): a welcome with their
 * name and a link to each screen they may open — no HR figures, nothing that needs a request.
 * My account is always last: every signed-in user has it.
 */
export function WelcomeView() {
  const { t, locale } = useTranslation();
  const user = useSession();
  const { branding } = useSchoolBranding();
  const screens = welcomeScreens(user?.permissions ?? []);
  const base = `/${locale}`;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t('dashboard.welcome.title', { name: user?.name ?? '' })}
        description={t('dashboard.welcome.description', { school: nameIn(branding, locale) })}
      />
      <section
        aria-labelledby="welcome-screens"
        data-skeleton-block="welcome-screens"
        className="flex flex-col gap-3 rounded-3xl bg-card p-5 shadow-card"
      >
        <h2 id="welcome-screens" className="font-display text-base font-extrabold">
          {t('dashboard.welcome.screensTitle')}
        </h2>
        {screens.length === 0 ? (
          <EmptyState title={t('dashboard.welcome.noneTitle')} description={t('dashboard.welcome.noneBody')} />
        ) : null}
        <div className={GRID}>
          {screens.map(({ key, path, icon: Icon }) => (
            <Button key={key} asChild variant="secondary" className={ITEM}>
              <Link href={`${base}${path}`}>
                <Icon className="size-5 text-primary" />
                {t(`common.nav.${key}`)}
              </Link>
            </Button>
          ))}
          <Button asChild variant="secondary" className={ITEM}>
            <Link href={`${base}/account`}>
              <PersonIcon className="size-5 text-primary" />
              {t('common.nav.account')}
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
