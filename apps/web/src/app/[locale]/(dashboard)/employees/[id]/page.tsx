import { notFound } from 'next/navigation';
import { EmployeeDetails, EmployeeProfileShell, EmployeesI18n } from '@/modules/hr/employees';
import { loadEmployee } from '@/modules/hr/employees/lib/load-employee';
import { isLocale } from '@/shared/lib/i18n';

/** Employee profile — the "Details" section. */
export default async function EmployeeProfilePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const employee = await loadEmployee(id);
  const basePath = `/${locale}/employees`;
  return (
    <EmployeesI18n locale={locale}>
      <EmployeeProfileShell basePath={basePath} employee={employee} active="details">
        <EmployeeDetails basePath={basePath} employee={employee} />
      </EmployeeProfileShell>
    </EmployeesI18n>
  );
}
