'use client';

import type { AuditActor, AuditEntry, AuditSummary, IsoDate, IsoDateTime } from '@school-erp/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { AUDIT_PAGE_SIZE, AuditFiltersSheet, AuditTimeline, AuditTimelineSkeleton, formatFilterRange, schoolDay } from '@/core/audit';
import { Pagination } from '@/shared/components/data-table/pagination';
import { ClearFilters, SearchInput } from '@/shared/components/form/filter-controls';
import { EmptyState, ErrorState } from '@/shared/components/layout/empty-state';
import { PageHeader } from '@/shared/components/layout/page-header';
import { ActivityIcon, CloseIcon, SearchIcon } from '@/shared/components/ui/icons';
import { TABLET_UP, useMediaQuery } from '@/shared/hooks/use-media-query';
import { formatCount } from '@/shared/lib/format';
import type { Translate } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { SkeletonText } from '@/shared/components/ui/skeleton';
import { useTranslation } from '@/shared/providers/i18n-provider';
import {
  activeFilterCount,
  activityQueryString,
  hasActiveFilters,
  type ActivityQuery,
} from '../lib/query';
import { ActivityFilters } from './activity-filters';

const SEARCH_DEBOUNCE_MS = 300;

export interface ActivityViewProps {
  /** `/en/activity` — the page's own path, for URL updates. */
  basePath: string;
  query: ActivityQuery;
  /** `undefined` while the page loads: the screen draws itself with a skeleton timeline. */
  entries: AuditEntry[] | undefined;
  total: number;
  /** Everyone in the log (the person picker). */
  actors: AuditActor[];
  /** Today's counts; null when they couldn't be loaded (undefined while loading). */
  summary: AuditSummary | null | undefined;
  /** Each day on the page counted whole for these filters (day headers); none → no counts. */
  dayTotals?: Partial<Record<IsoDate, number>>;
  /** The server's clock when it rendered ("12 min ago", "Today"). */
  now: IsoDateTime;
  error?: boolean;
}

type Locale = 'en' | 'ar';

/** A filter in use: what it is called on its chip, and what removing it clears. */
interface ActiveFilter {
  key: 'person' | 'module' | 'types' | 'date';
  label: string;
  clear: Partial<ActivityQuery>;
}

function activeFilters(query: ActivityQuery, actors: AuditActor[], t: Translate, locale: Locale): ActiveFilter[] {
  const out: ActiveFilter[] = [];
  if (query.actorId) {
    const name = actors.find((a) => a.id === query.actorId)?.name ?? t('audit.filters.person');
    out.push({ key: 'person', label: name, clear: { actorId: undefined } });
  }
  if (query.module) {
    const label = query.module === 'settings' ? t('audit.filters.settings') : t(`audit.modules.${query.module}`);
    out.push({ key: 'module', label, clear: { module: undefined } });
  }
  for (const type of query.types) {
    out.push({ key: 'types', label: t(`audit.filters.chips.${type}`), clear: { types: query.types.filter((x) => x !== type) } });
  }
  if (query.from && query.to) {
    out.push({ key: 'date', label: formatFilterRange(query.from, query.to, locale), clear: { from: undefined, to: undefined } });
  }
  return out;
}

/**
 * What is narrowing an empty result, in words: 'the search "omar" and the person Mona Ibrahim'.
 * Several action types read as one cause ("the action type Added, Changed").
 */
export function noResultsCauses(query: ActivityQuery, actors: AuditActor[], t: Translate, locale: Locale): string {
  const list = t('audit.activity.causes.list');
  const parts: string[] = [];
  if (query.q) parts.push(t('audit.activity.causes.search', { q: query.q }));
  const filters = activeFilters(query, actors, t, locale);
  for (const key of ['person', 'module', 'types', 'date'] as const) {
    const names = filters.filter((f) => f.key === key).map((f) => f.label);
    if (names.length === 0) continue;
    const name = names.join(list);
    parts.push(t(`audit.activity.causes.${key}`, key === 'date' ? { range: name } : { name }));
  }
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(list)}${t('audit.activity.causes.and')}${parts[parts.length - 1]}`;
}

/**
 * The results count, then the filters in use as removable chips in a row that scrolls sideways
 * (phone and tablet, where the panel sits behind a button). The count stays outside the scrolling
 * row, so it is never cut at its edge. Each chip reaches 44px to a finger.
 */
function FilterChips({
  query,
  actors,
  total,
  showTotal,
  loading = false,
  onChange,
  clearCount,
  onClear,
  disabled,
}: {
  query: ActivityQuery;
  actors: AuditActor[];
  total: number;
  showTotal: boolean;
  /** First load: the count is a bar. */
  loading?: boolean;
  onChange: (next: ActivityQuery) => void;
  /** The search (when it has text) plus each filter in use: "Clear filters · n" at the row's end. */
  clearCount: number;
  onClear: () => void;
  disabled?: boolean;
}) {
  const { t, locale } = useTranslation();
  const chips = activeFilters(query, actors, t, locale);
  if (!loading && !showTotal && chips.length === 0 && clearCount === 0) return null;
  return (
    <div className="flex min-w-0 items-center gap-2 text-[0.8125rem] whitespace-nowrap text-muted-foreground @min-[56rem]/activity:hidden">
      {loading ? <SkeletonText className="shrink-0 pe-1" width="w-20" /> : null}
      {showTotal ? (
        <span aria-live="polite" data-testid="activity-total" className="tabular shrink-0 pe-1">
          {t('audit.activity.results', { count: formatCount(total) })}
        </span>
      ) : null}
      <div
        data-testid="activity-chips"
        className="scrollbar-clean -me-1 flex min-w-0 flex-1 items-center gap-2 overflow-x-auto px-1 py-1.5"
      >
        {chips.map((chip, i) => (
          <button
            key={`${chip.key}-${i}`}
            type="button"
            aria-label={t('audit.filters.remove', { name: chip.label })}
            onClick={() => onChange({ ...query, ...chip.clear, page: 1 })}
            className="tap-target tabular inline-flex min-h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-primary-soft py-0.5 ps-3 pe-2.5 text-[0.8125rem] font-bold text-primary focus-visible:outline-3 focus-visible:outline-ring/55"
          >
            <bdi>{chip.label}</bdi>
            <CloseIcon className="size-3.5" />
          </button>
        ))}
        {/* Pinned to the row's inline end while the chips scroll under it, so a phone always shows it. */}
        <ClearFilters
          count={clearCount}
          onClear={onClear}
          disabled={disabled}
          className="sticky end-0 ms-auto h-9 bg-background px-2.5 hover:bg-primary-soft"
        />
      </div>
    </div>
  );
}

/**
 * The Activity page (layout option B): search, the day-grouped timeline with server paging, and
 * the filters — a side panel on wide screens, one Filters button opening a sheet on a phone.
 * Filters, search and page live in the URL; every change keeps the scroll and dims the timeline
 * until the next page lands.
 */
export function ActivityView({
  basePath,
  query,
  entries,
  total,
  actors,
  summary,
  dayTotals,
  now,
  error = false,
}: ActivityViewProps) {
  const { t, locale } = useTranslation();
  // The full hint fits from a tablet up; a phone gets the short one (never cut mid-word).
  const roomy = useMediaQuery(TABLET_UP, true);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(query.q ?? '');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const today = schoolDay(now);

  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    [],
  );

  function go(next: ActivityQuery) {
    startTransition(() => router.push(`${basePath}${activityQueryString(next)}`, { scroll: false }));
  }

  function onSearchChange(text: string) {
    setSearch(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      const q = text.trim();
      go({ ...query, page: 1, ...(q ? { q } : { q: undefined }) });
    }, SEARCH_DEBOUNCE_MS);
  }

  /** Search, every filter and the page, in one URL update. */
  function clearAll() {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setSearch('');
    go({ page: 1, types: [] });
  }

  const loading = entries === undefined;
  const filterCount = activeFilterCount(query);
  const clearCount = filterCount + (query.q ? 1 : 0);
  const filters = (title: boolean) => (
    <ActivityFilters
      query={query}
      summary={summary}
      today={today}
      onChange={go}
      onClear={title ? clearAll : undefined}
      clearCount={clearCount}
      disabled={pending || loading}
      title={title}
    />
  );

  let body: ReactNode;
  if (loading) {
    body = <AuditTimelineSkeleton grouping="day" />;
  } else if (error) {
    body = <ErrorState onRetry={() => startTransition(() => router.refresh())} retrying={pending} />;
  } else if (entries.length === 0) {
    body = hasActiveFilters(query) ? (
      <EmptyState
        icon={SearchIcon}
        title={t('audit.activity.noResultsTitle')}
        description={t('audit.activity.noResultsBody', { causes: noResultsCauses(query, actors, t, locale) })}
        action={<ClearFilters placement="empty" count={clearCount} onClear={clearAll} />}
      />
    ) : (
      <EmptyState icon={ActivityIcon} title={t('audit.activity.emptyTitle')} description={t('audit.activity.emptyBody')} />
    );
  } else {
    body = (
      <div aria-busy={pending || undefined} className={cn('transition-opacity duration-150', pending && 'pointer-events-none opacity-55')}>
        <AuditTimeline entries={entries} grouping="day" now={now} label={t('audit.activity.label')} dayTotals={dayTotals} />
      </div>
    );
  }

  const clearFilters = () => go({ page: 1, types: [], ...(query.q ? { q: query.q } : {}) });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('audit.title')} description={t('audit.activity.description')} />
      <div className="@container/activity">
        <div className="grid items-start gap-5 @min-[56rem]/activity:grid-cols-[minmax(0,1fr)_18.75rem]">
          {/*
            The filters panel comes first in the page's order (keyboard and screen readers reach the
            filters before the timeline they narrow); on wide screens it is drawn in the second column.
          */}
          <aside
            aria-label={t('audit.filters.title')}
            // Its height follows how many people the picker lists.
            data-skeleton-block="filters-panel"
            data-skeleton-measure="width"
            className="hidden rounded-3xl bg-card p-4.5 shadow-card @min-[56rem]/activity:sticky @min-[56rem]/activity:top-6 @min-[56rem]/activity:order-2 @min-[56rem]/activity:block"
          >
            {filters(true)}
          </aside>
          <div className="flex min-w-0 flex-col gap-2 @min-[56rem]/activity:order-1 @min-[56rem]/activity:gap-3.5">
            <div role="search" data-skeleton-block="search" className="flex gap-2">
              <SearchInput
                aria-label={t('audit.activity.searchLabel')}
                placeholder={roomy ? t('audit.activity.searchPlaceholder') : t('audit.activity.searchPlaceholderShort')}
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                disabled={loading}
                loading={pending}
                className="border-transparent bg-card shadow-card"
              />
              <AuditFiltersSheet count={filterCount} onClear={clearFilters} className="@min-[56rem]/activity:hidden">
                {filters(false)}
              </AuditFiltersSheet>
            </div>
            <FilterChips
              query={query}
              actors={actors}
              total={total}
              showTotal={!loading && !error && total > 0}
              loading={loading}
              onChange={go}
              clearCount={clearCount}
              onClear={clearAll}
              disabled={pending}
            />
            <section
              aria-label={t('audit.title')}
              // Its height follows the entries (how many changes each shows).
              data-skeleton-block="timeline"
              data-skeleton-measure="width"
              className="@container min-w-0 rounded-3xl bg-card shadow-card"
            >
              {body}
              {error ? null : (
                <Pagination
                  page={query.page}
                  limit={AUDIT_PAGE_SIZE}
                  total={total}
                  onPageChange={(page) => go({ ...query, page })}
                  disabled={pending || loading}
                  loading={loading}
                />
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
