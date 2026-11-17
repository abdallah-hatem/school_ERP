'use client';

import { DataTable, type DataTableColumn } from '@/shared/components/data-table/data-table';
import { RowActionsSkeleton } from '@/shared/components/data-table/row-actions';
import { Skeleton, SkeletonIdentity, SkeletonPill, SkeletonText } from '@/shared/components/ui/skeleton';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { USERS_PAGE_SIZE } from '../lib/users-query';

/*
 * The Users, Roles and My account pages while they load: the same boxes each page draws, so
 * nothing moves when it lands. Only `common` / `ui` text: `loading.tsx` renders before the page's
 * own messages are known.
 */

function HeaderSkeleton({ action = true, crumbs = true }: { action?: boolean; crumbs?: boolean }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3">
      {crumbs ? <SkeletonText className="hidden text-sm md:block" width="w-40" /> : null}
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-64 flex-col gap-1">
          <SkeletonText className="font-display text-2xl leading-tight md:text-3xl" width="w-40" />
          <SkeletonText className="text-sm" width="w-96" />
        </div>
        {action ? <Skeleton className="h-11 w-36 rounded-lg" /> : null}
      </div>
    </div>
  );
}

const bar = (width: string) => <Skeleton className={`h-3 ${width}`} />;

/** Users: header, the search + filters card and a page of 10 skeleton rows in the table's shape. */
export function UsersListSkeleton() {
  const { t } = useTranslation();
  const columns: DataTableColumn<number>[] = [
    { id: 'name', header: bar('w-12'), card: 'title', className: 'min-w-48', skeleton: <SkeletonIdentity />, cell: () => null },
    { id: 'email', header: bar('w-12'), card: 'hidden', className: 'max-w-56', cell: () => null },
    { id: 'roles', header: bar('w-12'), card: 'wide', className: 'min-w-44', skeleton: <SkeletonPill className="w-24" />, cell: () => null },
    { id: 'employee', header: bar('w-24'), className: 'w-40', cell: () => null },
    { id: 'status', header: bar('w-12'), card: 'status', className: 'w-28', skeleton: <SkeletonPill />, cell: () => null },
    { id: 'lastSignIn', header: bar('w-20'), className: 'w-44', cell: () => null },
    { id: 'actions', header: <span />, card: 'menu', align: 'end', className: 'w-16', skeleton: <RowActionsSkeleton />, cell: () => null },
  ];
  return (
    <div className="flex flex-col gap-6">
      <HeaderSkeleton />
      <div className="@container flex min-w-0 flex-col gap-4.5">
        <div aria-hidden="true" className="flex flex-col gap-3 rounded-[1.25rem] bg-card p-3.5 shadow-card">
          <div className="flex flex-col gap-2.5 @min-[900px]:flex-row">
            <Skeleton className="h-11 flex-1 rounded-lg" />
            <Skeleton className="h-11 w-full rounded-lg @min-[900px]:w-60" />
            <Skeleton className="h-11 w-full rounded-lg @min-[900px]:w-52" />
          </div>
          <SkeletonText className="mx-1 text-[0.8rem]" width="w-16" />
        </div>
        <DataTable
          label={t('common.nav.users')}
          columns={columns}
          rows={undefined}
          getRowId={String}
          loading
          cardsBelow={1100}
          pagination={{ page: 1, limit: USERS_PAGE_SIZE, total: 0, onPageChange: () => undefined }}
        />
      </div>
    </div>
  );
}

/** Roles: header and the table of roles (a school has about nine). */
export function RolesListSkeleton() {
  const { t } = useTranslation();
  const columns: DataTableColumn<number>[] = [
    { id: 'role', header: bar('w-10'), card: 'title', className: 'min-w-60', skeleton: <SkeletonIdentity />, cell: () => null },
    { id: 'type', header: bar('w-10'), card: 'status', className: 'w-32', skeleton: <SkeletonPill />, cell: () => null },
    { id: 'permissions', header: bar('w-20'), className: 'w-44', cell: () => null },
    { id: 'heldBy', header: bar('w-14'), className: 'w-48', cell: () => null },
    { id: 'actions', header: <span />, card: 'menu', align: 'end', className: 'w-16', skeleton: <RowActionsSkeleton />, cell: () => null },
  ];
  return (
    <div className="flex flex-col gap-6">
      <HeaderSkeleton />
      <DataTable
        label={t('common.nav.roles')}
        columns={columns}
        rows={undefined}
        getRowId={String}
        loading
      />
    </div>
  );
}

function CardSkeleton({ lines = 2, tall = false }: { lines?: number; tall?: boolean }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-4 rounded-3xl bg-card p-5 shadow-card md:p-6">
      <SkeletonText className="font-display text-lg" width="w-32" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={tall ? 'h-16 w-full rounded-xl' : 'h-11 w-full rounded-lg'} />
      ))}
    </div>
  );
}

/** A user's page, a role's page or My account: header, the main cards and the side cards. */
export function FormPageSkeleton({ kind }: { kind: 'user' | 'role' | 'account' }) {
  const { t } = useTranslation();
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <span role="status" className="sr-only">
        {t('ui.states.loading')}
      </span>
      <HeaderSkeleton action={false} crumbs={kind !== 'account'} />
      <div className="@container">
        <div className="grid items-start gap-5 @min-[1000px]:grid-cols-[minmax(0,1fr)_21rem]">
          <div className="flex min-w-0 flex-col gap-5">
            <CardSkeleton lines={kind === 'account' ? 3 : 1} />
            <CardSkeleton lines={kind === 'role' ? 8 : 4} tall={kind === 'user'} />
            {kind === 'user' ? <CardSkeleton lines={1} /> : null}
          </div>
          <div className="flex min-w-0 flex-col gap-5">
            <CardSkeleton lines={kind === 'role' ? 3 : 2} />
            {kind === 'account' ? null : <CardSkeleton lines={1} />}
          </div>
        </div>
      </div>
    </div>
  );
}
