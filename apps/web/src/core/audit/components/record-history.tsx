'use client';

import type { AuditActor, AuditEntry, IsoDateTime } from '@school-erp/shared';
import { useRouter } from 'next/navigation';
import { useTransition, type ReactNode } from 'react';
import { Pagination } from '@/shared/components/data-table/pagination';
import { ClearFilters, FilterSelect } from '@/shared/components/form/filter-controls';
import { EmptyState, ErrorState } from '@/shared/components/layout/empty-state';
import { FilterIcon, HistoryIcon, SearchIcon } from '@/shared/components/ui/icons';
import { Skeleton, SkeletonText } from '@/shared/components/ui/skeleton';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { fieldLabel } from '../lib/entry-text';
import { AUDIT_PAGE_SIZE, historyQueryString, type HistoryQuery } from '../lib/history-query';
import { AuditFiltersSheet } from './filters-sheet';
import { formatShortDay, relativeAgo, schoolDay } from '../lib/time';
import { ActorName, AuditTimeline, AuditTimelineSkeleton } from './timeline';

export interface RecordHistoryProps {
  /** The tab's own path (`/en/employees/<id>/history`), for URL updates. */
  basePath: string;
  /** The record's name for the description ("Omar Fathy"). */
  recordName: string;
  query: HistoryQuery;
  entries: AuditEntry[];
  total: number;
  /** The fields this record's entries changed, and the people who changed it. */
  fields: string[];
  actors: AuditActor[];
  now: IsoDateTime;
  error?: boolean;
}

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('rounded-3xl bg-card shadow-card', className)}>{children}</section>;
}

/**
 * A record's History tab (layout option B): the record's entries grouped by month, newest first,
 * with field and person filters — the same pattern as Activity: a side panel on wide screens, one
 * Filters button opening a sheet below that (phone: from the bottom; tablet: from the side). The
 * panel comes first in the page's order and is drawn in the second column. State lives in the URL.
 */
export function RecordHistory({
  basePath,
  recordName,
  query,
  entries,
  total,
  fields,
  actors,
  now,
  error = false,
}: RecordHistoryProps) {
  const { t, has, locale } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const filtered = Boolean(query.field || query.actorId);

  function go(next: HistoryQuery) {
    startTransition(() => router.push(`${basePath}${historyQueryString(next)}`, { scroll: false }));
  }

  const latest = !filtered && query.page === 1 ? entries[0] : undefined;
  const fieldOptions = fields
    .map((f) => ({ value: f, label: fieldLabel(f, t, has) }))
    .sort((a, b) => a.label.localeCompare(b.label, locale));
  const actorOptions = actors.map((a) => ({ value: a.id, label: a.name || t('audit.system') }));
  const filterCount = (query.field ? 1 : 0) + (query.actorId ? 1 : 0);
  /** Both filters and the page, in one URL update. */
  const clearFilters = () => go({ page: 1 });
  const causes = [
    query.field ? t('audit.history.causes.field', { name: fieldLabel(query.field, t, has) }) : null,
    query.actorId
      ? t('audit.history.causes.person', {
          name: actorOptions.find((o) => o.value === query.actorId)?.label ?? t('audit.filters.person'),
        })
      : null,
  ].filter((c): c is string => c !== null);

  const selects = (
    <div className="grid gap-4">
      <div className="flex flex-col gap-2 text-xs font-bold text-muted-foreground">
        {t('audit.history.field')}
        <FilterSelect
          label={t('audit.history.field')}
          allLabel={t('audit.history.allFields')}
          value={query.field}
          options={fieldOptions}
          onChange={(field) => go({ ...query, field, page: 1 })}
          disabled={pending}
          className="w-full sm:w-full"
        />
      </div>
      <div className="flex flex-col gap-2 text-xs font-bold text-muted-foreground">
        {t('audit.history.who')}
        <FilterSelect
          label={t('audit.history.who')}
          allLabel={t('audit.history.anyone')}
          value={query.actorId}
          options={actorOptions}
          onChange={(actorId) => go({ ...query, actorId, page: 1 })}
          disabled={pending}
          className="w-full sm:w-full"
        />
      </div>
    </div>
  );

  let body: ReactNode;
  if (error) {
    body = <ErrorState onRetry={() => startTransition(() => router.refresh())} retrying={pending} />;
  } else if (entries.length === 0) {
    body = filtered ? (
      <EmptyState
        icon={SearchIcon}
        title={t('audit.history.noResultsTitle')}
        description={t('audit.history.noResultsBody', { causes: causes.join(t('audit.activity.causes.and')) })}
        action={<ClearFilters placement="empty" count={filterCount} onClear={clearFilters} />}
      />
    ) : (
      <EmptyState icon={HistoryIcon} title={t('audit.history.emptyTitle')} description={t('audit.history.emptyBody')} />
    );
  } else {
    body = (
      <div aria-busy={pending || undefined} className={cn('transition-opacity duration-150', pending && 'pointer-events-none opacity-55')}>
        <AuditTimeline entries={entries} grouping="month" now={now} label={t('audit.history.label')} />
      </div>
    );
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_17.5rem]">
      <aside
        aria-label={t('audit.filters.title')}
        className="hidden flex-col gap-4 rounded-3xl bg-card p-4.5 shadow-card lg:sticky lg:top-6 lg:order-2 lg:flex"
      >
        <div className="flex items-center gap-2">
          <h3 className="flex items-center gap-2 font-display text-base font-extrabold">
            <FilterIcon className="size-5 text-muted-foreground" />
            {t('audit.filters.title')}
          </h3>
          <ClearFilters count={filterCount} onClear={clearFilters} disabled={pending} className="ms-auto h-9 px-2.5" />
        </div>
        {selects}
        {latest ? (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold text-muted-foreground">{t('audit.history.lastChange')}</span>
            <div className="rounded-xl bg-muted px-3 py-2">
              <p className="text-[0.8125rem] font-bold break-words">
                {relativeAgo(latest.at, now, t) ?? formatShortDay(schoolDay(latest.at), locale)} ·{' '}
                <ActorName entry={latest} className="" />
              </p>
              {latest.changes[0] ? (
                <p className="text-xs text-muted-foreground">{fieldLabel(latest.changes[0].field, t, has)}</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </aside>

      <Panel className="@container min-w-0 lg:order-1">
        <header className="flex items-start gap-3 px-4 pt-5 @min-[34rem]:px-6">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h2 className="font-display text-lg font-extrabold">{t('audit.history.title')}</h2>
            <p className="text-sm text-muted-foreground">{t('audit.history.description', { name: recordName })}</p>
          </div>
          <AuditFiltersSheet count={filterCount} onClear={() => go({ page: 1 })} className="shrink-0 lg:hidden">
            {selects}
          </AuditFiltersSheet>
        </header>
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
      </Panel>
    </div>
  );
}

/**
 * The History tab while it loads: the side panel (wide screens) or the Filters button (below), and
 * a month timeline of one page. No translated text, so it renders before any messages load.
 */
export function RecordHistorySkeleton() {
  return (
    <div aria-busy="true" className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_17.5rem]">
      <div aria-hidden="true" className="hidden flex-col gap-4 rounded-3xl bg-card p-4.5 shadow-card lg:order-2 lg:flex">
        <span className="flex items-center gap-2">
          <FilterIcon className="size-5 text-muted-foreground" />
          <SkeletonText className="font-display text-base" width="w-16" />
        </span>
        {[0, 1].map((i) => (
          <div key={i} className="flex flex-col gap-2">
            <SkeletonText className="text-xs" width="w-14" />
            <Skeleton className="h-11 rounded-xl" />
          </div>
        ))}
      </div>
      <Panel className="@container min-w-0 lg:order-1">
        <div aria-hidden="true" className="flex items-start gap-3 px-4 pt-5 @min-[34rem]:px-6">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <SkeletonText className="font-display text-lg" width="w-36" />
            <SkeletonText className="text-sm" width="w-64" />
          </div>
          <Skeleton className="h-11 w-12 shrink-0 rounded-lg lg:hidden" />
        </div>
        <AuditTimelineSkeleton grouping="month" />
      </Panel>
    </div>
  );
}
