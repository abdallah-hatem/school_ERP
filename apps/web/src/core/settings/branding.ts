import type { Names, SchoolSettings } from '@school-erp/shared';

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
