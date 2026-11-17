import {
  PAGINATION,
  type PayrollAdjustment,
  type PayrollLine,
  type PayrollRunQuery,
  type Uuid,
} from '@school-erp/shared';

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

function positiveInt(v: string | undefined, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, max) : fallback;
}

// ── Runs list: ?page&limit ───────────────────────────────────────────────────

export interface RunsListQuery {
  page: number;
  limit: number;
}

export function parseRunsQuery(params: SearchParamsRecord): RunsListQuery {
  return {
    page: positiveInt(one(params.page), PAGINATION.defaultPage),
    limit: positiveInt(one(params.limit), PAGINATION.defaultLimit, PAGINATION.maxLimit),
  };
}

export function runsQueryString(query: RunsListQuery): string {
  const params = new URLSearchParams();
  if (query.page !== PAGINATION.defaultPage) params.set('page', String(query.page));
  if (query.limit !== PAGINATION.defaultLimit) params.set('limit', String(query.limit));
  const s = params.toString();
  return s ? `?${s}` : '';
}

// ── Run page: ?search&departmentId&flagged (the API filters the lines) ───────

export function parseRunQuery(params: SearchParamsRecord): PayrollRunQuery {
  return {
    search: one(params.search),
    departmentId: one(params.departmentId),
    flagged: one(params.flagged) === 'true' ? true : undefined,
  };
}

/** The search (when it has text) plus each filter in use — the "Clear filters · n" count. */
export function runFilterCount(query: PayrollRunQuery): number {
  return [query.search, query.departmentId, query.flagged].filter(Boolean).length;
}

export function hasRunFilters(query: PayrollRunQuery): boolean {
  return runFilterCount(query) > 0;
}

export function runQueryString(query: PayrollRunQuery): string {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.departmentId) params.set('departmentId', query.departmentId);
  if (query.flagged) params.set('flagged', 'true');
  const s = params.toString();
  return s ? `?${s}` : '';
}

// ── Adjustments ──────────────────────────────────────────────────────────────

/** An employee's adjustments, oldest first (as the API sends them). */
export function adjustmentsOf(adjustments: readonly PayrollAdjustment[], employeeId: Uuid): PayrollAdjustment[] {
  return adjustments.filter((a) => a.employeeId === employeeId);
}

/**
 * Adjustments for employees no longer in the run (deactivated before the last recalculate): kept
 * on record but not counted in any line (§6 GUESS — shown as "not applied"). The API marks them
 * (`applied: false`), whatever lines the screen's filters show.
 */
export function notAppliedAdjustments(adjustments: readonly PayrollAdjustment[]): PayrollAdjustment[] {
  return adjustments.filter((a) => !a.applied);
}

/** A line's adjustments as one signed figure: additions − deductions. */
export function adjustmentNet(line: Pick<PayrollLine, 'adjustmentAdditions' | 'adjustmentDeductions'>): number {
  return line.adjustmentAdditions - line.adjustmentDeductions;
}
