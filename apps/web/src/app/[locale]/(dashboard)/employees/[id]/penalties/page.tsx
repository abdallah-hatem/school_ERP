import { sectionMetadata } from '@/core/navigation/section-metadata';
import { notFound } from 'next/navigation';
import { EmployeeProfileShell, EmployeesI18n } from '@/modules/hr/employees';
import { loadEmployee } from '@/modules/hr/employees/lib/load-employee';
import { EmployeePenaltiesScreen, type SearchParamsRecord } from '@/modules/hr/penalties';
import { isLocale } from '@/shared/lib/i18n';

export const generateMetadata = sectionMetadata('employees');

/** Employee profile — the "Penalties" section: every month, newest first. */
export default async function EmployeePenaltiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<SearchParamsRecord>;
}) {
  const [{ locale, id }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();
  const employee = await loadEmployee(id);
  return (
    <EmployeesI18n locale={locale}>
      <EmployeeProfileShell basePath={`/${locale}/employees`} employee={employee} active="penalties">
        <EmployeePenaltiesScreen locale={locale} employee={employee} searchParams={query} />
      </EmployeeProfileShell>
    </EmployeesI18n>
  );
}
