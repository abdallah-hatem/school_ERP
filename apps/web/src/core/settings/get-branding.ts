import { getCommonMessages } from '@/shared/lib/i18n';
import { GET_PUBLIC_SCHOOL_SETTINGS } from './apis';
import { brandingFrom, type SchoolBranding } from './branding';

const fallback = () => ({
  nameEn: getCommonMessages('en').app.name,
  nameAr: getCommonMessages('ar').app.name,
});

/**
 * Server: the school's names and logo for every screen that shows them — the shell, the dashboard,
 * the tab titles and the signed-out pages — falling back to the product name. Always the public
 * endpoint: everyone sees the school's name, and `GET /settings/school` needs `core.settings.view`
 * (a principal or an HR manager would read "School ERP"). Only the Settings screen reads the full
 * settings, to edit them.
 */
export async function getSchoolBranding(): Promise<SchoolBranding> {
  const res = await GET_PUBLIC_SCHOOL_SETTINGS();
  return brandingFrom(res.success ? res.data : null, fallback());
}
