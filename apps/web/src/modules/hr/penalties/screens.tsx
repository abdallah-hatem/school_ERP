import { EmployeeStatus, monthOf, PAGINATION, type Uuid } from '@school-erp/shared';
import type { Locale } from '@/shared/lib/i18n';
import { GET_EMPLOYEES } from '../employees/apis';
import { GET_PENALTIES, GET_PENALTY_GROUPS } from './apis';
import { ProfileEmployeePenalties } from './components/employee-penalties';
import { PenaltiesList } from './components/penalties-list';
import { parsePagingQuery, parsePenaltiesQuery, type SearchParamsRecord } from './lib/list-query';
import { employeeOptions, violationGroups } from './lib/penalty-text';
import { PenaltiesI18n } from './messages';

/** Server: the penalties list for the URL's month / status / search, plus the record dialog's pickers. */
export async function PenaltiesScreen({ locale, searchParams }: { locale: Locale; searchParams: SearchParamsRecord }) {
  const currentMonth = monthOf(new Date());
  const query = parsePenaltiesQuery(searchParams, currentMonth);
  const [penalties, employees, groups] = await Promise.all([
    GET_PENALTIES(query),
    GET_EMPLOYEES({ status: EmployeeStatus.ACTIVE, limit: PAGINATION.maxLimit }),
    GET_PENALTY_GROUPS(),
  ]);
  return (
    <PenaltiesI18n locale={locale}>
      <PenaltiesList
        basePath={`/${locale}/penalties`}
        employeesPath={`/${locale}/employees`}
        query={query}
        currentMonth={currentMonth}
        rows={penalties.success ? (penalties.data ?? []) : []}
        total={penalties.success ? (penalties.meta?.total ?? 0) : 0}
        error={!penalties.success}
        employees={employeeOptions(employees.success ? (employees.data ?? []) : [], locale)}
        violations={violationGroups(groups.success ? (groups.data ?? []) : [], locale)}
      />
    </PenaltiesI18n>
  );
}

/**
 * Server: one employee's penalties, every month, newest first (the profile tab). Fetches only the
 * penalties — the employee comes from the profile layout, which already loaded it.
 */
export async function EmployeePenaltiesScreen({
  locale,
  employeeId,
  searchParams,
}: {
  locale: Locale;
  employeeId: Uuid;
  searchParams: SearchParamsRecord;
}) {
  const { page, limit } = parsePagingQuery(searchParams);
  const [penalties, groups] = await Promise.all([GET_PENALTIES({ employeeId, page, limit }), GET_PENALTY_GROUPS()]);
  return (
    <PenaltiesI18n locale={locale}>
      <ProfileEmployeePenalties
        employeesPath={`/${locale}/employees`}
        rows={penalties.success ? (penalties.data ?? []) : []}
        total={penalties.success ? (penalties.meta?.total ?? 0) : 0}
        page={page}
        limit={limit}
        error={!penalties.success}
        violations={violationGroups(groups.success ? (groups.data ?? []) : [], locale)}
      />
    </PenaltiesI18n>
  );
}
