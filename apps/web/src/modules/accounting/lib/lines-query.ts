import {
  InsuranceStatus,
  PAGINATION,
  PAYROLL_PAGINATION,
  nearestPageSize,
  type AccountingPayrollLinesQuery,
} from '@school-erp/shared';

/*
 * The month screens' lines live in the URL — `?q` (the search) and each table's page and size —
 * and the API pages, searches and sums them (owner, 2026-11-21). Nothing is filtered here.
 */

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

function positiveInt(v: string | undefined, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, max) : fallback;
}

/** One table's page: the page and a listed size (10–500). */
export interface TablePage {
  page: number;
  limit: number;
}

function tablePage(params: SearchParamsRecord, pageKey: string, limitKey: string): TablePage {
  return {
    page: positiveInt(one(params[pageKey]), PAGINATION.defaultPage),
    limit: nearestPageSize(
      positiveInt(one(params[limitKey]), PAGINATION.defaultLimit, PAYROLL_PAGINATION.maxLimit),
      PAYROLL_PAGINATION.pageSizes,
    ),
  };
}

/** Accounting → Payroll, one month: `?q&page&limit`. */
export interface MonthLinesQuery extends TablePage {
  search?: string;
}

export function parseMonthLinesQuery(params: SearchParamsRecord): MonthLinesQuery {
  const search = one(params.q)?.slice(0, 100);
  return { ...(search ? { search } : {}), ...tablePage(params, 'page', 'limit') };
}

export function monthLinesQueryString(query: MonthLinesQuery): string {
  const p = new URLSearchParams();
  if (query.search) p.set('q', query.search);
  if (query.page !== PAGINATION.defaultPage) p.set('page', String(query.page));
  if (query.limit !== PAGINATION.defaultLimit) p.set('limit', String(query.limit));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** The payroll taxes statement: one search for both groups, each group its own page and size. */
export interface StatementQuery {
  search?: string;
  insured: TablePage;
  notInsured: TablePage;
}

export function parseStatementQuery(params: SearchParamsRecord): StatementQuery {
  const search = one(params.q)?.slice(0, 100);
  return {
    ...(search ? { search } : {}),
    insured: tablePage(params, 'insuredPage', 'insuredLimit'),
    notInsured: tablePage(params, 'notInsuredPage', 'notInsuredLimit'),
  };
}

export function statementQueryString(query: StatementQuery): string {
  const p = new URLSearchParams();
  if (query.search) p.set('q', query.search);
  for (const [key, t] of [['insured', query.insured], ['notInsured', query.notInsured]] as const) {
    if (t.page !== PAGINATION.defaultPage) p.set(`${key}Page`, String(t.page));
    if (t.limit !== PAGINATION.defaultLimit) p.set(`${key}Limit`, String(t.limit));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** A statement group's API query: its insurance status, the search, its page. */
export function groupQuery(query: StatementQuery, insured: boolean): AccountingPayrollLinesQuery {
  const t = insured ? query.insured : query.notInsured;
  return {
    insurance: insured ? InsuranceStatus.INSURED : InsuranceStatus.NOT_INSURED,
    search: query.search,
    page: t.page,
    limit: t.limit,
  };
}
