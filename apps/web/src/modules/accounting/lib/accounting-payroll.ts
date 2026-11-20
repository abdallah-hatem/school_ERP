import { PAGINATION, PAYROLL_PAGINATION, nearestPageSize, type AccountingPayrollLine, type AccountingPayrollTotals, type Piastres } from '@school-erp/shared';
import { sumMoney } from '@/shared/lib/format';
import type { SearchParamsRecord } from './payroll-taxes';

/*
 * Accounting → Payroll (§10): HR's approved months as HR's payroll screens show them, plus the
 * insurance share and taxes the school pays on top.
 */

export interface AccountingPayrollListQuery {
  page: number;
  limit: number;
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function positiveInt(raw: string | undefined, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, max) : fallback;
}

/** `?page&limit` of the list. */
export function parseListQuery(params: SearchParamsRecord): AccountingPayrollListQuery {
  return {
    page: positiveInt(one(params.page), PAGINATION.defaultPage),
    limit: nearestPageSize(
      positiveInt(one(params.limit), PAGINATION.defaultLimit, PAYROLL_PAGINATION.maxLimit),
      PAYROLL_PAGINATION.pageSizes,
    ),
  };
}

export function listQueryString(query: AccountingPayrollListQuery): string {
  const params = new URLSearchParams();
  if (query.page !== PAGINATION.defaultPage) params.set('page', String(query.page));
  if (query.limit !== PAGINATION.defaultLimit) params.set('limit', String(query.limit));
  const s = params.toString();
  return s ? `?${s}` : '';
}

/** Income tax + martyrs' fund; undefined when hidden. */
export function taxesOf(x: Pick<AccountingPayrollTotals, 'incomeTax' | 'martyrTax'>): Piastres | undefined {
  return sumMoney(x.incomeTax, x.martyrTax);
}

/** HR's additions − deductions; undefined when hidden or HR's breakdown is missing. */
export function adjustmentNet(line: AccountingPayrollLine): number | undefined {
  const hr = line.hr;
  if (!hr || hr.adjustmentAdditions === undefined || hr.adjustmentDeductions === undefined) return undefined;
  return hr.adjustmentAdditions - hr.adjustmentDeductions;
}
