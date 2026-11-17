'use client';

import type { ReactNode } from 'react';
import { EmptyState, ErrorState } from '@/shared/components/layout/empty-state';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { Pagination, type PaginationState } from './pagination';

/*
 * The one table. A page describes its columns; this owns the layout, widths, header, skeleton
 * rows, empty / error states and pagination. It is a table when its container is at least 740px
 * wide and a stack of cards below that (container query, so it follows the space it is given,
 * not the window).
 */

export interface DataTableColumn<Row> {
  id: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  align?: 'start' | 'end' | 'center';
  /** Width/min-width classes for the column, e.g. `w-36` or `min-w-40`. */
  className?: string;
  /**
   * Its place on a card: `title` (top, start), `status` (top, end), `highlight` (a full-width band,
   * e.g. net pay), `field` (label + value grid — the default) or `hidden`.
   */
  card?: 'title' | 'status' | 'highlight' | 'field' | 'hidden';
  /** Label on the card; defaults to `header` when that is a string. */
  cardLabel?: ReactNode;
}

export type RowTone = 'warning' | 'danger' | undefined;

export interface DataTableProps<Row> {
  columns: DataTableColumn<Row>[];
  rows: Row[] | undefined;
  getRowId: (row: Row) => string;
  /** Accessible name of the table. */
  label: string;
  /** First load: skeleton rows in the shape of the table. */
  loading?: boolean;
  /** Refetch of rows already on screen: keep them, dimmed. */
  refreshing?: boolean;
  /** Load failed: error state with a retry button. */
  error?: boolean;
  onRetry?: () => void;
  retrying?: boolean;
  /** Shown when there are no rows. Pass a no-results state when filters are active. */
  empty?: ReactNode;
  pagination?: PaginationState;
  /** Title row above the table: heading, count, search, filters. */
  toolbar?: ReactNode;
  rowTone?: (row: Row) => RowTone;
  className?: string;
}

const alignClass = { start: 'text-start', end: 'text-end', center: 'text-center' } as const;
const SKELETON_CAP = 20;

function cardLabel<Row>(column: DataTableColumn<Row>): ReactNode {
  return column.cardLabel ?? (typeof column.header === 'string' ? column.header : null);
}

export function DataTable<Row>({
  columns,
  rows,
  getRowId,
  label,
  loading = false,
  refreshing = false,
  error = false,
  onRetry,
  retrying = false,
  empty,
  pagination,
  toolbar,
  rowTone,
  className,
}: DataTableProps<Row>) {
  const { t } = useTranslation();
  const skeletonCount = Math.min(pagination?.limit ?? 8, SKELETON_CAP);
  const showSkeleton = loading && !rows?.length && !error;
  const isEmpty = !showSkeleton && !error && (rows?.length ?? 0) === 0;

  let body: ReactNode;
  if (error) {
    body = <ErrorState onRetry={onRetry} retrying={retrying} />;
  } else if (showSkeleton) {
    body = (
      <div aria-busy="true">
        <span role="status" className="sr-only">
          {t('ui.states.loading')}
        </span>
        <TableSkeleton columns={columns} count={skeletonCount} />
        <CardsSkeleton count={Math.min(skeletonCount, 4)} />
      </div>
    );
  } else if (isEmpty) {
    body = empty ?? <EmptyState />;
  } else {
    body = (
      <div
        aria-busy={refreshing || undefined}
        className={cn('transition-opacity duration-150', refreshing && 'pointer-events-none opacity-55')}
      >
        <Table columns={columns} rows={rows ?? []} getRowId={getRowId} label={label} rowTone={rowTone} />
        <Cards columns={columns} rows={rows ?? []} getRowId={getRowId} label={label} rowTone={rowTone} />
      </div>
    );
  }

  return (
    <section
      aria-label={label}
      className={cn('@container overflow-hidden rounded-3xl bg-card shadow-card', className)}
    >
      {toolbar ? <div className="flex flex-wrap items-center gap-3 px-5 pt-5 pb-4">{toolbar}</div> : null}
      {body}
      {pagination && !error ? <Pagination {...pagination} disabled={loading || refreshing} /> : null}
    </section>
  );
}

// ── Table (container ≥ 740px) ────────────────────────────────────────────────

interface RowsProps<Row> {
  columns: DataTableColumn<Row>[];
  rows: Row[];
  getRowId: (row: Row) => string;
  label: string;
  rowTone?: (row: Row) => RowTone;
}

const toneBar = {
  warning: 'shadow-[inset_4px_0_0_var(--warning)] rtl:shadow-[inset_-4px_0_0_var(--warning)]',
  danger: 'shadow-[inset_4px_0_0_var(--destructive)] rtl:shadow-[inset_-4px_0_0_var(--destructive)]',
} as const;

function Table<Row>({ columns, rows, getRowId, label, rowTone }: RowsProps<Row>) {
  return (
    <div data-view="table" className="scrollbar-clean hidden overflow-x-auto @min-[740px]:block">
      <table aria-label={label} className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.id}
                scope="col"
                className={cn(
                  'bg-muted px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-muted-foreground',
                  'first:rounded-s-xl first:ps-5 last:rounded-e-xl last:pe-5',
                  alignClass[column.align ?? 'start'],
                  column.className,
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const tone = rowTone?.(row);
            return (
              <tr key={getRowId(row)} className="group/row">
                {columns.map((column, i) => (
                  <td
                    key={column.id}
                    className={cn(
                      'border-b border-border px-3 py-3 align-middle whitespace-nowrap transition-colors duration-150',
                      'group-last/row:border-b-0 group-hover/row:bg-primary-soft/45',
                      'first:ps-5 last:pe-5',
                      alignClass[column.align ?? 'start'],
                      i === 0 && tone ? toneBar[tone] : null,
                      column.className,
                    )}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Cards (container < 740px) ────────────────────────────────────────────────

function Cards<Row>({ columns, rows, getRowId, label, rowTone }: RowsProps<Row>) {
  const titles = columns.filter((c) => c.card === 'title');
  const statuses = columns.filter((c) => c.card === 'status');
  const highlights = columns.filter((c) => c.card === 'highlight');
  const fields = columns.filter((c) => (c.card ?? 'field') === 'field');

  return (
    <ul data-view="cards" aria-label={label} className="grid gap-3 px-4 pb-4 @min-[740px]:hidden">
      {rows.map((row) => {
        const tone = rowTone?.(row);
        return (
          <li
            key={getRowId(row)}
            className={cn(
              'flex min-w-0 flex-col gap-2.5 rounded-2xl border border-border bg-card p-3.5 shadow-xs',
              tone === 'warning' && 'border-s-4 border-s-warning',
              tone === 'danger' && 'border-s-4 border-s-destructive',
            )}
          >
            {titles.length || statuses.length ? (
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1 break-words">
                  {titles.map((c) => (
                    <div key={c.id}>{c.cell(row)}</div>
                  ))}
                </div>
                {statuses.length ? (
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {statuses.map((c) => (
                      <div key={c.id}>{c.cell(row)}</div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {highlights.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-primary-soft px-3 py-2.5 text-primary"
              >
                <span className="text-sm font-bold">{cardLabel(c)}</span>
                <span className="text-xl font-extrabold">{c.cell(row)}</span>
              </div>
            ))}
            {fields.length ? (
              <dl className="grid grid-cols-2 gap-2 @min-[500px]:grid-cols-4">
                {fields.map((c) => (
                  <div key={c.id} className="flex min-w-0 flex-col gap-0.5 rounded-xl bg-muted px-2.5 py-2">
                    <dt className="text-xs text-muted-foreground">{cardLabel(c)}</dt>
                    <dd className="min-w-0 text-sm break-words">{c.cell(row)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

// ── Skeletons: same rows, same heights ───────────────────────────────────────

function TableSkeleton<Row>({ columns, count }: { columns: DataTableColumn<Row>[]; count: number }) {
  return (
    <div data-view="table" className="hidden @min-[740px]:block">
      <div className="mx-0 flex h-9 items-center gap-6 rounded-xl bg-muted px-5">
        {columns.map((c) => (
          <Skeleton key={c.id} className="h-3 flex-1 bg-border" />
        ))}
      </div>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} data-skeleton-row="" className="flex h-[3.75rem] items-center gap-6 border-b border-border px-5 last:border-b-0">
          {columns.map((c, j) => (
            <Skeleton key={c.id} className={cn('h-4 flex-1', j === 0 && 'h-8')} />
          ))}
        </div>
      ))}
    </div>
  );
}

function CardsSkeleton({ count }: { count: number }) {
  return (
    <div data-view="cards" className="grid gap-3 px-4 pb-4 @min-[740px]:hidden">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-2.5 rounded-2xl border border-border p-3.5">
          <div className="flex items-start justify-between gap-3">
            <Skeleton className="h-9 w-40" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-13 rounded-xl" />
            <Skeleton className="h-13 rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}
