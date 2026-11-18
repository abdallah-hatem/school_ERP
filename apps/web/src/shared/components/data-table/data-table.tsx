'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { EmptyState, ErrorState } from '@/shared/components/layout/empty-state';
import { SkeletonText } from '@/shared/components/ui/skeleton';
import { useScrollEdges } from '@/shared/hooks/use-scroll-edges';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { Pagination, type PaginationState } from './pagination';

/*
 * The one table. A page describes its columns; this owns the layout, widths, header, skeleton
 * rows, empty / error states and pagination. It is a table when its container is at least 740px
 * wide (or `cardsBelow` for tables with many columns) and a stack of cards below that (container
 * query, so it follows the space it is given, not the window).
 */

/** Container widths a table may switch to cards below. Literal classes, so Tailwind sees them. */
const VIEW_CLASSES = {
  740: { table: 'hidden @min-[740px]:block', cards: '@min-[740px]:hidden' },
  900: { table: 'hidden @min-[900px]:block', cards: '@min-[900px]:hidden' },
  960: { table: 'hidden @min-[960px]:block', cards: '@min-[960px]:hidden' },
  1100: { table: 'hidden @min-[1100px]:block', cards: '@min-[1100px]:hidden' },
} as const;
export type CardsBelow = keyof typeof VIEW_CLASSES;

export interface DataTableColumn<Row> {
  id: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  align?: 'start' | 'end' | 'center';
  /** Width/min-width classes for the column, e.g. `w-36` or `min-w-40`. */
  className?: string;
  /**
   * Its place on a card: `title` (top, start), `status` (top, end), `badges` (a row of pills on its
   * own line under the title, for a status of several pills that would squeeze the title — a locked
   * user's Active · Temporary password · Sign-in locked), `highlight` (a full-width band,
   * e.g. net pay), `field` (label + value grid — the default), `wide` (a field across the whole
   * grid), `menu` (the row's ⋯ `RowActions`, in the card's top end corner), `actions` (a row of
   * buttons under a divider, no label) or `hidden`.
   */
  card?: 'title' | 'status' | 'badges' | 'highlight' | 'field' | 'wide' | 'menu' | 'actions' | 'hidden';
  /** Label on the card; defaults to `header` when that is a string. */
  cardLabel?: ReactNode;
  /**
   * The cell while the table loads. Defaults to one line of text in the cell's own line box; pass
   * one when the loaded cell is taller (a pill, a name over a code) so skeleton rows are as tall.
   */
  skeleton?: ReactNode;
}

export type RowTone = 'warning' | 'danger' | undefined;

/**
 * A totals row under the rows (a subtotal, a month's total): `<tfoot>` in the table, a summary card
 * after the cards. Each value sits under its column (by column id); the first column holds `label`.
 */
export interface DataTableFooter {
  /** In the first column: "Subtotal", "Total · 12 employees". */
  label: ReactNode;
  /** The value under each column, by column id; a column left out is empty. */
  cells?: Partial<Record<string, ReactNode>>;
  /** Instead of the values: one note across the other columns (totals the viewer may not see). */
  note?: ReactNode;
}

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
  /**
   * The container width below which rows become cards (default 740). A table whose columns' minimum
   * widths add up to more than 740px passes a wider one, so it never scrolls sideways.
   */
  cardsBelow?: CardsBelow;
  /**
   * The cards' height follows their text (long names that wrap on a phone): the skeleton spec
   * compares their width only. Rows (the table view) are still compared in full.
   */
  cardHeightsVary?: boolean;
  /** A totals row under the rows (and a summary card under the cards). Not drawn on an empty list. */
  footer?: DataTableFooter;
  /**
   * `false`: the table and its parts carry no `data-skeleton-block`, so the skeleton spec measures
   * them as part of the block around them. For a table whose very presence is data — a statement's
   * group that is empty one month (an empty state) and full the next — which no skeleton can know.
   */
  skeletonBlocks?: boolean;
  className?: string;
}

/**
 * A card's label/value grid. Sized for eight-digit amounts (`21,474,836.47`, the largest salary):
 * one column in the narrowest list (a 320px phone), two from 340px, four only from 600px — at four
 * across from 500px, or two across under 340px, such a figure overflowed its cell.
 */
const CARD_FIELDS = 'grid grid-cols-1 gap-2 @min-[340px]:grid-cols-2 @min-[600px]:grid-cols-4';

const alignClass = { start: 'text-start', end: 'text-end', center: 'text-center' } as const;

/** Whether this table's parts carry their `data-skeleton-block` names (`skeletonBlocks`). */
const BlocksContext = createContext(true);
function useBlock(name: string): string | undefined {
  return useContext(BlocksContext) ? name : undefined;
}
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
  cardsBelow = 740,
  cardHeightsVary = false,
  footer,
  skeletonBlocks = true,
  className,
}: DataTableProps<Row>) {
  const view = VIEW_CLASSES[cardsBelow];
  const { t } = useTranslation();
  const skeletonCount = Math.min(pagination?.limit ?? 8, SKELETON_CAP);
  const showSkeleton = loading && !rows?.length && !error;
  const isEmpty = !showSkeleton && !error && (rows?.length ?? 0) === 0;

  let body: ReactNode;
  if (error) {
    body = <ErrorState onRetry={onRetry} retrying={retrying} />;
  } else if (showSkeleton) {
    // The real table and cards with placeholder cells: same header, widths, paddings and row
    // heights as the loaded rows, so nothing moves when they arrive.
    const placeholders = Array.from({ length: skeletonCount }, (_, i) => i);
    const skeletonColumns: DataTableColumn<number>[] = columns.map((column) => ({
      ...column,
      cell: () => column.skeleton ?? <SkeletonText />,
    }));
    // The totals row keeps its place: the label, and a bar where each value goes.
    const skeletonFooter: DataTableFooter | undefined = footer && {
      label: <SkeletonText />,
      cells: Object.fromEntries(Object.keys(footer.cells ?? {}).map((id) => [id, <SkeletonText key={id} />])),
      note: footer.note === undefined ? undefined : <SkeletonText />,
    };
    body = (
      <div aria-busy="true">
        <span role="status" className="sr-only">
          {t('ui.states.loading')}
        </span>
        <div aria-hidden="true">
          <Table columns={skeletonColumns} rows={placeholders} getRowId={String} label={label} viewClass={view.table} footer={skeletonFooter} />
          <Cards columns={skeletonColumns} rows={placeholders} getRowId={String} label={label} viewClass={view.cards} heightsVary={cardHeightsVary} footer={skeletonFooter} />
        </div>
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
        <Table columns={columns} rows={rows ?? []} getRowId={getRowId} label={label} rowTone={rowTone} viewClass={view.table} footer={footer} />
        <Cards columns={columns} rows={rows ?? []} getRowId={getRowId} label={label} rowTone={rowTone} viewClass={view.cards} heightsVary={cardHeightsVary} footer={footer} />
      </div>
    );
  }

  return (
    <BlocksContext.Provider value={skeletonBlocks}>
      <section
        aria-label={label}
        data-cards-below={cardsBelow}
        // Its height follows the row count; the head, a row and the pagination are measured instead.
        data-skeleton-block={skeletonBlocks ? 'table' : undefined}
        data-skeleton-measure={skeletonBlocks ? 'width' : undefined}
        className={cn('@container min-w-0 overflow-hidden rounded-3xl bg-card shadow-card', className)}
      >
        {toolbar ? <div data-skeleton-block={skeletonBlocks ? 'table-toolbar' : undefined} className="flex flex-wrap items-center gap-3 px-5 pt-5 pb-4">{toolbar}</div> : null}
        {body}
        {pagination && !error ? <Pagination {...pagination} disabled={loading || refreshing} loading={showSkeleton} /> : null}
      </section>
    </BlocksContext.Provider>
  );
}

// ── Table (container ≥ 740px) ────────────────────────────────────────────────

interface RowsProps<Row> {
  columns: DataTableColumn<Row>[];
  rows: Row[];
  getRowId: (row: Row) => string;
  label: string;
  rowTone?: (row: Row) => RowTone;
  /** Which container widths show this view (from `cardsBelow`). */
  viewClass: string;
  /** Cards only: their height follows their text (`cardHeightsVary`). */
  heightsVary?: boolean;
  footer?: DataTableFooter;
}

const toneBar = {
  warning: 'shadow-[inset_4px_0_0_var(--warning)] rtl:shadow-[inset_-4px_0_0_var(--warning)]',
  danger: 'shadow-[inset_4px_0_0_var(--destructive)] rtl:shadow-[inset_-4px_0_0_var(--destructive)]',
} as const;

function Table<Row>({ columns, rows, getRowId, label, rowTone, viewClass, footer }: RowsProps<Row>) {
  const { ref, edges } = useScrollEdges<HTMLDivElement>();
  const head = useBlock('table-head');
  const rowBlock = useBlock('table-row');
  const foot = useBlock('table-foot');
  return (
    <div data-view="table" className={cn('relative', viewClass)}>
      {/* Edge fades only on a side that hides columns, so a sideways scroll is never missed. */}
      <span
        aria-hidden="true"
        data-scroll-fade="start"
        hidden={!edges.start}
        className="pointer-events-none absolute inset-y-0 start-0 z-10 w-8 from-card to-transparent ltr:bg-linear-to-r rtl:bg-linear-to-l"
      />
      <span
        aria-hidden="true"
        data-scroll-fade="end"
        hidden={!edges.end}
        className="pointer-events-none absolute inset-y-0 end-0 z-10 w-8 from-card to-transparent ltr:bg-linear-to-l rtl:bg-linear-to-r"
      />
      <div ref={ref} className="scrollbar-clean overflow-x-auto">
      <table aria-label={label} className="w-full border-separate border-spacing-0 text-sm">
        <thead data-skeleton-block={head}>
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
              <tr key={getRowId(row)} data-skeleton-block={rowBlock} data-skeleton-each={rowBlock ? '' : undefined} className="group/row">
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
        {footer ? (
          <tfoot data-skeleton-block={foot}>
            <tr>
              {(footer.note === undefined ? columns : columns.slice(0, 1)).map((column, i) => (
                <td
                  key={column.id}
                  className={cn(
                    'border-t-2 border-border bg-muted px-3 py-3 align-middle font-bold whitespace-nowrap',
                    'first:ps-5 last:pe-5',
                    alignClass[column.align ?? 'start'],
                    column.className,
                  )}
                >
                  {i === 0 ? footer.label : footer.cells?.[column.id]}
                </td>
              ))}
              {footer.note === undefined ? null : (
                <td
                  colSpan={Math.max(columns.length - 1, 1)}
                  className="border-t-2 border-border bg-muted px-3 py-3 pe-5 text-end align-middle text-muted-foreground"
                >
                  {footer.note}
                </td>
              )}
            </tr>
          </tfoot>
        ) : null}
      </table>
      </div>
    </div>
  );
}

// ── Cards (container < 740px) ────────────────────────────────────────────────

function Cards<Row>({ columns, rows, getRowId, label, rowTone, viewClass, heightsVary = false, footer }: RowsProps<Row>) {
  const titles = columns.filter((c) => c.card === 'title');
  const statuses = columns.filter((c) => c.card === 'status');
  const badges = columns.filter((c) => c.card === 'badges');
  const highlights = columns.filter((c) => c.card === 'highlight');
  const fields = columns.filter((c) => (c.card ?? 'field') === 'field' || c.card === 'wide');
  const actions = columns.filter((c) => c.card === 'actions');
  const menus = columns.filter((c) => c.card === 'menu');
  const card = useBlock('table-card');

  return (
    <ul data-view="cards" aria-label={label} className={cn('grid gap-3 px-4 pb-4', viewClass)}>
      {rows.map((row) => {
        const tone = rowTone?.(row);
        return (
          <li
            key={getRowId(row)}
            data-skeleton-block={card}
            data-skeleton-each={card ? '' : undefined}
            data-skeleton-measure={card && heightsVary ? 'width' : undefined}
            className={cn(
              'flex min-w-0 flex-col gap-2.5 rounded-2xl border border-border bg-card p-3.5 shadow-xs',
              tone === 'warning' && 'border-s-4 border-s-warning',
              tone === 'danger' && 'border-s-4 border-s-destructive',
            )}
          >
            {titles.length || statuses.length || menus.length ? (
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1 break-words">
                  {titles.map((c) => (
                    <div key={c.id}>{c.cell(row)}</div>
                  ))}
                </div>
                {statuses.length || menus.length ? (
                  // At most half the card: a long status (a cancelled penalty's reason) wraps in its
                  // half instead of squeezing the title to one word per line (dry run 2026-11-18).
                  <div className="flex max-w-[50%] shrink-0 items-start gap-1">
                    {statuses.length ? (
                      <div className="flex min-w-0 flex-col items-end gap-1 break-words">
                        {statuses.map((c) => (
                          <div key={c.id}>{c.cell(row)}</div>
                        ))}
                      </div>
                    ) : null}
                    {/* The row's ⋯ in the top end corner, pulled into the padding so it lines up with the edge. */}
                    {menus.map((c) => (
                      <div key={c.id} className="-me-1.5 -mt-1.5">
                        {c.cell(row)}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {badges.map((c) => (
              <div key={c.id} className="flex min-w-0 flex-wrap items-center gap-1.5">
                {c.cell(row)}
              </div>
            ))}
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
              <dl className={CARD_FIELDS}>
                {fields.map((c) => (
                  <div
                    key={c.id}
                    className={cn(
                      'flex min-w-0 flex-col gap-0.5 rounded-xl bg-muted px-2.5 py-2',
                      c.card === 'wide' && 'col-span-full',
                    )}
                  >
                    <dt className="text-xs text-muted-foreground">{cardLabel(c)}</dt>
                    <dd className="min-w-0 text-sm break-words">{c.cell(row)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {actions.map((c) => (
              <div key={c.id} className="border-t border-border pt-2.5">
                {c.cell(row)}
              </div>
            ))}
          </li>
        );
      })}
      {footer ? <FooterCard columns={columns} footer={footer} /> : null}
    </ul>
  );
}

/** The totals row on a phone: the label, then each column's value under its card label. */
function FooterCard<Row>({ columns, footer }: { columns: DataTableColumn<Row>[]; footer: DataTableFooter }) {
  const valued = footer.note === undefined ? columns.filter((c) => footer.cells?.[c.id] !== undefined) : [];
  const highlights = valued.filter((c) => c.card === 'highlight');
  const fields = valued.filter((c) => c.card !== 'highlight');
  const block = useBlock('table-card-foot');
  return (
    <li
      data-skeleton-block={block}
      className="flex min-w-0 flex-col gap-2.5 rounded-2xl border border-border bg-muted p-3.5"
    >
      <div className="font-bold break-words">{footer.label}</div>
      {footer.note !== undefined ? <div className="text-sm text-muted-foreground">{footer.note}</div> : null}
      {highlights.map((c) => (
        <div
          key={c.id}
          className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-primary-soft px-3 py-2.5 text-primary"
        >
          <span className="text-sm font-bold">{cardLabel(c)}</span>
          <span className="text-xl font-extrabold">{footer.cells?.[c.id]}</span>
        </div>
      ))}
      {fields.length ? (
        <dl className={CARD_FIELDS}>
          {fields.map((c) => (
            <div key={c.id} className="flex min-w-0 flex-col gap-0.5 rounded-xl bg-card px-2.5 py-2">
              <dt className="text-xs text-muted-foreground">{cardLabel(c)}</dt>
              <dd className="min-w-0 text-sm font-bold break-words">{footer.cells?.[c.id]}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </li>
  );
}
