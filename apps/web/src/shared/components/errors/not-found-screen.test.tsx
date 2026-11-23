// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/nope',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
}));

import { renderWithI18n } from '@/test/render';
import { NotFoundScreen } from './not-found-screen';

afterEach(cleanup);

describe('NotFoundScreen', () => {
  it('a wrong address, signed in (EN): "Page not found" and Back to the dashboard, focus on the heading', () => {
    renderWithI18n(<NotFoundScreen variant="page" signedIn siteName="Nile School" />, { locale: 'en' });
    const heading = screen.getByRole('heading', { level: 1, name: 'Page not found' });
    expect(heading).toHaveProperty('tabIndex', -1);
    expect(document.activeElement).toBe(heading);
    expect(screen.getByText('The address may be mistyped, or the page has moved.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to the dashboard' }).getAttribute('href')).toBe('/en');
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
    expect(document.title).toBe('Page not found · Nile School');
  });

  it('a wrong address, signed out (AR): Sign in, never the dashboard', () => {
    renderWithI18n(<NotFoundScreen variant="page" signedIn={false} siteName="مدرسة النيل" />, { locale: 'ar' });
    expect(screen.getByRole('heading', { level: 1, name: 'الصفحة غير موجودة' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'تسجيل الدخول' }).getAttribute('href')).toBe('/ar/login');
    expect(screen.queryByRole('link', { name: 'العودة إلى لوحة التحكم' })).toBeNull();
  });

  it('inside the shell (EN and AR): the same words for missing, out of scope and forbidden', () => {
    renderWithI18n(<NotFoundScreen variant="shell" signedIn siteName="Nile School" />, { locale: 'en' });
    expect(screen.getByRole('heading', { level: 1, name: "We couldn't find that page" })).toBeTruthy();
    expect(screen.getByText('It may have moved, or you may not have access to it.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to the dashboard' }).getAttribute('href')).toBe('/en');
    cleanup();

    renderWithI18n(<NotFoundScreen variant="shell" signedIn siteName="مدرسة النيل" />, { locale: 'ar' });
    expect(screen.getByRole('heading', { level: 1, name: 'لم نعثر على هذه الصفحة' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'العودة إلى لوحة التحكم' }).getAttribute('href')).toBe('/ar');
  });

  it('keeps its tab title when the page\'s streamed metadata writes the section title over it', async () => {
    renderWithI18n(<NotFoundScreen variant="shell" signedIn siteName="Nile School" />, { locale: 'en' });
    document.title = 'Employees · Nile School';
    await new Promise((r) => setTimeout(r, 0));
    expect(document.title).toBe("We couldn't find that page · Nile School");

    cleanup(); // gone: the next page's title is left alone
    document.title = 'Payroll · Nile School';
    await new Promise((r) => setTimeout(r, 0));
    expect(document.title).toBe('Payroll · Nile School');
  });

  it('draws the "404" as shapes, not text (no font can change it), hidden from screen readers', () => {
    const { container } = renderWithI18n(<NotFoundScreen variant="page" signedIn siteName="x" />);
    const art = container.querySelector('svg[data-art="not-found"]');
    expect(art?.getAttribute('aria-hidden')).toBe('true');
    expect(art?.querySelector('text')).toBeNull();
  });
});
