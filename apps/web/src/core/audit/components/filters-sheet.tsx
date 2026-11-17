'use client';

import type { ReactNode } from 'react';
import { Button } from '@/shared/components/ui/button';
import { CloseIcon, FilterIcon } from '@/shared/components/ui/icons';
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@/shared/components/ui/sheet';
import { TABLET_UP, useMediaQuery } from '@/shared/hooks/use-media-query';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';

/**
 * The audit screens' filters where there is no room for the side panel (Activity and a record's
 * History): one Filters button with the number in use, opening a sheet — from the bottom on a
 * phone (with a grabber), from the inline-end edge on a tablet, never a 768px-wide bottom sheet.
 * The sheet has a close button, "Clear filters" while any is on, and "Show results" at the foot.
 */
export function AuditFiltersSheet({
  count,
  onClear,
  children,
  className,
}: {
  /** Filters in use (the badge); 0 hides "Clear filters". */
  count: number;
  onClear: () => void;
  children: ReactNode;
  /** The trigger's classes (e.g. hidden where the side panel shows). */
  className?: string;
}) {
  const { t } = useTranslation();
  const side = useMediaQuery(TABLET_UP) ? 'end' : 'bottom';
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="soft"
          aria-label={count ? t('audit.filters.openCount', { count }) : t('audit.filters.open')}
          className={cn('h-11 border border-primary', className)}
        >
          <FilterIcon className="size-5" />
          {count ? (
            <span className="tabular grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[0.6875rem] text-primary-foreground">
              {count}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent side={side} className={cn(side === 'bottom' && 'max-h-[calc(100dvh-2rem)]')}>
        {side === 'bottom' ? (
          <span aria-hidden="true" className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-border" />
        ) : null}
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
          <SheetTitle className="flex items-center gap-2 font-display text-base font-extrabold">
            <FilterIcon className="size-5 text-muted-foreground" />
            {t('audit.filters.title')}
          </SheetTitle>
          {count ? (
            <button
              type="button"
              onClick={onClear}
              className="tap-target ms-auto cursor-pointer rounded-sm text-[0.8125rem] font-bold text-primary hover:underline focus-visible:outline-3 focus-visible:outline-ring/55"
            >
              {t('audit.filters.clear')}
            </button>
          ) : null}
          <SheetClose asChild>
            <Button variant="ghost" size="icon" aria-label={t('audit.filters.close')} className={cn('-me-2', !count && 'ms-auto')}>
              <CloseIcon className="size-5" />
            </Button>
          </SheetClose>
        </div>
        <div className="scrollbar-clean min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        <div className="shrink-0 border-t border-border px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
          <SheetClose asChild>
            <Button variant="primary" className="w-full">
              {t('audit.filters.done')}
            </Button>
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  );
}
