import { sectionMetadata } from '@/core/navigation/section-metadata';
import { notFound } from 'next/navigation';
import { EmployeeProfileShell, EmployeesI18n } from '@/modules/hr/employees';
import { loadEmployee } from '@/modules/hr/employees/lib/load-employee';
import { EmployeePayrollSection, type SearchParamsRecord } from '@/modules/hr/payroll';
import { isLocale } from '@/shared/lib/i18n';

export const generateMetadata = sectionMetadata('employees');

/** Employee profile — the "Payroll" section: their line in each run, with payslip links. */
export default async function EmployeePayrollPage({
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
      <EmployeeProfileShell basePath={`/${locale}/employees`} employee={employee} active="payroll">
        <EmployeePayrollSection locale={locale} employee={employee} searchParams={query} />
      </EmployeeProfileShell>
    </EmployeesI18n>
  );
}
