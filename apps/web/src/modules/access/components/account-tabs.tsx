'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NotificationsIcon, PersonIcon } from '@/shared/components/ui/icons';
import { TAB_HOVER_FADE } from '@/shared/lib/tab-motion';
import { useRef } from 'react';
import { useRevealTopOnChange } from '@/shared/hooks/use-reveal-top';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';

const TABS = [
  { key: 'profile', segment: '', icon: PersonIcon },
  { key: 'notifications', segment: 'notifications', icon: NotificationsIcon },
] as const;

/** My account's sections: the profile (sign-in details, password) and Notifications (§11). */
export function AccountTabs() {
  const { t, locale } = useTranslation();
  const pathname = usePathname() ?? '';
  const base = `/${locale}/account`;
  const active = pathname.startsWith(`${base}/notifications`) ? 'notifications' : 'profile';
  // A new tab starts from its top (see RecordTabs).
  const navRef = useRef<HTMLElement>(null);
  useRevealTopOnChange(navRef, active);
  return (
    <nav ref={navRef} aria-label={t('access.account.tabs.label')} data-skeleton-block="tabs" className="scrollbar-clean -mb-2 overflow-x-auto">
      <ul className="flex gap-1.5 border-b border-border">
        {TABS.map(({ key, segment, icon: Icon }) => {
          const current = key === active;
          return (
            <li key={key}>
              <Link
                href={segment ? `${base}/${segment}` : base}
                prefetch
                scroll={false}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  '-mb-px flex h-11 cursor-pointer items-center gap-2 border-b-2 px-4 text-sm font-bold whitespace-nowrap',
                  current
                    ? 'border-primary text-primary'
                    : cn('border-transparent text-muted-foreground hover:text-foreground', TAB_HOVER_FADE),
                )}
              >
                <Icon className="size-4.5" />
                {t(`access.account.tabs.${key}`)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
