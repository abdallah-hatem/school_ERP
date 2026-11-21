'use server';

import type {
  CreateAdjustmentRequest,
  EmployeePayrollLine,
  Month,
  PayrollRun,
  PayrollRunQuery,
  PayrollRunSummary,
  Payslip,
  Uuid,
} from '@school-erp/shared';
import { apiFetch } from '@/lib/api';
import { handleResponse } from '@/lib/handleResponse';
import type { DownloadedFile } from '@/lib/types';

/*
 * Payroll screens' endpoints (contract → "Payroll — hr"). Every write returns the whole run and
 * revalidates the runs list and that run; the payslip of a run is read only once it is approved.
 */

const RUNS_TAG = 'hr-payroll-runs';
const runTag = (id: Uuid) => `hr-payroll-run-${id}`;
/** Approving a run locks the month's lateness (T13 reads it under this tag). */
const LATENESS_TAG = 'hr-lateness';
/** The dashboard's current-month payroll card. */
const DASHBOARD_TAG = 'hr-dashboard';

const runPath = (id: Uuid) => `/hr/payroll-runs/${encodeURIComponent(id)}`;

/**
 * A run write's result, stamped with this server's clock once the API has answered. The run page
 * compares it with its props' `asOf` (`loadRun`), so a render read before the write can't replace
 * it (`useNewestServerState`).
 */
async function stamped<R extends object>(response: Promise<R>): Promise<R & { asOf: number }> {
  const result = await response;
  return { ...result, asOf: Date.now() };
}

/** `GET /hr/payroll-runs?page&limit` — newest month first, with totals. */
export async function GET_PAYROLL_RUNS(query: { page?: number; limit?: number } = {}) {
  const response = await apiFetch<PayrollRunSummary[]>('/hr/payroll-runs', {
    method: 'GET',
    params: {
      page: query.page ? String(query.page) : undefined,
      limit: query.limit ? String(query.limit) : undefined,
    },
    next: { tags: [RUNS_TAG] },
  });
  return handleResponse({ response, showErrorToast: false });
}

/**
 * `GET /hr/employees/:id/payroll-lines?page&limit` — the employee's line in each run, newest month
 * first (profile Payroll tab). Tagged with the runs so every run write refreshes it.
 */
export async function GET_EMPLOYEE_PAYROLL_LINES(employeeId: Uuid, query: { page?: number; limit?: number } = {}) {
  const response = await apiFetch<EmployeePayrollLine[]>(
    `/hr/employees/${encodeURIComponent(employeeId)}/payroll-lines`,
    {
      method: 'GET',
      params: {
        page: query.page ? String(query.page) : undefined,
        limit: query.limit ? String(query.limit) : undefined,
      },
      next: { tags: [RUNS_TAG] },
    },
  );
  return handleResponse({ response, showErrorToast: false });
}

/** `POST /hr/payroll-runs` — a DRAFT run with every active employee; 409 `PAYROLL_RUN_EXISTS`. */
export async function CREATE_PAYROLL_RUN(month: Month) {
  const response = await apiFetch<PayrollRun>('/hr/payroll-runs', {
    method: 'POST',
    body: { month },
    revalidateTags: [RUNS_TAG, DASHBOARD_TAG],
  });
  return handleResponse({ response });
}

/**
 * `GET /hr/payroll-runs/:id?search&departmentId&flagged&page&limit` — the run, its totals (all
 * lines), every adjustment, and one page of the lines matching the filters with their count.
 */
export async function GET_PAYROLL_RUN(id: Uuid, query: PayrollRunQuery = {}) {
  const response = await apiFetch<PayrollRun>(runPath(id), {
    method: 'GET',
    params: {
      search: query.search || undefined,
      departmentId: query.departmentId || undefined,
      flagged: query.flagged ? 'true' : undefined,
      page: query.page ? String(query.page) : undefined,
      limit: query.limit ? String(query.limit) : undefined,
    },
    next: { tags: [RUNS_TAG, runTag(id)] },
  });
  return handleResponse({ response, showErrorToast: false });
}

/** `POST /hr/payroll-runs/:id/recalculate` — rebuilds every line of a draft run. */
export async function RECALCULATE_PAYROLL_RUN(id: Uuid) {
  const response = await apiFetch<PayrollRun>(`${runPath(id)}/recalculate`, {
    method: 'POST',
    revalidateTags: [RUNS_TAG, runTag(id), DASHBOARD_TAG],
  });
  return stamped(handleResponse({ response }));
}

/** `POST /hr/payroll-runs/:id/approve` — recalculates, then locks; 409 `PENDING_PENALTIES`. */
export async function APPROVE_PAYROLL_RUN(id: Uuid) {
  const response = await apiFetch<PayrollRun>(`${runPath(id)}/approve`, {
    method: 'POST',
    revalidateTags: [RUNS_TAG, runTag(id), LATENESS_TAG, DASHBOARD_TAG],
  });
  return stamped(handleResponse({ response }));
}

/** `POST /hr/payroll-runs/:id/adjustments` — a one-off addition or deduction (draft only). */
export async function ADD_PAYROLL_ADJUSTMENT(id: Uuid, body: CreateAdjustmentRequest) {
  const response = await apiFetch<PayrollRun>(`${runPath(id)}/adjustments`, {
    method: 'POST',
    body: {
      employeeId: body.employeeId,
      type: body.type,
      amount: body.amount,
      reason: body.reason,
    },
    revalidateTags: [RUNS_TAG, runTag(id), DASHBOARD_TAG],
  });
  return stamped(handleResponse({ response }));
}

/** `DELETE /hr/payroll-runs/:id/adjustments/:adjId` (draft only). */
export async function REMOVE_PAYROLL_ADJUSTMENT(id: Uuid, adjustmentId: Uuid) {
  const response = await apiFetch<PayrollRun>(`${runPath(id)}/adjustments/${encodeURIComponent(adjustmentId)}`, {
    method: 'DELETE',
    revalidateTags: [RUNS_TAG, runTag(id), DASHBOARD_TAG],
  });
  return stamped(handleResponse({ response }));
}

/** `GET /hr/payroll-runs/:id/lines/:lineId` — payslip data; 409 `PAYROLL_NOT_APPROVED` on a draft. */
export async function GET_PAYSLIP(id: Uuid, lineId: Uuid) {
  const response = await apiFetch<Payslip>(`${runPath(id)}/lines/${encodeURIComponent(lineId)}`, {
    method: 'GET',
    next: { tags: [runTag(id)] },
  });
  return handleResponse({ response, showErrorToast: false });
}

/** `GET /hr/payroll-runs/:id/bank-sheet` — the approved run's `.xlsx`, as a base64 download. */
export async function GET_BANK_SHEET(id: Uuid) {
  const response = await apiFetch<DownloadedFile>(`${runPath(id)}/bank-sheet`, {
    method: 'GET',
    cache: 'no-store',
    responseType: 'file',
  });
  return handleResponse({ response });
}
