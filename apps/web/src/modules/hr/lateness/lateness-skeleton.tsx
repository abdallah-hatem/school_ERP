'use client';

import { DataTable, type DataTableColumn } from '@/shared/components/data-table/data-table';
import { PageHeader } from '@/shared/components/layout/page-header';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { useTranslation } from '@/shared/providers/i18n-provider';

const COLUMNS: DataTableColumn<never>[] = ['code', 'employee', 'department', 'minutes', 'days'].map((id) => ({
  id,
  header: '',
  cell: () => null,
}));

/** First load of the lateness screen: the header and the grid's shape, nothing that shifts. */
export function LatenessSkeleton() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t('common.nav.lateness')}
        actions={
          <>
            <Skeleton className="h-11 w-56 rounded-xl" />
            <Skeleton className="h-11 w-28" />
          </>
        }
      />
      <DataTable label={t('common.nav.lateness')} columns={COLUMNS} rows={undefined} getRowId={() => ''} loading />
    </div>
  );
}
