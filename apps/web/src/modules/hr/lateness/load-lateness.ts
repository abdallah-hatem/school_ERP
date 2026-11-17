import type { LatenessRule, LatenessRow, Month, NamedRef, Uuid } from '@school-erp/shared';
import { GET_ACTIVE_EMPLOYEES, GET_HR_SETTINGS, GET_LATENESS } from './apis';

/** Page cap for the department lookup: 100 per page × 20 = 2,000 active employees. */
const MAX_EMPLOYEE_PAGES = 20;

export interface LatenessData {
  /** `null` when the list failed to load. */
  rows: LatenessRow[] | null;
  /** `null` when the HR settings failed to load (days can't be shown). */
  rule: LatenessRule | null;
  /** Employee id → department. The lateness rows carry no department, so it is looked up. */
  departments: Record<Uuid, NamedRef>;
}

/** Active employees' departments, page by page. A failure leaves the column empty, nothing more. */
async function loadDepartments(): Promise<Record<Uuid, NamedRef>> {
  const out: Record<Uuid, NamedRef> = {};
  for (let page = 1; page <= MAX_EMPLOYEE_PAGES; page += 1) {
    const res = await GET_ACTIVE_EMPLOYEES(page);
    if (!res.success || !Array.isArray(res.data)) break;
    for (const employee of res.data) out[employee.id] = employee.department;
    if (!res.meta?.hasNextPage) break;
  }
  return out;
}

export async function loadLateness(month: Month): Promise<LatenessData> {
  const [lateness, settings, departments] = await Promise.all([
    GET_LATENESS(month),
    GET_HR_SETTINGS(),
    loadDepartments(),
  ]);
  return {
    rows: lateness.success && Array.isArray(lateness.data) ? lateness.data : null,
    rule: settings.success && settings.data ? settings.data.lateness : null,
    departments,
  };
}
