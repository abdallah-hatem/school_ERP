'use client';

import { PAGINATION } from '@school-erp/shared';
import { DataTable, type DataTableColumn } from '@/shared/components/data-table/data-table';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { useTranslation } from '@/shared/providers/i18n-provider';

const COLUMN_IDS = ['date', 'employee', 'violation', 'level', 'action', 'status', 'actions'];
const columns: DataTableColumn<never>[] = COLUMN_IDS.map((id) => ({ id, header: '', cell: () => null }));

/** The list's first load: header with the month stepper and button, toolbar, a page of rows. */
export function PenaltiesSkeleton() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="flex flex-1 basis-64 flex-col gap-2">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="flex gap-2.5">
          <Skeleton className="h-11 w-56 rounded-xl" />
          <Skeleton className="h-11 w-40 rounded-lg" />
        </div>
      </div>
      <DataTable
        label={t('common.nav.penalties')}
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
