'use client';

import { monthOf } from '@school-erp/shared';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { parsePagingQuery, parsePenaltiesQuery } from '../lib/list-query';
import { PenaltiesI18n } from '../messages';
import { ProfileEmployeePenalties } from './employee-penalties';
import { PenaltiesList } from './penalties-list';

/**
 * The list's first load: the screen itself with skeleton rows (same header, toolbar, columns,
 * row heights and pagination), so nothing moves when the page arrives.
 */
export function PenaltiesSkeleton() {
  const { locale } = useTranslation();
  const params = useSearchParams();
  const currentMonth = monthOf(new Date());
  return (
    <PenaltiesI18n locale={locale}>
      <PenaltiesList
        basePath={`/${locale}/penalties`}
        query={parsePenaltiesQuery(Object.fromEntries(params), currentMonth)}
        currentMonth={currentMonth}
        rows={undefined}
        total={0}
        employees={[]}
        violations={[]}
      />
    </PenaltiesI18n>
  );
}

/** The profile's "Penalties" tab while it loads: the tab itself with skeleton rows (the header stays). */
export function EmployeePenaltiesSkeleton() {
  const { locale } = useTranslation();
  const params = useSearchParams();
  const { page, limit } = parsePagingQuery(Object.fromEntries(params));
  return (
    <PenaltiesI18n locale={locale}>
      <ProfileEmployeePenalties
        employeesPath={`/${locale}/employees`}
        rows={undefined}
        total={0}
        page={page}
        limit={limit}
        violations={[]}
      />
    </PenaltiesI18n>
  );
}
