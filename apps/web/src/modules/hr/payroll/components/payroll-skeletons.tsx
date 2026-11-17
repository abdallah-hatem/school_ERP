'use client';

import type { DataTableColumn } from '@/shared/components/data-table/data-table';
import { DataTable } from '@/shared/components/data-table/data-table';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { StatTile } from '@/shared/components/ui/stat-tile';
import { useTranslation } from '@/shared/providers/i18n-provider';

const blank = (id: string, className?: string): DataTableColumn<never> => ({
  id,
  header: '',
  className,
  cell: () => null,
});

function HeaderSkeleton({ actions }: { actions: number }) {
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
      <div className="flex min-w-0 flex-1 basis-64 flex-col gap-2">
        <Skeleton className="h-9 w-64 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="flex gap-2.5">
        {Array.from({ length: actions }, (_, i) => (
          <Skeleton key={i} className="h-11 w-36 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/** The runs list while it loads: header, then the table's skeleton rows. */
export function RunsListSkeleton() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-5">
      <HeaderSkeleton actions={1} />
      <DataTable
        label={t('ui.states.loading')}
        loading
        rows={undefined}
        getRowId={() => ''}
        columns={[blank('a'), blank('b'), blank('c'), blank('d'), blank('e')]}
      />
    </div>
  );
}

/** A run while it loads: header, four tiles, the table and the rules panel. */
export function RunPageSkeleton() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-6">
      <HeaderSkeleton actions={3} />
      <div className="grid grid-cols-1 gap-4 @min-[520px]:grid-cols-2 @min-[1080px]:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <StatTile
            key={i}
            loading
            label={<Skeleton className="h-4 w-24" />}
            value={null}
            tone={i === 3 ? 'feature' : 'primary'}
          />
        ))}
      </div>
      <div className="grid items-start gap-5 @min-[1380px]:grid-cols-[minmax(0,1fr)_20rem]">
        <DataTable
          label={t('ui.states.loading')}
          loading
          rows={undefined}
          getRowId={() => ''}
          columns={[blank('a'), blank('b'), blank('c'), blank('d'), blank('e'), blank('f')]}
        />
        <Skeleton className="h-96 rounded-3xl" />
      </div>
    </div>
  );
}

/** The payslip while it loads: an A4-shaped card. */
export function PayslipSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-between gap-3">
        <Skeleton className="h-11 w-40 rounded-lg" />
        <Skeleton className="h-11 w-28 rounded-lg" />
      </div>
      <Skeleton className="mx-auto h-[70vh] w-full max-w-[210mm] rounded-3xl" />
    </div>
  );
}
