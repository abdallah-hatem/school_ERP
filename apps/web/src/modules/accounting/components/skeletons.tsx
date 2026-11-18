'use client';

import { isMonth, monthOf } from '@school-erp/shared';
import { useParams, useSearchParams } from 'next/navigation';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { parseYear } from '../lib/payroll-taxes';
import { AccountingI18n } from '../messages';
import { Statement } from './statement';
import { YearBoard } from './year-board';

/*
 * Route skeletons (`loading.tsx`): the screens themselves with no data, so the header, the twelve
 * tiles, the statement's blocks and its tables keep their places when the data arrives.
 */

export function PayrollTaxesSkeleton() {
  const { locale } = useTranslation();
  const params = useSearchParams();
  return (
    <AccountingI18n locale={locale}>
      <YearBoard
        year={parseYear(Object.fromEntries(params))}
        data={undefined}
        basePath={`/${locale}/accounting/payroll-taxes`}
        payrollHref={`/${locale}/payroll`}
        currentMonth={monthOf(new Date())}
      />
    </AccountingI18n>
  );
}

export function PayrollTaxesMonthSkeleton() {
  const { locale } = useTranslation();
  const params = useParams<{ month?: string }>();
  const month = isMonth(params.month) ? params.month : monthOf(new Date());
  return (
    <AccountingI18n locale={locale}>
      <Statement monthKey={month} month={undefined} todayRule={null} basePath={`/${locale}/accounting/payroll-taxes`} />
    </AccountingI18n>
  );
}
