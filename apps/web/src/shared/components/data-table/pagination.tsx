'use client';

import { useId, useRef } from 'react';
import { Button } from '@/shared/components/ui/button';
import {
  ChevronEndIcon,
  ChevronFirstIcon,
  ChevronLastIcon,
  ChevronStartIcon,
} from '@/shared/components/ui/icons';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { SkeletonText } from '@/shared/components/ui/skeleton';
import { formatCount } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';

export interface PaginationState {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
  /**
   * A "Rows per page" picker with these sizes (payroll tables). Both or neither: the caller changes
   * the size (and goes back to page 1); without them the page size is fixed.
   */
  pageSizes?: readonly number[];
  onLimitChange?: (limit: number) => void;
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
 * (no "Showing 0–0 of 0" under an empty state). A rows-per-page picker only when the caller passes
 * `pageSizes` and `onLimitChange`; otherwise the page size is fixed by the caller. Callers update the URL with `scroll: false`; on a page change this component
 * brings the top of its list back into view (owner, 2026-11-18): the paged list is the closest
 * `[data-paged-list]` or `<section>` around it, scrolled to just below the sticky top bar, and only
 * when its top is above the screen — a short list that's already in view doesn't jump.
 */
export function scrollListIntoView(from: HTMLElement | null): void {
  const list = from?.closest<HTMLElement>('[data-paged-list], section') ?? from?.parentElement;
  if (!list) return;
  const topBar = document.querySelector<HTMLElement>('[data-app-topbar]');
  const offset = (topBar && topBar.offsetParent !== null ? topBar.getBoundingClientRect().height : 0) + 16;
  const top = list.getBoundingClientRect().top;
  if (top >= offset) return;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  window.scrollTo({ top: window.scrollY + top - offset, behavior: reduced ? 'auto' : 'smooth' });
}

export function Pagination({
  page,
  limit,
  total,
  onPageChange,
  pageSizes,
  onLimitChange,
  disabled = false,
  loading = false,
  skeletonBlock = true,
  className,
}: PaginationState & {
  disabled?: boolean;
  /** First load: the summary is a bar (no "0 of 0" before the count is known). */
  loading?: boolean;
  /** `false`: no `data-skeleton-block` (its table is measured as part of the block around it). */
  skeletonBlock?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const sizeLabelId = useId();
  const goTo = (target: number) => {
    onPageChange(target);
    scrollListIntoView(rootRef.current);
  };
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
      onClick={() => goTo(target)}
    >
      <Icon className="flip-rtl size-4" />
    </Button>
  );

  return (
    <div
      ref={rootRef}
      data-skeleton-block={skeletonBlock ? 'pagination' : undefined}
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
      {pageSizes?.length && onLimitChange ? (
        <div data-page-size="" className="flex items-center gap-2">
          <span id={sizeLabelId}>{t('ui.table.rowsPerPage')}</span>
          <Select
            value={String(limit)}
            disabled={disabled}
            onValueChange={(value) => {
              onLimitChange(Number(value));
              scrollListIntoView(rootRef.current);
            }}
          >
            <SelectTrigger aria-labelledby={sizeLabelId} className="tabular h-9 w-24 text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizes.map((size) => (
                <SelectItem key={size} value={String(size)} className="tabular">
                  {formatCount(size)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
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
            onClick={() => goTo(n)}
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
