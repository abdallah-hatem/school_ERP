'use server';

import type { PublicSchoolSettings, SchoolSettings } from '@school-erp/shared';
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

/**
 * `GET /settings/school/public` — names, logo and language only, readable signed out (the
 * sign-in page). Sent without the session so it never triggers a refresh.
 */
export async function GET_PUBLIC_SCHOOL_SETTINGS() {
  return apiFetch<PublicSchoolSettings>('/settings/school/public', {
    method: 'GET',
    includeAuth: false,
    ignore401Redirect: true,
    next: { tags: [SCHOOL_SETTINGS_TAG] },
  });
}
