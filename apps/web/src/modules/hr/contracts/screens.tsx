import { contractYearOf, schoolDayOf, type Uuid } from '@school-erp/shared';
import { notFound } from 'next/navigation';
import type { Locale } from '@/shared/lib/i18n';
import { GET_STAGES } from '../employees/apis';
import { GET_CONTRACTS, GET_EMPLOYEE_CONTRACTS } from './apis';
import { ContractsList } from './components/contracts-list';
import { ProfileEmployeeContracts } from './components/employee-contracts';
import { parseContractsQuery, parsePagingQuery, type SearchParamsRecord } from './lib/list-query';
import { ContractsI18n } from './messages';

/**
 * Server: the renewal list for the URL's year / decision / stage / search / page — the API pages,
 * searches, filters and orders it and counts the tiles (owner 2026-11-21: lists are the server's).
 */
export async function ContractsScreen({ locale, searchParams }: { locale: Locale; searchParams: SearchParamsRecord }) {
  // The school's today (Cairo): the default contract year and the date rules on the rows.
  const today = schoolDayOf(new Date());
  const currentYear = contractYearOf(today);
  const query = parseContractsQuery(searchParams, currentYear);
  const [contracts, stage] = await Promise.all([
    GET_CONTRACTS(query),
    // The stage filter's chosen stage, by id: its name shows on the filter at once.
    query.stageId ? GET_STAGES({ ids: [query.stageId], includeHidden: true }) : Promise.resolve(null),
  ]);
  const page = contracts.success ? contracts.data : undefined;
  return (
    <ContractsI18n locale={locale}>
      <ContractsList
        basePath={`/${locale}/contracts`}
        employeesPath={`/${locale}/employees`}
        query={query}
        currentYear={currentYear}
        today={today}
        rows={page?.items ?? []}
        total={page?.total ?? 0}
        totals={page?.totals}
        calendar={page ? page.calendar : undefined}
        error={!contracts.success}
        selectedStage={stage?.success ? (stage.data?.[0] ?? null) : null}
      />
    </ContractsI18n>
  );
}

/**
 * Server: one employee's contracts, newest first, paged by the API (the profile tab). The employee
 * comes from the profile layout. Outside the viewer's scope the API answers 404 → not found (§2).
 */
export async function EmployeeContractsScreen({
  locale,
  employeeId,
  searchParams,
}: {
  locale: Locale;
  employeeId: Uuid;
  searchParams: SearchParamsRecord;
}) {
  const { page, limit } = parsePagingQuery(searchParams);
  const res = await GET_EMPLOYEE_CONTRACTS(employeeId, { page, limit });
  if (res.success === false && (res.status === 404 || res.status === 400)) notFound();
  return (
    <ContractsI18n locale={locale}>
      <ProfileEmployeeContracts
        employeeId={employeeId}
        basePath={`/${locale}/employees/${employeeId}/contracts`}
        rows={res.success ? (res.data ?? []) : []}
        total={res.success ? (res.meta?.total ?? 0) : 0}
        page={page}
        limit={limit}
        today={schoolDayOf(new Date())}
        error={!res.success}
      />
    </ContractsI18n>
  );
}
