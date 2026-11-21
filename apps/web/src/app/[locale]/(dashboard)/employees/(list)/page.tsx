import { sectionMetadata } from '@/core/navigation/section-metadata';
import { notFound } from 'next/navigation';
import { requireScreen } from '@/core/auth';
import { EmployeesI18n, EmployeesList, parseEmployeesQuery, type SearchParamsRecord } from '@/modules/hr/employees';
import { GET_DEPARTMENTS, GET_EMPLOYEES, GET_STAGE_ORDER, GET_STAGES } from '@/modules/hr/employees/apis';
import { isLocale } from '@/shared/lib/i18n';

export const generateMetadata = sectionMetadata('employees');

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
  // R6: a page the viewer's roles can't open is the not-found screen.
  await requireScreen('employees');
  const query = parseEmployeesQuery(await searchParams);

  // The filters' choices are searched by the API as the person types; here only the chosen ones'
  // names (hidden items too: they can still have employees) and the stage order for the bands.
  const [employees, department, stage, stages] = await Promise.all([
    GET_EMPLOYEES(query),
    query.departmentId ? GET_DEPARTMENTS({ ids: [query.departmentId], includeHidden: true }) : null,
    query.stageId ? GET_STAGES({ ids: [query.stageId], includeHidden: true }) : null,
    GET_STAGE_ORDER(),
  ]);

  return (
    <EmployeesI18n locale={locale}>
      <EmployeesList
        basePath={`/${locale}/employees`}
        query={query}
        rows={employees.success ? (employees.data ?? []) : []}
        total={employees.success ? (employees.meta?.total ?? 0) : 0}
        selectedDepartment={department?.success ? (department.data?.[0] ?? null) : null}
        selectedStage={stage?.success ? (stage.data?.[0] ?? null) : null}
        stages={stages.success ? (stages.data ?? []) : []}
        error={!employees.success}
      />
    </EmployeesI18n>
  );
}
