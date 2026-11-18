'use server';

import type { AccountingPayrollMonth, AccountingPayrollYear, Month } from '@school-erp/shared';
import { apiFetch } from '@/lib/api';
import { handleResponse } from '@/lib/handleResponse';
import type { DownloadedFile } from '@/lib/types';

/*
 * Payroll taxes screens' endpoints (§10, contract → "Accounting"). All reads. Never cached: a month
 * changes state when HR approves it, which this module doesn't hear about.
 */

/** `GET /accounting/payroll/year/:year` — the twelve months: approved (with totals), draft in HR, or none. */
export async function GET_PAYROLL_TAXES_YEAR(year: number) {
  const response = await apiFetch<AccountingPayrollYear>(`/accounting/payroll/year/${encodeURIComponent(String(year))}`, {
    method: 'GET',
    cache: 'no-store',
  });
  return handleResponse({ response, showErrorToast: false });
}

/** `GET /accounting/payroll/:month` — the month's lines as the viewer may see them, and the rule used. */
export async function GET_PAYROLL_TAXES_MONTH(month: Month) {
  const response = await apiFetch<AccountingPayrollMonth>(`/accounting/payroll/${encodeURIComponent(month)}`, {
    method: 'GET',
    cache: 'no-store',
  });
  return handleResponse({ response, showErrorToast: false });
}

/** `GET /accounting/payroll/:month/export` — the month's `.xlsx` (lines + the tax rule), as a base64 download. */
export async function GET_PAYROLL_TAXES_EXCEL(month: Month) {
  const response = await apiFetch<DownloadedFile>(`/accounting/payroll/${encodeURIComponent(month)}/export`, {
    method: 'GET',
    cache: 'no-store',
    responseType: 'file',
  });
  return handleResponse({ response });
}
