import { sectionMetadata } from '@/core/navigation/section-metadata';
import { notFound } from 'next/navigation';
import { requireScreen } from '@/core/auth';
import { EmployeeForm, EmployeesI18n } from '@/modules/hr/employees';
import { GET_DEPARTMENTS, GET_JOB_TITLES, GET_MANAGER_OPTIONS, GET_STAGES } from '@/modules/hr/employees/apis';
import { loadEmployee } from '@/modules/hr/employees/lib/load-employee';
import { isLocale } from '@/shared/lib/i18n';

export const generateMetadata = sectionMetadata('employees');

/** Edit an employee. Their own hidden list items stay selectable; new choices must be visible. */
export default async function EditEmployeePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  // R6: a page the viewer's roles can't open is the not-found screen.
  await requireScreen('employeeEdit');

  const [employee, departments, stages, jobTitles, managers] = await Promise.all([
    loadEmployee(id),
    GET_DEPARTMENTS(),
    GET_STAGES(),
    GET_JOB_TITLES(),
    GET_MANAGER_OPTIONS(id),
  ]);

  return (
    <EmployeesI18n locale={locale}>
      <EmployeeForm
        basePath={`/${locale}/employees`}
        employee={employee}
        departments={departments.success ? (departments.data ?? []) : []}
        stages={stages.success ? (stages.data ?? []) : []}
        jobTitles={jobTitles.success ? (jobTitles.data ?? []) : []}
        managerCandidates={managers.success ? (managers.data ?? []) : []}
      />
    </EmployeesI18n>
  );
}
