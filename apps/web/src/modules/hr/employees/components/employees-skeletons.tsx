'use client';

import { Skeleton } from '@/shared/components/ui/skeleton';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { EMPLOYEES_PAGE_SIZE } from '../lib/list-query';
import { EmployeeCardGrid, EmployeeCardSkeleton } from './employee-card';

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

/**
 * The list's first load: header, toolbar and a full page of card skeletons in the same grid and
 * card shape, so nothing moves when the cards land.
 */
export function EmployeesListSkeleton() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-6">
      <HeaderSkeleton />
      <section aria-label={t('common.nav.employees')} aria-busy="true" className="flex min-w-0 flex-col gap-4.5">
        <span role="status" className="sr-only">
          {t('ui.states.loading')}
        </span>
        <div className="flex flex-col gap-3 rounded-[1.25rem] bg-card p-3.5 shadow-card">
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="mx-1 h-5 w-24" />
        </div>
        <EmployeeCardGrid>
          {Array.from({ length: EMPLOYEES_PAGE_SIZE }, (_, i) => (
            <li key={i} className="min-w-0" data-testid="employee-card-skeleton">
              <EmployeeCardSkeleton />
            </li>
          ))}
        </EmployeeCardGrid>
        <Skeleton className="h-9 w-full max-w-md" />
      </section>
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
