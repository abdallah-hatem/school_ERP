'use client';

import Link from 'next/link';
import { TAB_HOVER_FADE } from '@/shared/lib/tab-motion';
import { useRef } from 'react';
import { useRevealTopOnChange } from '@/shared/hooks/use-reveal-top';
import { cn } from '@/shared/lib/utils';

export interface RecordTab {
  key: string;
  label: string;
  /** The tab's route: `''` is the record's own page, else the segment after it (`history`). */
  segment: string;
}

/** The tab a pathname shows: the first segment after `recordHref` (none = the `''` tab). */
export function activeRecordTab(pathname: string, recordHref: string, tabs: readonly RecordTab[]): string | undefined {
  const rest = pathname.startsWith(recordHref) ? pathname.slice(recordHref.length) : '';
  const segment = rest.split('/')[1] ?? '';
  return (tabs.find((tab) => tab.segment === segment) ?? tabs.find((tab) => tab.segment === ''))?.key;
}

/**
 * A record's section tabs (employee profile, payroll run), drawn by the record's layout under its
 * header. Each link prefetches its tab and keeps the scroll; the current one is `active`.
 */
export function RecordTabs({
  label,
  recordHref,
  tabs,
  active,
}: {
  /** The nav's accessible name ("Employee sections"). */
  label: string;
  recordHref: string;
  tabs: readonly RecordTab[];
  active: string | undefined;
}) {
  // A new tab starts from its top: scrolled down a long tab, the tab bar comes back into view
  // with the new tab right under it (the header above stays as it is).
  const navRef = useRef<HTMLElement>(null);
  useRevealTopOnChange(navRef, active);
  return (
    <nav ref={navRef} aria-label={label} data-skeleton-block="tabs" className="scrollbar-clean -mb-2 overflow-x-auto">
      <ul className="flex gap-1.5 border-b border-border">
        {tabs.map((tab) => {
          const current = tab.key === active;
          return (
            <li key={tab.key}>
              <Link
                href={tab.segment ? `${recordHref}/${tab.segment}` : recordHref}
                prefetch
                scroll={false}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  '-mb-px flex h-11 cursor-pointer items-center border-b-2 px-4 text-sm font-bold whitespace-nowrap',
                  current
                    ? 'border-primary text-primary'
                    : cn('border-transparent text-muted-foreground hover:text-foreground', TAB_HOVER_FADE),
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
