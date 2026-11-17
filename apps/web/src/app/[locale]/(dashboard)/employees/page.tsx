import { notFound } from 'next/navigation';
import { EmployeesI18n, EmployeesList, parseEmployeesQuery, type SearchParamsRecord } from '@/modules/hr/employees';
import { GET_DEPARTMENTS, GET_EMPLOYEES, GET_STAGES } from '@/modules/hr/employees/apis';
import { isLocale } from '@/shared/lib/i18n';

/** Employees list: search, filters and pages live in the URL; the server fetches with them. */
export default async function EmployeesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParamsRecord>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const query = parseEmployeesQuery(await searchParams);

  // Filters list hidden departments and stages too: hidden items can still have employees.
  const [employees, departments, stages] = await Promise.all([
    GET_EMPLOYEES(query),
    GET_DEPARTMENTS(true),
    GET_STAGES(true),
  ]);

  return (
    <EmployeesI18n locale={locale}>
      <EmployeesList
        basePath={`/${locale}/employees`}
        query={query}
        rows={employees.success ? (employees.data ?? []) : []}
        total={employees.success ? (employees.meta?.total ?? 0) : 0}
        departments={departments.success ? (departments.data ?? []) : []}
        stages={stages.success ? (stages.data ?? []) : []}
        error={!employees.success}
      />
    </EmployeesI18n>
  );
}
