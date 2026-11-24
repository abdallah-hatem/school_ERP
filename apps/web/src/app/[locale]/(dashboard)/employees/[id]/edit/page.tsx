import { sectionMetadata } from '@/core/navigation/section-metadata';
import { notFound } from 'next/navigation';
import { requireScreen } from '@/core/auth';
import { EmployeeForm, EmployeesI18n } from '@/modules/hr/employees';
import { GET_DEPARTMENTS, GET_EMPLOYEE_GRADES, GET_JOB_TITLES, GET_MANAGER_OPTIONS, GET_STAGES } from '@/modules/hr/employees/apis';
import { loadEmployee } from '@/modules/hr/employees/lib/load-employee';
import { isLocale } from '@/shared/lib/i18n';

export const generateMetadata = sectionMetadata('employees');

/** Edit an employee. Their own hidden list items stay selectable; new choices must be visible. */
export default async function EditEmployeePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  // R6: a page the viewer's roles can't open is the not-found screen.
  await requireScreen('employeeEdit');

  const [employee, managers] = await Promise.all([loadEmployee(id), GET_MANAGER_OPTIONS(id, { limit: 1 })]);
  // The pickers' choices are searched by the API as the person types; here only whether the
  // employee's own items have since been hidden (they keep them, with a note).
  const hiddenOf = async (res: Promise<{ success?: boolean; data?: unknown }>) => {
    const r = await res;
    const item = r.success && Array.isArray(r.data) ? (r.data[0] as { isActive?: boolean } | undefined) : undefined;
    return item ? item.isActive === false : false;
  };
  const [stage, department, jobTitle, employeeGrade] = await Promise.all([
    hiddenOf(GET_STAGES({ ids: [employee.stage.id], includeHidden: true })),
    hiddenOf(GET_DEPARTMENTS({ ids: [employee.department.id], includeHidden: true })),
    hiddenOf(GET_JOB_TITLES({ ids: [employee.jobTitle.id], includeHidden: true })),
    employee.employeeGrade ? hiddenOf(GET_EMPLOYEE_GRADES({ ids: [employee.employeeGrade.id], includeHidden: true })) : false,
  ]);

  return (
    <EmployeesI18n locale={locale}>
      <EmployeeForm
        basePath={`/${locale}/employees`}
        employee={employee}
        currentHidden={{ stage, department, jobTitle, employeeGrade }}
        hasManagerCandidates={!managers.success || (managers.meta?.total ?? 0) > 0}
      />
    </EmployeesI18n>
  );
}
