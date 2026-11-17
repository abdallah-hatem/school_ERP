'use client';

import {
  EMPLOYEE_STATUSES,
  PAGINATION,
  WORK_SYSTEMS,
  type EmployeeSummary,
  type ListItem,
} from '@school-erp/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { DataTable, type DataTableColumn } from '@/shared/components/data-table/data-table';
import { EmptyState } from '@/shared/components/layout/empty-state';
import { PageHeader } from '@/shared/components/layout/page-header';
import { Button } from '@/shared/components/ui/button';
import { Money } from '@/shared/components/ui/figures';
import { AddIcon, CloseIcon, SearchIcon } from '@/shared/components/ui/icons';
import { Input } from '@/shared/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { localName } from '@/shared/lib/i18n';
import { useTranslation } from '@/shared/providers/i18n-provider';
import {
  employeesQueryString,
  hasActiveFilters,
  type EmployeesFilterKey,
  type EmployeesListQuery,
} from '../lib/list-query';
import { EmployeeIdentity, EmployeeStatusPill } from './employee-bits';

const SEARCH_DEBOUNCE_MS = 300;
/** Radix Select items can't be empty; this one means "no filter". */
const ALL = '__all__';

export interface EmployeesListProps {
  /** `/ar/employees` — the list's own path, for links and URL updates. */
  basePath: string;
  query: EmployeesListQuery;
  rows: EmployeeSummary[];
  total: number;
  /** Every department and stage, hidden ones too — hidden items can still have employees. */
  departments: ListItem[];
  stages: ListItem[];
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

  function clearFilters() {
    setSearch('');
    go({ page: PAGINATION.defaultPage, limit: query.limit });
  }

  const filtered = hasActiveFilters(query);
  const itemOptions = (items: ListItem[]) =>
    [...items].sort((a, b) => a.sortOrder - b.sortOrder).map((i) => ({ value: i.id, label: localName(i, locale) }));

  const columns: DataTableColumn<EmployeeSummary>[] = [
    {
      id: 'employee',
      header: t('employees.columns.employee'),
      cell: (e) => <EmployeeIdentity employee={e} href={`${basePath}/${e.id}`} />,
      card: 'title',
      className: 'min-w-56',
    },
    { id: 'department', header: t('employees.columns.department'), cell: (e) => localName(e.department, locale) },
    { id: 'stage', header: t('employees.columns.stage'), cell: (e) => localName(e.stage, locale) },
    { id: 'jobTitle', header: t('employees.columns.jobTitle'), cell: (e) => localName(e.jobTitle, locale) },
    {
      id: 'workSystem',
      header: t('employees.columns.workSystem'),
      cell: (e) => t(`common.enums.workSystem.${e.workSystem}`),
    },
    {
      id: 'basicSalary',
      header: t('employees.columns.basicSalary'),
      cell: (e) => <Money value={e.basicSalary} />,
      align: 'end',
      // Wide enough for EGP 2,147,483.47 — the largest salary the API stores.
      className: 'w-40 min-w-40',
    },
    {
      id: 'status',
      header: t('employees.columns.status'),
      cell: (e) => <EmployeeStatusPill status={e.status} />,
      card: 'status',
      className: 'w-28',
    },
  ];

  const addButton = (
    <Button asChild variant="primary">
      <Link href={`${basePath}/new`}>
        <AddIcon />
        {t('employees.add')}
      </Link>
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('employees.title')} description={t('employees.description')} actions={addButton} />
      <DataTable
        label={t('employees.list.label')}
        columns={columns}
        rows={rows}
        getRowId={(e) => e.id}
        refreshing={pending}
        error={error}
        retrying={pending && error}
        onRetry={() => startTransition(() => router.refresh())}
        empty={
          filtered ? (
            <EmptyState
              icon={SearchIcon}
              title={t('employees.list.noResultsTitle')}
              description={t('employees.list.noResultsBody')}
              action={
                <Button variant="secondary" onClick={clearFilters}>
                  <CloseIcon />
                  {t('employees.list.clearFilters')}
                </Button>
              }
            />
          ) : (
            <EmptyState
              title={t('employees.list.emptyTitle')}
              description={t('employees.list.emptyBody')}
              action={addButton}
            />
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
                aria-label={t('employees.list.searchLabel')}
                placeholder={t('employees.list.searchPlaceholder')}
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                className="ps-11"
              />
            </div>
            <FilterSelect
              label={t('employees.columns.department')}
              allLabel={t('employees.list.allDepartments')}
              value={query.departmentId}
              options={itemOptions(departments)}
              onChange={(v) => setFilter('departmentId', v)}
            />
            <FilterSelect
              label={t('employees.columns.stage')}
              allLabel={t('employees.list.allStages')}
              value={query.stageId}
              options={itemOptions(stages)}
              onChange={(v) => setFilter('stageId', v)}
            />
            <FilterSelect
              label={t('employees.columns.status')}
              allLabel={t('employees.list.allStatuses')}
              value={query.status}
              options={EMPLOYEE_STATUSES.map((s) => ({ value: s, label: t(`common.enums.employeeStatus.${s}`) }))}
              onChange={(v) => setFilter('status', v)}
            />
            <FilterSelect
              label={t('employees.columns.workSystem')}
              allLabel={t('employees.list.allWorkSystems')}
              value={query.workSystem}
              options={WORK_SYSTEMS.map((w) => ({ value: w, label: t(`common.enums.workSystem.${w}`) }))}
              onChange={(v) => setFilter('workSystem', v)}
            />
          </div>
        }
      />
    </div>
  );
}

function FilterSelect({
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  label: string;
  allLabel: string;
  value: string | undefined;
  options: { value: string; label: string }[];
  onChange: (value: string | undefined) => void;
}) {
  return (
    <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? undefined : v)}>
      <SelectTrigger aria-label={label} className="w-full sm:w-48">
        <SelectValue placeholder={allLabel} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
