'use client';

import { useId } from 'react';
import { Button } from '@/shared/components/ui/button';
import {
  ChevronEndIcon,
  ChevronFirstIcon,
  ChevronLastIcon,
  ChevronStartIcon,
} from '@/shared/components/ui/icons';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { formatCount } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';

export interface PaginationState {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
  onLimitChange?: (limit: number) => void;
  limitOptions?: number[];
}

/** Up to five page numbers around the current one. */
export function pageWindow(page: number, pageCount: number, size = 5): number[] {
  const count = Math.min(size, pageCount);
  let start = Math.max(1, page - Math.floor(count / 2));
  start = Math.min(start, Math.max(1, pageCount - count + 1));
  return Array.from({ length: count }, (_, i) => start + i);
}

/**
 * Always visible, even when everything fits on one page: summary, first / previous / numbers /
 * next / last, and rows per page. Callers update the URL with `scroll: false` so the list stays put.
 */
export function Pagination({
  page,
  limit,
  total,
  onPageChange,
  onLimitChange,
  limitOptions = [10, 20, 50, 100],
  disabled = false,
  className,
}: PaginationState & { disabled?: boolean; className?: string }) {
  const { t } = useTranslation();
  const limitLabelId = useId();
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const current = Math.min(Math.max(1, page), pageCount);
  const from = total === 0 ? 0 : (current - 1) * limit + 1;
  const to = Math.min(total, current * limit);
  const atStart = current <= 1 || disabled;
  const atEnd = current >= pageCount || disabled;

  const nav = (label: string, target: number, blocked: boolean, Icon: typeof ChevronStartIcon) => (
    <Button
      variant="secondary"
      size="icon-sm"
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
        'flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-border px-5 py-3.5 text-sm text-muted-foreground',
        className,
      )}
    >
      <p className="tabular" aria-live="polite">
        {t('ui.table.showing', { from: formatCount(from), to: formatCount(to), total: formatCount(total) })}
      </p>
      {onLimitChange ? (
        <div className="flex items-center gap-2">
          <span id={limitLabelId}>{t('ui.table.rowsPerPage')}</span>
          <Select value={String(limit)} onValueChange={(v) => onLimitChange(Number(v))} disabled={disabled}>
            <SelectTrigger aria-labelledby={limitLabelId} className="tabular h-9 w-20">
              {/* Named here, not left to Radix, so the closed trigger shows it from the first paint. */}
              <SelectValue>{limit}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {limitOptions.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <nav aria-label={t('ui.table.pagination')} className="ms-auto flex items-center gap-1.5">
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
            className={cn('tabular text-sm', n === current && 'shadow-none')}
          >
            {n}
          </Button>
        ))}
        {nav(t('ui.table.nextPage'), current + 1, atEnd, ChevronEndIcon)}
        {nav(t('ui.table.lastPage'), pageCount, atEnd, ChevronLastIcon)}
      </nav>
    </div>
  );
}
