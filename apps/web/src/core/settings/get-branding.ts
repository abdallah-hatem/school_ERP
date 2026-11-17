import { getCommonMessages } from '@/shared/lib/i18n';
import { GET_SCHOOL_SETTINGS } from './apis';
import { brandingFrom, type SchoolBranding } from './branding';

/** Server: the school's branding for the shell, falling back to the product name. */
export async function getSchoolBranding(): Promise<SchoolBranding> {
  const fallback = {
    nameEn: getCommonMessages('en').app.name,
    nameAr: getCommonMessages('ar').app.name,
  };
  const res = await GET_SCHOOL_SETTINGS();
  return brandingFrom(res.success ? res.data : null, fallback);
}
