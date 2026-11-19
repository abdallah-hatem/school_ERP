import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * A signed-in user without `core.settings.view` (principal, HR manager, a custom payroll role): the
 * API answers 403 on `GET /settings/school`, so branding read from it fell back to "School ERP".
 * The shell, the dashboard and the tab titles read the public endpoint instead.
 */
const apiFetch = vi.fn();
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

const { getSchoolBranding } = await import('./get-branding');
const { sectionMetadata } = await import('@/core/navigation/section-metadata');

const school = { nameEn: 'Nile School', nameAr: 'مدرسة النيل', logoUrl: '/files/logo.png', defaultLanguage: 'en' };

beforeEach(() => {
  apiFetch.mockReset();
  // As the API answers someone without `core.settings.view`.
  apiFetch.mockImplementation(async (path: string) =>
    path === '/settings/school/public'
      ? { success: true, status: 200, data: school }
      : { success: false, status: 403, message: 'Forbidden' },
  );
});

describe('the school name and logo for every signed-in user', () => {
  it('come from the public endpoint, never the permission-gated settings', async () => {
    expect(await getSchoolBranding()).toEqual({ nameEn: 'Nile School', nameAr: 'مدرسة النيل', logoUrl: '/files/logo.png' });
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch.mock.calls[0]?.[0]).toBe('/settings/school/public');
  });

  it('name the tab title too ("Dashboard · Nile School", Arabic as well)', async () => {
    const en = await sectionMetadata('dashboard')({ params: Promise.resolve({ locale: 'en' }) });
    const ar = await sectionMetadata('dashboard')({ params: Promise.resolve({ locale: 'ar' }) });
    expect(en.title).toEqual({ absolute: expect.stringMatching(/· Nile School$/) });
    expect(ar.title).toEqual({ absolute: expect.stringMatching(/· مدرسة النيل$/) });
  });

  it('fall back to the product name only when the API cannot be read at all', async () => {
    apiFetch.mockResolvedValue({ success: false, status: 503, message: 'down' });
    const branding = await getSchoolBranding();
    expect(branding.logoUrl).toBeNull();
    expect(branding.nameEn).not.toBe('Nile School');
  });
});
