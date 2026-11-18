import { notFound } from 'next/navigation';
import { requireScreen } from '@/core/auth';
import type { ReactNode } from 'react';
import { EmployeeProfileShell, EmployeesI18n } from '@/modules/hr/employees';
import { loadEmployee } from '@/modules/hr/employees/lib/load-employee';
import { isLocale } from '@/shared/lib/i18n';

/**
 * Employee profile: loads the employee once and draws the header, actions and tabs. A layout stays
 * mounted across its tabs, so switching tabs renders only the tab (its own `loading.tsx`); the
 * header is fetched again only on `router.refresh()` (after deactivate / reactivate).
 */
export default async function EmployeeProfileLayout({
  params,
  children,
}: {
  params: Promise<{ locale: string; id: string }>;
  children: ReactNode;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  // R6: a page the viewer's roles can't open is the not-found screen.
  await requireScreen('employee');
  const employee = await loadEmployee(id);
  return (
    <EmployeesI18n locale={locale}>
      <EmployeeProfileShell basePath={`/${locale}/employees`} employee={employee}>
        {children}
      </EmployeeProfileShell>
    </EmployeesI18n>
  );
}
