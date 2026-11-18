import { AuditEntityType, type Uuid } from '@school-erp/shared';
import { RecordHistoryScreen } from '@/core/audit/screens';
import { localName, type Locale } from '@/shared/lib/i18n';
import type { SearchParamsRecord } from './lib/list-query';
import { loadEmployee } from './lib/load-employee';

/**
 * Server: the profile's History tab — the employee's audit entries by month, with field and person
 * filters (core/audit's record History). The employee comes from the layout's cached load.
 * Every edit, status change and photo change is an `hr.employee.*` entry (T28).
 */
export async function EmployeeHistoryScreen({
  locale,
  employeeId,
  searchParams,
}: {
  locale: Locale;
  employeeId: Uuid;
  searchParams: SearchParamsRecord;
}) {
  const employee = await loadEmployee(employeeId);
  return (
    <RecordHistoryScreen
      locale={locale}
      entityType={AuditEntityType.EMPLOYEE}
      entityId={employee.id}
      recordName={localName(employee, locale)}
      basePath={`/${locale}/employees/${employee.id}/history`}
      searchParams={searchParams}
    />
  );
}
