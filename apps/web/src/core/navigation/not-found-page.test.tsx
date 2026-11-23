// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/ar/nope',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
}));

import { renderWithI18n } from '@/test/render';
import { NotFoundPage } from './not-found-page';

const branding = { nameEn: 'Nile School', nameAr: 'مدرسة النيل', logoUrl: null };

afterEach(cleanup);

describe('NotFoundPage (outside the shell)', () => {
  it('EN, signed in: the school, the language switch, "Page not found" and Back to the dashboard', () => {
    renderWithI18n(<NotFoundPage branding={branding} signedIn />, { locale: 'en' });
    expect(screen.getByText('Nile School')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Language' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to the dashboard' }).getAttribute('href')).toBe('/en');
    expect(document.title).toBe('Page not found · Nile School');
  });

  it('AR, signed out: Arabic school name and Sign in', () => {
    renderWithI18n(<NotFoundPage branding={branding} signedIn={false} />, { locale: 'ar', session: null });
    expect(screen.getByText('مدرسة النيل')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'الصفحة غير موجودة' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'تسجيل الدخول' }).getAttribute('href')).toBe('/ar/login');
    expect(document.title).toBe('الصفحة غير موجودة · مدرسة النيل');
  });
});
