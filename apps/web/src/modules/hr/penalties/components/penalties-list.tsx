'use client';

import { PAGINATION, PENALTY_STATUSES, type Month, type PenaltyRecord, type PenaltyStatus } from '@school-erp/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import type { SelectOption, SelectOptionGroup } from '@/shared/components/form/fields';
import { MonthStepper } from '@/shared/components/form/month-stepper';
import { EmptyState } from '@/shared/components/layout/empty-state';
import { PageHeader } from '@/shared/components/layout/page-header';
import { Button } from '@/shared/components/ui/button';
import { AddIcon, CloseIcon, SearchIcon } from '@/shared/components/ui/icons';
import { Input } from '@/shared/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { formatMonth } from '@/shared/lib/format';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { penaltiesQueryString, type PenaltiesListQuery } from '../lib/list-query';
import { PenaltiesTable } from './penalties-table';
import { RecordPenaltyDialog } from './record-penalty-dialog';

const SEARCH_DEBOUNCE_MS = 300;
/** Radix Select items can't be empty; this one means "every status". */
const ALL = '__all__';

export interface PenaltiesListProps {
  /** `/ar/penalties`. */
  basePath: string;
  /** `/ar/employees`, for the employee links. */
  employeesPath: string;
  query: PenaltiesListQuery;
  /** This month: the default and the latest month the stepper reaches. */
  currentMonth: Month;
  rows: PenaltyRecord[];
  total: number;
  error?: boolean;
  /** For the record dialog: active employees and the violations in use. */
  employees: SelectOption[];
  violations: SelectOptionGroup[];
}

/** The month's penalties, filtered by status and a search, with "Record a penalty". */
export function PenaltiesList({
  basePath,
  employeesPath,
  query,
  currentMonth,
  rows,
  total,
  error = false,
  employees,
  violations,
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

  function clearFilters() {
    setSearch('');
    go({ month: query.month, page: PAGINATION.defaultPage, limit: query.limit });
  }

  const filtered = Boolean(query.search || query.status);
  const recordButton = (
    <Button variant="primary" className="cursor-pointer" onClick={() => setRecording(true)}>
      <AddIcon />
      {t('penalties.record')}
    </Button>
  );

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
              disabled={pending}
              label={t('penalties.month')}
            />
            {recordButton}
          </>
        }
      />
      <PenaltiesTable
        label={t('penalties.tableLabel', { month: formatMonth(query.month, locale) })}
        rows={rows}
        employeesPath={employeesPath}
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
              action={
                <Button variant="secondary" className="cursor-pointer" onClick={clearFilters}>
                  <CloseIcon />
                  {t('penalties.list.clearFilters')}
                </Button>
              }
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
          onLimitChange: (limit) => go({ ...query, limit, page: PAGINATION.defaultPage }),
        }}
        toolbar={
          <div role="search" className="flex w-full flex-wrap items-center gap-2.5">
            <div className="relative min-w-0 flex-1 basis-64">
              <SearchIcon className="pointer-events-none absolute inset-y-0 start-3.5 my-auto size-5 text-muted-foreground" />
              <Input
                aria-label={t('penalties.filters.searchLabel')}
                placeholder={t('penalties.filters.searchPlaceholder')}
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                className="ps-11"
              />
            </div>
            <Select
              value={query.status ?? ALL}
              onValueChange={(v) =>
                go({ ...query, status: v === ALL ? undefined : (v as PenaltyStatus), page: PAGINATION.defaultPage })
              }
            >
              <SelectTrigger aria-label={t('penalties.filters.status')} className="w-full sm:w-48">
                <SelectValue placeholder={t('penalties.filters.allStatuses')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('penalties.filters.allStatuses')}</SelectItem>
                {PENALTY_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`common.enums.penaltyStatus.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />
      <RecordPenaltyDialog open={recording} onOpenChange={setRecording} employees={employees} violations={violations} />
    </div>
  );
}
