import {
  EmployeeStatus,
  PAGINATION,
  type EmployeeSummary,
  type PenaltyGroup,
  type PenaltyRecord,
} from '@school-erp/shared';
import type { Api } from './api';
import { todayIso } from './dates';

/** Records a pending penalty dated today through the API, on a pair the day doesn't refuse. */
export async function recordPenaltyToday(api: Api): Promise<PenaltyRecord> {
  const employees = await api.get<EmployeeSummary[]>('/hr/employees', {
    status: EmployeeStatus.ACTIVE,
    limit: PAGINATION.maxLimit,
  });
  const groups = await api.get<PenaltyGroup[]>('/hr/penalty-groups');
  const violations = groups.filter((g) => g.isActive).flatMap((g) => g.violations.filter((v) => v.isActive));
  // A violation that may repeat in a day first: earlier specs record "once per day" ones today.
  violations.sort((a, b) => Number(a.oncePerDay) - Number(b.oncePerDay));
  for (const violation of violations) {
    for (const employee of employees) {
      try {
        return await api.post<PenaltyRecord>('/hr/penalties', {
          employeeId: employee.id,
          violationId: violation.id,
          date: todayIso(),
          note: 'Smoke: approval notification',
        });
      } catch {
        // That day is taken for this pair (once per day): try the next.
      }
    }
  }
  throw new Error('smoke: no employee and violation left to record a penalty on today');
}
