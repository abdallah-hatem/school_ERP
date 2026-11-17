'use client';

import { monthOf } from '@school-erp/shared';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { parsePenaltiesQuery } from '../lib/list-query';
import { PenaltiesI18n } from '../messages';
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
        employeesPath={`/${locale}/employees`}
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
