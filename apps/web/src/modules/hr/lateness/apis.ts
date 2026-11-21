'use server';

import type { LatenessMonth, LatenessSummary, Month, PutLatenessRequest } from '@school-erp/shared';
import { apiFetch } from '@/lib/api';
import { handleResponse } from '@/lib/handleResponse';

/** Cache tag for a month's lateness list; `PUT /hr/lateness/:month` revalidates it. */
const LATENESS_TAG = 'hr-lateness';

/**
 * `GET /hr/lateness?month&page&search` — one page of the month (a row per active employee, 0 minutes
 * when not entered, by code; the API searches code and both names), whether the month is locked
 * by an approved payroll, the lateness rule the days use (so the screen needs no
 * `hr.settings.view`) and the month's totals over every employee.
 */
export async function GET_LATENESS(month: Month, query: { search?: string; page?: number } = {}) {
  const response = await apiFetch<LatenessMonth>('/hr/lateness', {
    method: 'GET',
    params: { month, search: query.search || undefined, page: query.page && query.page > 1 ? String(query.page) : undefined },
    next: { tags: [LATENESS_TAG] },
  });
  return handleResponse({ response, showErrorToast: false });
}

/** `PUT /hr/lateness/:month` — upserts only the sent entries; answers with the month's lock, rule and totals. */
export async function PUT_LATENESS(month: Month, body: PutLatenessRequest) {
  const response = await apiFetch<LatenessSummary>(`/hr/lateness/${encodeURIComponent(month)}`, {
    method: 'PUT',
    body: { entries: body.entries },
    revalidateTags: [LATENESS_TAG],
  });
  return handleResponse({ response });
}
