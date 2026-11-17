'use client';

import type { AuditActor, AuditEntry, IsoDateTime } from '@school-erp/shared';
import { useRouter } from 'next/navigation';
import { useTransition, type ReactNode } from 'react';
import { Pagination } from '@/shared/components/data-table/pagination';
import { FilterSelect } from '@/shared/components/form/filter-controls';
import { EmptyState, ErrorState } from '@/shared/components/layout/empty-state';
import { Button } from '@/shared/components/ui/button';
import { CloseIcon, FilterIcon, HistoryIcon, SearchIcon } from '@/shared/components/ui/icons';
import { Skeleton, SkeletonText } from '@/shared/components/ui/skeleton';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { actorName, fieldLabel } from '../lib/entry-text';
import { AUDIT_PAGE_SIZE, historyQueryString, type HistoryQuery } from '../lib/history-query';
import { formatShortDay, relativeAgo, schoolDay } from '../lib/time';
import { AuditTimeline, AuditTimelineSkeleton } from './timeline';

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
 * with field and person filters beside them (above on a phone). State lives in the URL.
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

  let body: ReactNode;
  if (error) {
    body = <ErrorState onRetry={() => startTransition(() => router.refresh())} retrying={pending} />;
  } else if (entries.length === 0) {
    body = filtered ? (
      <EmptyState
        icon={SearchIcon}
        title={t('audit.history.noResultsTitle')}
        description={t('audit.history.noResultsBody')}
        action={
          <Button variant="secondary" onClick={() => go({ page: 1 })}>
            <CloseIcon />
            {t('audit.filters.clear')}
          </Button>
        }
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
        className="flex flex-col gap-4 rounded-3xl bg-card p-4.5 shadow-card lg:sticky lg:top-6 lg:order-2"
      >
        <h3 className="flex items-center gap-2 font-display text-base font-extrabold">
          <FilterIcon className="size-5 text-muted-foreground" />
          {t('audit.filters.title')}
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
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
        {latest ? (
          <div className="hidden flex-col gap-2 lg:flex">
            <span className="text-xs font-bold text-muted-foreground">{t('audit.history.lastChange')}</span>
            <div className="rounded-xl bg-muted px-3 py-2">
              <p className="text-[0.8125rem] font-bold break-words">
                {relativeAgo(latest.at, now, t) ?? formatShortDay(schoolDay(latest.at), locale)} · {actorName(latest, t)}
              </p>
              {latest.changes[0] ? (
                <p className="text-xs text-muted-foreground">{fieldLabel(latest.changes[0].field, t, has)}</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </aside>

      <Panel className="@container min-w-0 lg:order-1">
        <header className="flex flex-col gap-0.5 px-4 pt-5 @min-[34rem]:px-6">
          <h2 className="font-display text-lg font-extrabold">{t('audit.history.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('audit.history.description', { name: recordName })}</p>
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

/** The History tab while it loads: the filters card and a month timeline of one page. */
export function RecordHistorySkeleton() {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_17.5rem]">
      <div aria-hidden="true" className="flex flex-col gap-4 rounded-3xl bg-card p-4.5 shadow-card lg:order-2">
        <span className="flex items-center gap-2">
          <FilterIcon className="size-5 text-muted-foreground" />
          <SkeletonText className="font-display text-base" width="w-16" />
        </span>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          {[0, 1].map((i) => (
            <div key={i} className="flex flex-col gap-2">
              <SkeletonText className="text-xs" width="w-14" />
              <Skeleton className="h-11 rounded-xl" />
            </div>
          ))}
        </div>
      </div>
      <Panel className="@container min-w-0 lg:order-1">
        <div aria-hidden="true" className="flex flex-col gap-0.5 px-4 pt-5 @min-[34rem]:px-6">
          <SkeletonText className="font-display text-lg" width="w-36" />
          <SkeletonText className="text-sm" width="w-64" />
        </div>
        <AuditTimelineSkeleton grouping="month" />
      </Panel>
    </div>
  );
}
