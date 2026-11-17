import { notFound } from 'next/navigation';
import { EmployeeProfileShell, EmployeesI18n } from '@/modules/hr/employees';
import { loadEmployee } from '@/modules/hr/employees/lib/load-employee';
import { EmployeePayrollSection } from '@/modules/hr/payroll';
import { isLocale } from '@/shared/lib/i18n';

/** Employee profile — the "Payroll" section: their line in each run, with payslip links. */
export default async function EmployeePayrollPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const employee = await loadEmployee(id);
  return (
    <EmployeesI18n locale={locale}>
      <EmployeeProfileShell basePath={`/${locale}/employees`} employee={employee} active="payroll">
        <EmployeePayrollSection locale={locale} employee={employee} />
      </EmployeeProfileShell>
    </EmployeesI18n>
  );
}
