'use client';

import type { AuditActor, AuditEntry, AuditSummary, IsoDateTime } from '@school-erp/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { AUDIT_PAGE_SIZE, AuditTimeline, schoolDay } from '@/core/audit';
import { formatFilterDay } from '@/core/audit/lib/time';
import { Pagination } from '@/shared/components/data-table/pagination';
import { SearchInput } from '@/shared/components/form/filter-controls';
import { EmptyState, ErrorState } from '@/shared/components/layout/empty-state';
import { PageHeader } from '@/shared/components/layout/page-header';
import { Button } from '@/shared/components/ui/button';
import { ActivityIcon, CloseIcon, FilterIcon, SearchIcon } from '@/shared/components/ui/icons';
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@/shared/components/ui/sheet';
import { formatCount } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
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
  entries: AuditEntry[];
  total: number;
  /** Everyone in the log (the person picker). */
  actors: AuditActor[];
  /** Today's counts; null when they couldn't be loaded. */
  summary: AuditSummary | null;
  /** The server's clock when it rendered ("12 min ago", "Today"). */
  now: IsoDateTime;
  error?: boolean;
}

/** The filters in use as removable chips (phone, where the panel sits behind a button). */
function FilterChips({
  query,
  actors,
  onChange,
}: {
  query: ActivityQuery;
  actors: AuditActor[];
  onChange: (next: ActivityQuery) => void;
}) {
  const { t, locale } = useTranslation();
  const chips: { key: string; label: string; clear: Partial<ActivityQuery> }[] = [];
  if (query.actorId) {
    const name = actors.find((a) => a.id === query.actorId)?.name ?? t('audit.filters.person');
    chips.push({ key: 'person', label: name, clear: { actorId: undefined } });
  }
  if (query.module) {
    const label = query.module === 'settings' ? t('audit.filters.settings') : t(`audit.modules.${query.module}`);
    chips.push({ key: 'module', label, clear: { module: undefined } });
  }
  for (const type of query.types) {
    chips.push({
      key: `type-${type}`,
      label: t(`audit.filters.chips.${type}`),
      clear: { types: query.types.filter((x) => x !== type) },
    });
  }
  if (query.from && query.to) {
    const label =
      query.from === query.to
        ? formatFilterDay(query.from, locale)
        : t('audit.filters.range', { from: formatFilterDay(query.from, locale), to: formatFilterDay(query.to, locale) });
    chips.push({ key: 'date', label, clear: { from: undefined, to: undefined } });
  }
  return (
    <>
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          aria-label={t('audit.filters.remove', { name: chip.label })}
          onClick={() => onChange({ ...query, ...chip.clear, page: 1 })}
          className="tabular inline-flex min-h-7 cursor-pointer items-center gap-1.5 rounded-full bg-primary-soft py-0.5 ps-2.5 pe-2 text-[0.8125rem] font-bold whitespace-nowrap text-primary focus-visible:outline-3 focus-visible:outline-ring/55"
        >
          <bdi>{chip.label}</bdi>
          <CloseIcon className="size-3.5" />
        </button>
      ))}
    </>
  );
}

/**
 * The Activity page (layout option B): search, the day-grouped timeline with server paging, and
 * the filters — a side panel on wide screens, one Filters button opening a sheet on a phone.
 * Filters, search and page live in the URL; every change keeps the scroll and dims the timeline
 * until the next page lands.
 */
export function ActivityView({ basePath, query, entries, total, actors, summary, now, error = false }: ActivityViewProps) {
  const { t } = useTranslation();
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

  function clearAll() {
    setSearch('');
    go({ page: 1, types: [] });
  }

  const filterCount = activeFilterCount(query);
  const filters = (title: boolean) => (
    <ActivityFilters query={query} actors={actors} summary={summary} today={today} onChange={go} disabled={pending} title={title} />
  );

  let body: ReactNode;
  if (error) {
    body = <ErrorState onRetry={() => startTransition(() => router.refresh())} retrying={pending} />;
  } else if (entries.length === 0) {
    body = hasActiveFilters(query) ? (
      <EmptyState
        icon={SearchIcon}
        title={t('audit.activity.noResultsTitle')}
        description={t('audit.activity.noResultsBody')}
        action={
          <Button variant="secondary" onClick={clearAll}>
            <CloseIcon />
            {t('audit.filters.clear')}
          </Button>
        }
      />
    ) : (
      <EmptyState icon={ActivityIcon} title={t('audit.activity.emptyTitle')} description={t('audit.activity.emptyBody')} />
    );
  } else {
    body = (
      <div aria-busy={pending || undefined} className={cn('transition-opacity duration-150', pending && 'pointer-events-none opacity-55')}>
        <AuditTimeline entries={entries} grouping="day" now={now} label={t('audit.activity.label')} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('audit.title')} description={t('audit.activity.description')} />
      <div className="@container/activity">
        <div className="grid items-start gap-5 @min-[56rem]/activity:grid-cols-[minmax(0,1fr)_18.75rem]">
          <div className="flex min-w-0 flex-col gap-3.5">
            <div role="search" className="flex gap-2">
              <SearchInput
                aria-label={t('audit.activity.searchLabel')}
                placeholder={t('audit.activity.searchPlaceholder')}
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                className="border-transparent bg-card shadow-card"
              />
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    variant="soft"
                    aria-label={filterCount ? t('audit.filters.openCount', { count: filterCount }) : t('audit.filters.open')}
                    className="h-11 border border-primary @min-[56rem]/activity:hidden"
                  >
                    <FilterIcon className="size-5" />
                    {filterCount ? (
                      <span className="tabular grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[0.6875rem] text-primary-foreground">
                        {filterCount}
                      </span>
                    ) : null}
                  </Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="max-h-[calc(100dvh-2rem)]">
                  <div className="flex shrink-0 items-center gap-2 border-b border-border px-5 py-4">
                    <SheetTitle className="flex items-center gap-2 font-display text-base font-extrabold">
                      <FilterIcon className="size-5 text-muted-foreground" />
                      {t('audit.filters.title')}
                    </SheetTitle>
                    {filterCount ? (
                      <button
                        type="button"
                        onClick={() => go({ page: 1, types: [], ...(query.q ? { q: query.q } : {}) })}
                        className="ms-auto cursor-pointer rounded-sm text-[0.8125rem] font-bold text-primary hover:underline focus-visible:outline-3 focus-visible:outline-ring/55"
                      >
                        {t('audit.filters.clear')}
                      </button>
                    ) : null}
                  </div>
                  <div className="scrollbar-clean min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{filters(false)}</div>
                  <div className="shrink-0 border-t border-border px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
                    <SheetClose asChild>
                      <Button variant="primary" className="w-full">
                        {t('audit.filters.done')}
                      </Button>
                    </SheetClose>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
            <div className="flex flex-wrap items-center gap-2 px-1 text-[0.8125rem] text-muted-foreground @min-[56rem]/activity:hidden">
              {error ? null : (
                <span aria-live="polite" className="tabular">
                  {t('audit.activity.results', { count: formatCount(total) })}
                </span>
              )}
              <FilterChips query={query} actors={actors} onChange={go} />
            </div>
            <section aria-label={t('audit.title')} className="@container min-w-0 rounded-3xl bg-card shadow-card">
              {body}
              {error ? null : (
                <Pagination
                  page={query.page}
                  limit={AUDIT_PAGE_SIZE}
                  total={total}
                  onPageChange={(page) => go({ ...query, page })}
                  disabled={pending}
                />
              )}
            </section>
          </div>
          <aside
            aria-label={t('audit.filters.title')}
            className="hidden rounded-3xl bg-card p-4.5 shadow-card @min-[56rem]/activity:sticky @min-[56rem]/activity:top-6 @min-[56rem]/activity:block"
          >
            {filters(true)}
          </aside>
        </div>
      </div>
    </div>
  );
}
