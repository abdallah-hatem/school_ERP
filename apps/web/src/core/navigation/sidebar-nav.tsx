'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment } from 'react';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { isActive, NAV_ITEMS } from './nav-items';

/**
 * The menu. `responsive`: full labels from 1280px, an icon rail from 768–1279px (labels stay for
 * screen readers and as a tooltip). `drawer`: always full, for the phone drawer.
 */
export function SidebarNav({
  variant,
  onNavigate,
}: {
  variant: 'responsive' | 'drawer';
  onNavigate?: () => void;
}) {
  const { locale, t } = useTranslation();
  const pathname = usePathname() ?? '';
  const rail = variant === 'responsive';

  return (
    <nav aria-label={t('ui.shell.mainNav')}>
      <ul className={cn('flex flex-col gap-1', rail && 'max-xl:items-center')}>
        {NAV_ITEMS.map((item, i) => {
          const active = isActive(item, pathname, locale);
          const label = t(`common.nav.${item.key}`);
          const Icon = item.icon;
          const startsGroup = i > 0 && NAV_ITEMS[i - 1]?.group !== item.group;
          return (
            <Fragment key={item.key}>
              {startsGroup ? (
                <li aria-hidden="true" className={cn('mx-3 my-2.5 h-px bg-border', rail && 'max-xl:hidden')} />
              ) : null}
              <li className={cn(rail && 'max-xl:w-auto')}>
                <Link
                  href={`/${locale}${item.path}`}
                  aria-current={active ? 'page' : undefined}
                  title={rail ? label : undefined}
                  onClick={onNavigate}
                  className={cn(
                    'relative flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-[0.9rem] font-semibold',
                    'transition-colors duration-150',
                    active
                      ? 'bg-primary-soft text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    rail && 'max-xl:size-12 max-xl:justify-center max-xl:p-0',
                    rail && active && 'max-xl:shadow-[inset_0_-3px_0_var(--accent)]',
                  )}
                >
                  <Icon className="size-[1.3rem] shrink-0" />
                  <span className={cn('min-w-0 flex-1 truncate', rail && 'max-xl:sr-only')}>{label}</span>
                  {active ? (
                    <span
                      aria-hidden="true"
                      className={cn(
                        'size-2 shrink-0 rounded-full bg-accent ring-4 ring-accent/30',
                        rail && 'max-xl:hidden',
                      )}
                    />
                  ) : null}
                </Link>
              </li>
            </Fragment>
          );
        })}
      </ul>
    </nav>
  );
}
