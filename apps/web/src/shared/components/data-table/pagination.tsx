'use client';

import { Button } from '@/shared/components/ui/button';
import {
  ChevronEndIcon,
  ChevronFirstIcon,
  ChevronLastIcon,
  ChevronStartIcon,
} from '@/shared/components/ui/icons';
import { SkeletonText } from '@/shared/components/ui/skeleton';
import { formatCount } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';

export interface PaginationState {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
}

/** Up to five page numbers around the current one. */
export function pageWindow(page: number, pageCount: number, size = 5): number[] {
  const count = Math.min(size, pageCount);
  let start = Math.max(1, page - Math.floor(count / 2));
  start = Math.min(start, Math.max(1, pageCount - count + 1));
  return Array.from({ length: count }, (_, i) => start + i);
}

/**
 * Always visible while there is something to page, even when everything fits on one page: summary,
 * first / previous / numbers / next / last. An empty result has nothing to page and draws nothing
 * (no "Showing 0–0 of 0" under an empty state). No rows-per-page control: the page size is fixed
 * by the caller. Callers update the URL with `scroll: false` so the list stays put.
 */
export function Pagination({
  page,
  limit,
  total,
  onPageChange,
  disabled = false,
  loading = false,
  className,
}: PaginationState & {
  disabled?: boolean;
  /** First load: the summary is a bar (no "0 of 0" before the count is known). */
  loading?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const current = Math.min(Math.max(1, page), pageCount);
  const from = total === 0 ? 0 : (current - 1) * limit + 1;
  const to = Math.min(total, current * limit);
  const atStart = current <= 1 || disabled;
  const atEnd = current >= pageCount || disabled;
  if (total === 0 && !loading) return null;

  const nav = (label: string, target: number, blocked: boolean, Icon: typeof ChevronStartIcon, className?: string) => (
    <Button
      variant="secondary"
      size="icon-sm"
      className={cn('tap-target', className)}
      aria-label={label}
      disabled={blocked}
      onClick={() => onPageChange(target)}
    >
      <Icon className="flip-rtl size-4" />
    </Button>
  );

  return (
    <div
      className={cn(
        'flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3 border-t border-border px-4 py-3.5 text-sm text-muted-foreground sm:px-5',
        className,
      )}
    >
      {loading ? (
        <SkeletonText width="w-32" />
      ) : (
        <p className="tabular" aria-live="polite">
          {t('ui.table.showing', { from: formatCount(from), to: formatCount(to), total: formatCount(total) })}
        </p>
      )}
      {/*
        Phones (< 768px): first · previous · "Page X of Y" · next · last across the whole row — nine
        buttons don't fit a 326px card. From 768px: first / previous / page numbers / next / last.
        Each button reaches 44px to a finger (`tap-target`), spaced so the hit areas don't overlap.
      */}
      <nav
        aria-label={t('ui.table.pagination')}
        className="flex w-full items-center justify-between gap-2 md:ms-auto md:w-auto md:justify-start md:gap-1.5"
      >
        {nav(t('ui.table.firstPage'), 1, atStart, ChevronFirstIcon)}
        {nav(t('ui.table.previousPage'), current - 1, atStart, ChevronStartIcon)}
        {pageWindow(current, pageCount).map((n) => (
          <Button
            key={n}
            size="icon-sm"
            variant={n === current ? 'primary' : 'secondary'}
            aria-current={n === current ? 'page' : undefined}
            aria-label={t('ui.table.page', { page: n })}
            disabled={disabled}
            onClick={() => onPageChange(n)}
            className={cn('tap-target tabular hidden text-sm md:inline-flex', n === current && 'shadow-none')}
          >
            {n}
          </Button>
        ))}
        <p data-page-of="" className="tabular min-w-0 text-center font-semibold text-foreground md:hidden">
          {t('ui.table.pageOf', { page: formatCount(current), count: formatCount(pageCount) })}
        </p>
        {nav(t('ui.table.nextPage'), current + 1, atEnd, ChevronEndIcon)}
        {nav(t('ui.table.lastPage'), pageCount, atEnd, ChevronLastIcon)}
      </nav>
    </div>
  );
}
