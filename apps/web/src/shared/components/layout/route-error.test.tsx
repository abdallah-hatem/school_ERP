// @vitest-environment jsdom
import { act, cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => '/en/payroll',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh }),
}));

import { renderWithI18n } from '@/test/render';
import { RouteError } from './route-error';

function serverError(digest?: string): Error & { digest?: string } {
  return Object.assign(new Error('An error occurred in the Server Components render.'), digest ? { digest } : {});
}

let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  refresh.mockClear();
  consoleError.mockRestore();
  vi.useRealTimers();
});

describe('RouteError', () => {
  it('EN: "Something went wrong", the digest as the reference code, Back to the dashboard; focus on the heading', () => {
    const error = serverError('2338785109');
    renderWithI18n(<RouteError error={error} reset={vi.fn()} siteName="Nile School" />, { locale: 'en' });
    const heading = screen.getByRole('heading', { level: 1, name: 'Something went wrong' });
    expect(document.activeElement).toBe(heading);
    expect(screen.getByText('2338785109')).toBeTruthy();
    expect(screen.getByText('Quote this code if you contact support.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to the dashboard' }).getAttribute('href')).toBe('/en');
    expect(document.title).toBe('Something went wrong · Nile School');
    // Never the error's own text.
    expect(screen.queryByText(/Server Components/)).toBeNull();
    // Logged with its code, so the console matches the screen.
    expect(consoleError).toHaveBeenCalledWith('[error-ref 2338785109]', error);
  });

  it('AR: the same screen in Arabic', () => {
    renderWithI18n(<RouteError error={serverError('99')} reset={vi.fn()} />, { locale: 'ar' });
    expect(screen.getByRole('heading', { level: 1, name: 'حدث خطأ ما' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /حاول مرة أخرى/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'العودة إلى لوحة التحكم' }).getAttribute('href')).toBe('/ar');
    expect(screen.getByText('اذكر هذا الرمز إذا تواصلت مع الدعم الفني.')).toBeTruthy();
  });

  it('Copy puts the code on the clipboard and says Copied, then Copy again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    renderWithI18n(<RouteError error={serverError('4471002981')} reset={vi.fn()} />, { locale: 'en' });

    await user.click(screen.getByRole('button', { name: 'Copy the reference code' }));
    expect(writeText).toHaveBeenCalledWith('4471002981');
    expect(screen.getByText('Copied')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText('Copy')).toBeTruthy();
  });

  it('Try again refetches the page and resets the boundary', async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    renderWithI18n(<RouteError error={serverError('1')} reset={reset} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: /Try again/ }));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('an error thrown in the browser (no digest) gets a short random code, logged with the error', () => {
    const error = new Error('boom');
    const { container } = renderWithI18n(<RouteError error={error} reset={vi.fn()} />, { locale: 'en' });
    const code = container.querySelector('[data-reference-code]')?.getAttribute('data-reference-code') ?? '';
    expect(code).toMatch(/^C-[0-9A-HJ-NP-Z]{6}$/);
    expect(consoleError).toHaveBeenCalledWith(`[error-ref ${code}]`, error);
  });

  it('on the sign-in pages: no Back to the dashboard', () => {
    renderWithI18n(<RouteError error={serverError('1')} reset={vi.fn()} showHome={false} />, { locale: 'en', session: null });
    expect(screen.queryByRole('link', { name: 'Back to the dashboard' })).toBeNull();
    expect(screen.getByRole('button', { name: /Try again/ })).toBeTruthy();
  });
});
