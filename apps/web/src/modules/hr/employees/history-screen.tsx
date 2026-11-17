import { AuditEntityType, type Uuid } from '@school-erp/shared';
import { RecordHistoryScreen } from '@/core/audit/screens';
import { localName, type Locale } from '@/shared/lib/i18n';
import type { SearchParamsRecord } from './lib/list-query';
import { loadEmployee } from './lib/load-employee';

/**
 * Server: the profile's History tab — the employee's audit entries by month, with field and person
 * filters (core/audit's record History). The employee comes from the layout's cached load.
 *
 * TODO(T28): employee edits start writing `hr.employee.*` entries once T28 wires the HR employee
 * service; until then the tab shows its empty state.
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
