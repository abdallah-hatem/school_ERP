'use client';

import { PAGINATION } from '@school-erp/shared';
import { DataTable, type DataTableColumn } from '@/shared/components/data-table/data-table';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { useTranslation } from '@/shared/providers/i18n-provider';

const COLUMN_IDS = ['employee', 'department', 'stage', 'jobTitle', 'workSystem', 'basicSalary', 'status'];
const columns: DataTableColumn<never>[] = COLUMN_IDS.map((id) => ({ id, header: '', cell: () => null }));

function HeaderSkeleton({ actions = 1 }: { actions?: number }) {
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
      <div className="flex flex-1 basis-64 flex-col gap-2">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="flex gap-2.5">
        {Array.from({ length: actions }, (_, i) => (
          <Skeleton key={i} className="h-11 w-36 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/** The list's first load: header, toolbar and a page of skeleton rows (same shape as the table). */
export function EmployeesListSkeleton() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-6">
      <HeaderSkeleton />
      <DataTable
        label={t('common.nav.employees')}
        columns={columns}
        rows={undefined}
        getRowId={() => ''}
        loading
        toolbar={<Skeleton className="h-11 w-full rounded-lg" />}
        pagination={{ page: 1, limit: PAGINATION.defaultLimit, total: 0, onPageChange: () => undefined }}
      />
    </div>
  );
}

/** Profile and form pages: header with actions and the three section cards. */
export function EmployeePageSkeleton() {
  const { t } = useTranslation();
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <span role="status" className="sr-only">
        {t('ui.states.loading')}
      </span>
      <HeaderSkeleton actions={2} />
      {[6, 6, 4].map((fields, i) => (
        <div key={i} className="flex flex-col gap-4 rounded-3xl bg-card p-5 shadow-card md:p-6">
          <Skeleton className="h-6 w-40" />
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: fields }, (_, j) => (
              <Skeleton key={j} className="h-15 rounded-xl" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
