'use server';

import type { SchoolSettings } from '@school-erp/shared';
import { apiFetch } from '@/lib/api';

/** Cache tag for the school settings; `PATCH /settings/school` (T10) revalidates it. */
const SCHOOL_SETTINGS_TAG = 'school-settings';

/** `GET /settings/school` — school identity, hours and default language (contract → core/settings). */
export async function GET_SCHOOL_SETTINGS() {
  return apiFetch<SchoolSettings>('/settings/school', {
    method: 'GET',
    next: { tags: [SCHOOL_SETTINGS_TAG] },
    // The shell falls back to the product name; the page's own requests handle sign-in.
    ignore401Redirect: true,
  });
}
