import { sectionMetadata } from '@/core/navigation/section-metadata';
import { notFound } from 'next/navigation';
import { requireScreen } from '@/core/auth';
import { EmployeeForm, EmployeesI18n } from '@/modules/hr/employees';
import { GET_MANAGER_OPTIONS } from '@/modules/hr/employees/apis';
import { isLocale } from '@/shared/lib/i18n';

export const generateMetadata = sectionMetadata('employees');

/** Add an employee. Pickers offer visible list items and active managers only. */
export default async function NewEmployeePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  // R6: a page the viewer's roles can't open is the not-found screen.
  await requireScreen('employeeNew');

  // The pickers' choices are searched by the API as the person types; here only whether any
  // manager exists (the manager field's note).
  const managers = await GET_MANAGER_OPTIONS(undefined, { limit: 1 });

  return (
    <EmployeesI18n locale={locale}>
      <EmployeeForm
        basePath={`/${locale}/employees`}
        hasManagerCandidates={!managers.success || (managers.meta?.total ?? 0) > 0}
      />
    </EmployeesI18n>
  );
}
