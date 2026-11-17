'use server';

import type { HrSettings, LatenessMonth, Month, PutLatenessRequest } from '@school-erp/shared';
import { apiFetch } from '@/lib/api';
import { handleResponse } from '@/lib/handleResponse';

/** Cache tag for a month's lateness list; `PUT /hr/lateness/:month` revalidates it. */
const LATENESS_TAG = 'hr-lateness';
/** Cache tag for the HR rule settings (`PATCH /hr/settings`, T10, revalidates it). */
const HR_SETTINGS_TAG = 'hr-settings';

/**
 * `GET /hr/lateness?month=` — one row per active employee (0 minutes when not entered), each with
 * its department, and whether the month is locked by an approved payroll.
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

/** `GET /hr/settings` — the live lateness rule the "days" preview is computed with. */
export async function GET_HR_SETTINGS() {
  const response = await apiFetch<HrSettings>('/hr/settings', {
    method: 'GET',
    next: { tags: [HR_SETTINGS_TAG] },
  });
  return handleResponse({ response, showErrorToast: false });
}
