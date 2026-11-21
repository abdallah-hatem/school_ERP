'use client';

import { useCan } from '@/core/auth';
import {
  PAGINATION,
  PENALTY_STATUS_FILTERS,
  type ListItem,
  type Month,
  type PenaltyRecord,
  type PenaltyStatusFilter,
} from '@school-erp/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { ClearFilters, FilterSelect, SearchInput } from '@/shared/components/form/filter-controls';
import { MonthStepper } from '@/shared/components/form/month-stepper';
import { EmptyState } from '@/shared/components/layout/empty-state';
import { PageHeader } from '@/shared/components/layout/page-header';
import { Button } from '@/shared/components/ui/button';
import { AddIcon, SearchIcon } from '@/shared/components/ui/icons';
import { formatMonth } from '@/shared/lib/format';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { GET_STAGES } from '../../employees/apis';
import { useListItemOptions } from '../../employees/lib/list-item-options';
import { penaltiesQueryString, type PenaltiesListQuery } from '../lib/list-query';
import { PenaltiesTable } from './penalties-table';
import { PenaltyDetailsDialog } from './penalty-details-dialog';
import { RecordPenaltyDialog } from './record-penalty-dialog';

const SEARCH_DEBOUNCE_MS = 300;

export interface PenaltiesListProps {
  /** `/ar/penalties`. */
  basePath: string;
  query: PenaltiesListQuery;
  /** This month: the default and the latest month the stepper reaches. */
  currentMonth: Month;
  /** `undefined` on first load (the route's skeleton): skeleton rows, controls disabled. */
  rows: PenaltyRecord[] | undefined;
  total: number;
  error?: boolean;
  /** The penalty a link opens (`?penalty=<id>`, a notification's): shown over the list. */
  focused?: PenaltyRecord;
  /** The stage filter's chosen stage (its name shows before the picker's first answer). */
  selectedStage?: ListItem | null;
}

/** The month's penalties, filtered by status and a search, with "Record a penalty". */
export function PenaltiesList({
  basePath,
  query,
  currentMonth,
  rows,
  total,
  error = false,
  focused,
  selectedStage = null,
}: PenaltiesListProps) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(query.search ?? '');
  const [recording, setRecording] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    [],
  );

  // Every list control updates the URL in place: no scroll to top, the rows dim while it loads.
  function go(next: PenaltiesListQuery) {
    startTransition(() => router.push(`${basePath}${penaltiesQueryString(next, currentMonth)}`, { scroll: false }));
  }

  function onSearchChange(text: string) {
    setSearch(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(
      () => go({ ...query, search: text.trim() || undefined, page: PAGINATION.defaultPage }),
      SEARCH_DEBOUNCE_MS,
    );
  }

  /** Search, status and the page in one URL update; the month is the period, not a filter. */
  function clearFilters() {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setSearch('');
    go({ month: query.month, page: PAGINATION.defaultPage, limit: query.limit });
  }

  const canRecord = useCan()('hr.penalties.record');
  const filterCount = (query.search ? 1 : 0) + (query.status ? 1 : 0) + (query.stageId ? 1 : 0);
  // Where it happened (owner 2026-11-21); hidden stages too — they can still have penalties.
  const stageOptions = useListItemOptions(GET_STAGES, locale, { includeHidden: true, selected: selectedStage });
  const filtered = filterCount > 0;
  const loading = rows === undefined;
  // R6: only someone who may record a penalty sees the button.
  const recordButton = canRecord ? (
    <Button variant="primary" className="cursor-pointer" disabled={loading} onClick={() => setRecording(true)}>
      <AddIcon />
      {t('penalties.record')}
    </Button>
  ) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('penalties.title')}
        description={t('penalties.description')}
        actions={
          <>
            <MonthStepper
              month={query.month}
              max={currentMonth}
              onChange={(month) => go({ ...query, month, page: PAGINATION.defaultPage })}
              disabled={pending || loading}
              label={t('penalties.month')}
            />
            {recordButton}
          </>
        }
      />
      <PenaltiesTable
        label={t('penalties.tableLabel', { month: formatMonth(query.month, locale) })}
        rows={rows}
        refreshing={pending}
        error={error}
        retrying={pending && error}
        onRetry={() => startTransition(() => router.refresh())}
        empty={
          filtered ? (
            <EmptyState
              icon={SearchIcon}
              title={t('penalties.list.noResultsTitle')}
              description={t('penalties.list.noResultsBody')}
              action={<ClearFilters placement="empty" count={filterCount} onClear={clearFilters} />}
            />
          ) : (
            <EmptyState title={t('penalties.list.emptyTitle')} description={t('penalties.list.emptyBody')} action={recordButton} />
          )
        }
        pagination={{
          page: query.page,
          limit: query.limit,
          total,
          onPageChange: (page) => go({ ...query, page }),
        }}
        toolbar={
          <div role="search" className="flex w-full flex-wrap items-center gap-2.5">
            <SearchInput
              aria-label={t('penalties.filters.searchLabel')}
              placeholder={t('penalties.filters.searchPlaceholder')}
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              disabled={loading}
              loading={pending}
            />
            <FilterSelect
              label={t('penalties.filters.status')}
              allLabel={t('penalties.filters.allStatuses')}
              value={query.status}
              options={PENALTY_STATUS_FILTERS.map((s) => ({
                value: s,
                label: s === 'OPEN' ? t('penalties.filters.open') : t(`common.enums.penaltyStatus.${s}`),
              }))}
              onChange={(v) => go({ ...query, status: v as PenaltyStatusFilter | undefined, page: PAGINATION.defaultPage })}
              disabled={loading}
            />
            <FilterSelect
              label={t('penalties.filters.stage')}
              allLabel={t('penalties.filters.allStages')}
              value={query.stageId}
              server={stageOptions}
              onChange={(v) => go({ ...query, stageId: v, page: PAGINATION.defaultPage })}
              disabled={loading}
            />
            <ClearFilters count={filterCount} onClear={clearFilters} disabled={loading || pending} className="ms-auto" />
          </div>
        }
      />
      <PenaltyDetailsDialog
        record={focused}
        onClose={() => router.push(`${basePath}${penaltiesQueryString(query, currentMonth)}`, { scroll: false })}
      />
      <RecordPenaltyDialog open={recording} onOpenChange={setRecording} />
    </div>
  );
}
