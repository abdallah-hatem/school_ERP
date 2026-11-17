import type { Language, Names, SchoolSettings } from '@school-erp/shared';

/** What the shell shows: the school's names and logo. */
export interface SchoolBranding extends Names {
  logoUrl: string | null;
}

/**
 * Branding from a settings response, or a plain fallback when the settings can't be read (404
 * before T4 lands, the API down, signed out): the product name and no logo. The shell never breaks
 * because settings are missing.
 */
export function brandingFrom(
  settings: Pick<SchoolSettings, 'nameEn' | 'nameAr' | 'logoUrl'> | null | undefined,
  fallback: Names,
): SchoolBranding {
  const nameEn = settings?.nameEn?.trim();
  const nameAr = settings?.nameAr?.trim();
  return {
    nameEn: nameEn || nameAr || fallback.nameEn,
    nameAr: nameAr || nameEn || fallback.nameAr,
    logoUrl: settings?.logoUrl || null,
  };
}

/**
 * The browser tab title for a branding: `"<page> · <school name>"` in the screen's language (the
 * school's name falls back to the product name, see `brandingFrom`), and the bare school name for a
 * page without its own title.
 */
export function titleTemplateFor(branding: Names, locale: Language): { template: string; default: string } {
  const school = locale === 'ar' ? branding.nameAr : branding.nameEn;
  return { template: `%s · ${school}`, default: school };
}
