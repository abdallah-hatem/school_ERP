'use server';

import type { PublicSchoolSettings } from '@school-erp/shared';
import { apiFetch } from '@/lib/api';
import { SCHOOL_SETTINGS_TAG } from './tags';

/**
 * `GET /settings/school/public` — names, logo and language only, readable by anyone: signed out
 * (the sign-in page) and every signed-in user whatever their permissions (the shell's branding;
 * `GET /settings/school` needs `core.settings.view`). Sent without the session so it never
 * triggers a refresh.
 */
export async function GET_PUBLIC_SCHOOL_SETTINGS() {
  return apiFetch<PublicSchoolSettings>('/settings/school/public', {
    method: 'GET',
    includeAuth: false,
    ignore401Redirect: true,
    next: { tags: [SCHOOL_SETTINGS_TAG] },
  });
}
