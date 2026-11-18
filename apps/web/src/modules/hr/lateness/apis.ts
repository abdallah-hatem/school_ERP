'use server';

import type { LatenessMonth, Month, PutLatenessRequest } from '@school-erp/shared';
import { apiFetch } from '@/lib/api';
import { handleResponse } from '@/lib/handleResponse';

/** Cache tag for a month's lateness list; `PUT /hr/lateness/:month` revalidates it. */
const LATENESS_TAG = 'hr-lateness';

/**
 * `GET /hr/lateness?month=` — one row per active employee (0 minutes when not entered), each with
 * its department, whether the month is locked by an approved payroll, and the lateness rule the
 * days use (so the screen needs no `hr.settings.view`).
 */
export async function GET_LATENESS(month: Month) {
  const response = await apiFetch<LatenessMonth>('/hr/lateness', {
    method: 'GET',
    params: { month },
    next: { tags: [LATENESS_TAG] },
  });
  return handleResponse({ response, showErrorToast: false });
}

/** `PUT /hr/lateness/:month` — upserts only the sent entries; returns the month's whole list. */
export async function PUT_LATENESS(month: Month, body: PutLatenessRequest) {
  const response = await apiFetch<LatenessMonth>(`/hr/lateness/${encodeURIComponent(month)}`, {
    method: 'PUT',
    body: { entries: body.entries },
    revalidateTags: [LATENESS_TAG],
  });
  return handleResponse({ response });
}
