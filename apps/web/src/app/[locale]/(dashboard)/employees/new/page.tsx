import { sectionMetadata } from '@/core/navigation/section-metadata';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/core/auth';
import { EmployeeForm, EmployeesI18n } from '@/modules/hr/employees';
import { GET_DEPARTMENTS, GET_JOB_TITLES, GET_MANAGER_OPTIONS, GET_STAGES } from '@/modules/hr/employees/apis';
import { isLocale } from '@/shared/lib/i18n';

export const generateMetadata = sectionMetadata('employees');

/** Add an employee. Pickers offer visible list items and active managers only. */
export default async function NewEmployeePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  // R6: a page the viewer's roles can't open is the not-found screen.
  await requirePermission('hr.employees.create');

  const [departments, stages, jobTitles, managers] = await Promise.all([
    GET_DEPARTMENTS(),
    GET_STAGES(),
    GET_JOB_TITLES(),
    GET_MANAGER_OPTIONS(),
  ]);

  return (
    <EmployeesI18n locale={locale}>
      <EmployeeForm
        basePath={`/${locale}/employees`}
        departments={departments.success ? (departments.data ?? []) : []}
        stages={stages.success ? (stages.data ?? []) : []}
        jobTitles={jobTitles.success ? (jobTitles.data ?? []) : []}
        managerCandidates={managers.success ? (managers.data ?? []) : []}
      />
    </EmployeesI18n>
  );
}
