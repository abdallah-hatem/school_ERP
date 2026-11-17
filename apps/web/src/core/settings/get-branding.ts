import { getCommonMessages } from '@/shared/lib/i18n';
import { GET_PUBLIC_SCHOOL_SETTINGS, GET_SCHOOL_SETTINGS } from './apis';
import { brandingFrom, type SchoolBranding } from './branding';

const fallback = () => ({
  nameEn: getCommonMessages('en').app.name,
  nameAr: getCommonMessages('ar').app.name,
});

/** Server: the school's branding for the shell, falling back to the product name. */
export async function getSchoolBranding(): Promise<SchoolBranding> {
  const res = await GET_SCHOOL_SETTINGS();
  return brandingFrom(res.success ? res.data : null, fallback());
}

/** Server: the same branding for signed-out pages (sign-in), from the public endpoint. */
export async function getPublicSchoolBranding(): Promise<SchoolBranding> {
  const res = await GET_PUBLIC_SCHOOL_SETTINGS();
  return brandingFrom(res.success ? res.data : null, fallback());
}
