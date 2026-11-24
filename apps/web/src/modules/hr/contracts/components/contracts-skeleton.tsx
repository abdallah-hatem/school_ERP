'use client';

import { contractYearOf, schoolDayOf } from '@school-erp/shared';
import { useParams, useSearchParams } from 'next/navigation';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { parseContractsQuery, parsePagingQuery } from '../lib/list-query';
import { ContractsI18n } from '../messages';
import { ContractsList } from './contracts-list';
import { ProfileEmployeeContracts } from './employee-contracts';

/**
 * The renewals screen's first load: the screen itself with no data — the header with its year
 * stepper, the five tiles, the toolbar's filters and count, skeleton rows and the pagination — so
 * nothing moves when the page arrives.
 */
export function ContractsSkeleton() {
  const { locale } = useTranslation();
  const params = useSearchParams();
  const today = schoolDayOf(new Date());
  const currentYear = contractYearOf(today);
  return (
    <ContractsI18n locale={locale}>
      <ContractsList
        basePath={`/${locale}/contracts`}
        employeesPath={`/${locale}/employees`}
        query={parseContractsQuery(Object.fromEntries(params), currentYear)}
        currentYear={currentYear}
        today={today}
        rows={undefined}
        total={0}
      />
    </ContractsI18n>
  );
}

/** The profile's "Contracts" tab while it loads: the tab itself with skeleton rows (the header stays). */
export function EmployeeContractsSkeleton() {
  const { locale } = useTranslation();
  const search = useSearchParams();
  const { id = '' } = useParams<{ id?: string }>() ?? {};
  const { page, limit } = parsePagingQuery(Object.fromEntries(search));
  return (
    <ContractsI18n locale={locale}>
      <ProfileEmployeeContracts
        employeeId={id}
        basePath={`/${locale}/employees/${id}/contracts`}
        rows={undefined}
        total={0}
        page={page}
        limit={limit}
        today={schoolDayOf(new Date())}
      />
    </ContractsI18n>
  );
}
