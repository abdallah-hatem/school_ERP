import {
  EMPLOYEE_STATUSES,
  PAGINATION,
  WORK_SYSTEMS,
  type EmployeeStatus,
  type ListEmployeesQuery,
  type WorkSystem,
} from '@school-erp/shared';

/**
 * Employees per page on the card grid: 12 fills whole rows of 3, 2 and 1 cards (other lists use
 * the shared default of 10). Fixed — the grid has no rows-per-page control.
 */
export const EMPLOYEES_PAGE_SIZE = 12;

/** The list's state lives in the URL (`?page&search&departmentId&stageId&status&workSystem`). */
export type EmployeesListQuery = Required<Pick<ListEmployeesQuery, 'page' | 'limit'>> &
  Omit<ListEmployeesQuery, 'page' | 'limit'>;

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

const FILTER_KEYS = ['search', 'departmentId', 'stageId', 'status', 'workSystem'] as const;
export type EmployeesFilterKey = (typeof FILTER_KEYS)[number];

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

function positiveInt(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 ? n : fallback;
}

/** Reads the URL into a valid query: unknown enum values and out-of-range pages are dropped. */
export function parseEmployeesQuery(params: SearchParamsRecord): EmployeesListQuery {
  const status = one(params.status);
  const workSystem = one(params.workSystem);
  return {
    page: positiveInt(one(params.page), PAGINATION.defaultPage),
    limit: EMPLOYEES_PAGE_SIZE,
    search: one(params.search),
    departmentId: one(params.departmentId),
    stageId: one(params.stageId),
    status: (EMPLOYEE_STATUSES as string[]).includes(status ?? '') ? (status as EmployeeStatus) : undefined,
    workSystem: (WORK_SYSTEMS as string[]).includes(workSystem ?? '') ? (workSystem as WorkSystem) : undefined,
  };
}

/** Whether a search or any filter narrows the list — decides "no results" vs "nothing yet". */
export function hasActiveFilters(query: EmployeesListQuery): boolean {
  return FILTER_KEYS.some((key) => Boolean(query[key]));
}

/** The query string for `query`, leaving out defaults so URLs stay short. */
export function employeesQueryString(query: EmployeesListQuery): string {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = query[key];
    if (value) params.set(key, value);
  }
  if (query.page !== PAGINATION.defaultPage) params.set('page', String(query.page));
  const s = params.toString();
  return s ? `?${s}` : '';
}
