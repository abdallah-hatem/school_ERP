'use server';

import type {
  AccountingPayrollLinesPage,
  AccountingPayrollLinesQuery,
  AccountingPayrollMonth,
  AccountingPayrollMonthSummary,
  AccountingPayrollYear,
  Month,
  ReturnPayrollMonthRequest,
  Uuid,
} from '@school-erp/shared';
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

/** `GET /accounting/payroll/:month` — the month's summary, totals and the rule used (no lines: they are paged). */
export async function GET_PAYROLL_TAXES_MONTH(month: Month) {
  const response = await apiFetch<AccountingPayrollMonth>(`/accounting/payroll/${encodeURIComponent(month)}`, {
    method: 'GET',
    cache: 'no-store',
  });
  return handleResponse({ response, showErrorToast: false });
}

/**
 * `GET /accounting/payroll/:month/lines?page&limit&search&insurance` — one page of the month's lines
 * as the viewer may see them (by code), searched and narrowed to one insurance group by the API,
 * with `totals` over every matching line (money only with every salary).
 */
export async function GET_PAYROLL_TAXES_LINES(month: Month, query: AccountingPayrollLinesQuery = {}) {
  const response = await apiFetch<AccountingPayrollLinesPage>(`/accounting/payroll/${encodeURIComponent(month)}/lines`, {
    method: 'GET',
    params: {
      page: query.page ? String(query.page) : undefined,
      limit: query.limit ? String(query.limit) : undefined,
      search: query.search || undefined,
      insurance: query.insurance,
    },
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

/** `GET /accounting/payroll` — the approved months, newest first, with their totals (Accounting → Payroll). */
export async function GET_ACCOUNTING_PAYROLL(query: { page?: number; limit?: number } = {}) {
  const response = await apiFetch<AccountingPayrollMonthSummary[]>('/accounting/payroll', {
    method: 'GET',
    params: {
      page: query.page ? String(query.page) : undefined,
      limit: query.limit ? String(query.limit) : undefined,
    },
    cache: 'no-store',
  });
  return handleResponse({ response, showErrorToast: false });
}

/*
 * Returning a month to HR changes HR's run (a draft again, the month unlocked); finalizing marks it
 * transferred. HR's cached screens are re-read: the runs list, the run, lateness and the dashboard
 * (the tags HR's own payroll writes revalidate, `modules/hr/payroll/apis.ts`).
 */
const HR_TAGS = (hrRunId: Uuid) => ['hr-payroll-runs', `hr-payroll-run-${hrRunId}`, 'hr-lateness', 'hr-dashboard'];

/** `POST /accounting/payroll/:month/return` — back to HR as a draft, with a reason; 409 once finalized. */
export async function RETURN_PAYROLL_MONTH(month: Month, hrRunId: Uuid, body: ReturnPayrollMonthRequest) {
  const response = await apiFetch<null>(`/accounting/payroll/${encodeURIComponent(month)}/return`, {
    method: 'POST',
    body: { reason: body.reason },
    revalidateTags: HR_TAGS(hrRunId),
  });
  return handleResponse({ response });
}

/** `POST /accounting/payroll/:month/finalize` — the salaries were transferred: final, never returned. */
export async function FINALIZE_PAYROLL_MONTH(month: Month, hrRunId: Uuid) {
  const response = await apiFetch<AccountingPayrollMonth>(`/accounting/payroll/${encodeURIComponent(month)}/finalize`, {
    method: 'POST',
    revalidateTags: HR_TAGS(hrRunId),
  });
  return handleResponse({ response });
}
