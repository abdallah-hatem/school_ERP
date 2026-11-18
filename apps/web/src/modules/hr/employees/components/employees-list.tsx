'use client';

import {
  EMPLOYEE_STATUSES,
  PAGINATION,
  WORK_SYSTEMS,
  type EmployeeSummary,
  type ListItem,
  type Stage,
} from '@school-erp/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { Can } from '@/core/auth';
import { Pagination } from '@/shared/components/data-table/pagination';
import { EmptyState, ErrorState } from '@/shared/components/layout/empty-state';
import { PageHeader } from '@/shared/components/layout/page-header';
import { Button } from '@/shared/components/ui/button';
import { AddIcon, SearchIcon } from '@/shared/components/ui/icons';
import { Input } from '@/shared/components/ui/input';
import { ClearFilters, FilterSelect } from '@/shared/components/form/filter-controls';
import { formatCount } from '@/shared/lib/format';
import { SkeletonText } from '@/shared/components/ui/skeleton';
import { localName } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import {
  activeFilterCount,
  employeesQueryString,
  type EmployeesFilterKey,
  type EmployeesListQuery,
} from '../lib/list-query';
import { stageBandOf } from '../lib/stage-band';
import { EmployeeCard, EmployeeCardGrid, EmployeeCardSkeleton } from './employee-card';

const SEARCH_DEBOUNCE_MS = 300;

export interface EmployeesListProps {
  /** `/ar/employees` — the list's own path, for links and URL updates. */
  basePath: string;
  query: EmployeesListQuery;
  /** `undefined` while the first page loads: the list draws itself with skeleton cards. */
  rows: EmployeeSummary[] | undefined;
  total: number;
  /** Every department and stage, hidden ones too — hidden items can still have employees. */
  departments: ListItem[];
  stages: Stage[];
  error?: boolean;
}

export function EmployeesList({ basePath, query, rows, total, departments, stages, error = false }: EmployeesListProps) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(query.search ?? '');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
  }, []);

  // Every list control updates the URL in place: no scroll to top, the rows dim while it loads.
  function go(next: EmployeesListQuery) {
    startTransition(() => router.push(`${basePath}${employeesQueryString(next)}`, { scroll: false }));
  }

  function setFilter(key: EmployeesFilterKey, value: string | undefined) {
    go({ ...query, [key]: value || undefined, page: PAGINATION.defaultPage });
  }

  function onSearchChange(text: string) {
    setSearch(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setFilter('search', text.trim()), SEARCH_DEBOUNCE_MS);
  }

  /** Search, every filter and the page, in one URL update. */
  function clearFilters() {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setSearch('');
    go({ page: PAGINATION.defaultPage, limit: query.limit });
  }

  const loading = rows === undefined;
  const filterCount = activeFilterCount(query);
  const filtered = filterCount > 0;
  const itemOptions = (items: ListItem[]) =>
    [...items].sort((a, b) => a.sortOrder - b.sortOrder).map((i) => ({ value: i.id, label: localName(i, locale), keywords: [i.nameEn, i.nameAr] }));

  const addButton = (
    <Can permission="hr.employees.create">
      <Button asChild variant="primary">
        <Link href={`${basePath}/new`}>
          <AddIcon />
          {t('employees.add')}
        </Link>
      </Button>
    </Can>
  );

  const emptyState = filtered ? (
    <EmptyState
      icon={SearchIcon}
      title={t('employees.list.noResultsTitle')}
      description={t('employees.list.noResultsBody')}
      action={<ClearFilters placement="empty" count={filterCount} onClear={clearFilters} />}
    />
  ) : (
    <EmptyState title={t('employees.list.emptyTitle')} description={t('employees.list.emptyBody')} action={addButton} />
  );

  let body: ReactNode;
  if (loading) {
    // First load: a full page of cards in the same grid and frame, so nothing moves when they land.
    body = (
      <div aria-busy="true">
        <span role="status" className="sr-only">
          {t('ui.states.loading')}
        </span>
        <EmployeeCardGrid>
          {Array.from({ length: query.limit }, (_, i) => (
            <li key={i} className="min-w-0" data-testid="employee-card-skeleton">
              <EmployeeCardSkeleton />
            </li>
          ))}
        </EmployeeCardGrid>
      </div>
    );
  } else if (error) {
    body = (
      <div className="rounded-3xl bg-card shadow-card">
        <ErrorState onRetry={() => startTransition(() => router.refresh())} retrying={pending} />
      </div>
    );
  } else if (rows.length === 0) {
    body = <div className="rounded-3xl bg-card shadow-card">{emptyState}</div>;
  } else {
    body = (
      // A new page or filter keeps the current cards in place, dimmed, until the next ones land.
      <div
        aria-busy={pending || undefined}
        className={cn('transition-opacity duration-150', pending && 'pointer-events-none opacity-55')}
      >
        <EmployeeCardGrid>
          {rows.map((e) => (
            <li key={e.id} className="min-w-0">
              <EmployeeCard employee={e} band={stageBandOf(e.stage.id, stages)} href={`${basePath}/${e.id}`} />
            </li>
          ))}
        </EmployeeCardGrid>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('employees.title')} description={t('employees.description')} actions={addButton} />
      <section aria-label={t('employees.list.label')} className="flex min-w-0 flex-col gap-4.5">
        <div data-skeleton-block="filters" className="flex flex-col gap-3 rounded-[1.25rem] bg-card p-3.5 shadow-card">
          {/* One row on a wide content area; search above a row of four (tablet) or a 2 × 2 grid (phone). */}
          <div role="search" className="flex w-full flex-col gap-2.5 @min-[1000px]:flex-row @min-[1000px]:items-center">
            <div className="relative min-w-0 flex-1">
              <SearchIcon className="pointer-events-none absolute inset-y-0 start-3.5 my-auto size-5 text-muted-foreground" />
              <Input
                aria-label={t('employees.list.searchLabel')}
                placeholder={t('employees.list.searchPlaceholder')}
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                disabled={loading}
                className="ps-11"
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5 @min-[620px]:grid-cols-4 @min-[1000px]:flex">
              <FilterSelect
                label={t('employees.columns.department')}
                allLabel={t('employees.list.allDepartments')}
                value={query.departmentId}
                options={itemOptions(departments)}
                searchable
                onChange={(v) => setFilter('departmentId', v)}
                disabled={loading}
                className="w-full sm:w-full @min-[1000px]:w-44"
              />
              <FilterSelect
                label={t('employees.columns.stage')}
                allLabel={t('employees.list.allStages')}
                value={query.stageId}
                options={itemOptions(stages)}
                searchable
                onChange={(v) => setFilter('stageId', v)}
                disabled={loading}
                className="w-full sm:w-full @min-[1000px]:w-44"
              />
              <FilterSelect
                label={t('employees.columns.status')}
                allLabel={t('employees.list.allStatuses')}
                value={query.status}
                options={EMPLOYEE_STATUSES.map((s) => ({ value: s, label: t(`common.enums.employeeStatus.${s}`) }))}
                onChange={(v) => setFilter('status', v)}
                disabled={loading}
                className="w-full sm:w-full @min-[1000px]:w-44"
              />
              <FilterSelect
                label={t('employees.columns.workSystem')}
                allLabel={t('employees.list.allWorkSystems')}
                value={query.workSystem}
                options={WORK_SYSTEMS.map((w) => ({ value: w, label: t(`common.enums.workSystem.${w}`) }))}
                onChange={(v) => setFilter('workSystem', v)}
                disabled={loading}
                className="w-full sm:w-full @min-[1000px]:w-44"
              />
            </div>
          </div>
          {/* The count, and "Clear filters · n" at the inline end — its own line, so a phone keeps it in view. */}
          {error && !filtered ? null : (
            <div className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1">
              {error ? null : loading ? (
                <SkeletonText className="px-1 text-[0.8rem]" width="w-24" />
              ) : (
                <p aria-live="polite" data-testid="employees-count" className="px-1 text-[0.8rem] text-muted-foreground">
                  {t('employees.list.count', { count: formatCount(total) })}
                </p>
              )}
              <ClearFilters count={filterCount} onClear={clearFilters} disabled={pending || loading} className="ms-auto h-9" />
            </div>
          )}
        </div>
        {body}
        {error ? null : (
          <Pagination
            page={query.page}
            limit={query.limit}
            total={total}
            onPageChange={(page) => go({ ...query, page })}
            disabled={pending || loading}
            loading={loading}
            className="border-t-0 px-0.5 py-1 sm:px-0.5"
          />
        )}
      </section>
    </div>
  );
}
