import {
  EmployeeStatus,
  PAGINATION,
  PayrollStatus,
  PenaltyStatus,
  type EmployeeSummary,
  type IsoDate,
  type PayrollRunSummary,
  type PenaltyGroup,
  type PenaltyRecord,
} from '@school-erp/shared';
import type { Api } from './api';
import { todayIso } from './dates';

/** The same day `months` months before `date` (the 15th, so every month has it). */
function monthsBefore(date: IsoDate, months: number): IsoDate {
  const [y, m] = date.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 - months, 15));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-15`;
}

/**
 * The latest day a penalty can be recorded on: today, unless an earlier spec approved this month's
 * payroll (05 does — the month is then locked, §6), else the 15th of the latest open month.
 */
async function openDay(api: Api): Promise<IsoDate> {
  const runs = await api.get<PayrollRunSummary[]>('/hr/payroll-runs', { limit: PAGINATION.maxLimit });
  const locked = new Set(runs.filter((r) => r.status === PayrollStatus.APPROVED).map((r) => r.month));
  const today = todayIso();
  for (let back = 0; back < 24; back += 1) {
    const day = back === 0 ? today : monthsBefore(today, back);
    if (!locked.has(day.slice(0, 7))) return day;
  }
  throw new Error('smoke: every month of the last two years has an approved payroll');
}

/**
 * Records a pending penalty through the API on the latest open day, on an employee and violation
 * that day doesn't refuse (an earlier spec may have taken a "once per day" pair).
 */
export async function recordOpenPenalty(api: Api): Promise<PenaltyRecord> {
  const date = await openDay(api);
  const employees = await api.get<EmployeeSummary[]>('/hr/employees', {
    status: EmployeeStatus.ACTIVE,
    limit: PAGINATION.maxLimit,
  });
  const groups = await api.get<PenaltyGroup[]>('/hr/penalty-groups');
  const violations = groups.filter((g) => g.isActive).flatMap((g) => g.violations.filter((v) => v.isActive));
  // A violation that may repeat in a day first.
  violations.sort((a, b) => Number(a.oncePerDay) - Number(b.oncePerDay));
  // §4 approve in date order: a pair that already has a pending penalty would refuse approving it.
  const pending = await api.get<PenaltyRecord[]>('/hr/penalties', {
    status: PenaltyStatus.PENDING,
    limit: PAGINATION.maxLimit,
  });
  const waiting = new Set(pending.map((p) => `${p.employee.id}|${p.violation.id}`));
  let last: unknown;
  for (const violation of violations) {
    for (const employee of employees) {
      if (waiting.has(`${employee.id}|${violation.id}`)) continue;
      try {
        return await api.post<PenaltyRecord>('/hr/penalties', {
          employeeId: employee.id,
          violationId: violation.id,
          date,
          note: 'Smoke: approval notification',
        });
      } catch (e) {
        last = e;
      }
    }
  }
  throw new Error(`smoke: no employee and violation left to record a penalty on ${date}: ${String(last)}`);
}
