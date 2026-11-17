// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
let pathname = '/en/payroll';
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
}));

import { renderWithI18n } from '@/test/render';
import { LocaleSwitch } from './locale-switch';

describe('LocaleSwitch', () => {
  beforeEach(() => {
    pathname = '/en/payroll';
    window.history.replaceState(null, '', '/en/payroll?month=2026-11');
    document.cookie = 'lang=; path=/; max-age=0';
  });
  afterEach(() => {
    cleanup();
    push.mockClear();
  });

  it('Switching language flips direction without a reload and keeps the page', async () => {
    const user = userEvent.setup();
    renderWithI18n(<LocaleSwitch />, { locale: 'en' });
    expect(document.documentElement.dir).toBe('ltr');

    await user.click(screen.getByRole('button', { name: 'العربية' }));

    // Direction and language flip at once, before the new page renders.
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
    // Same page and query, client-side navigation, scroll position kept.
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/ar/payroll?month=2026-11', { scroll: false });
    // The API hears the new language on the next request.
    expect(document.cookie).toContain('lang=ar');
  });

  it('switches back from Arabic to English on the same page', async () => {
    const user = userEvent.setup();
    pathname = '/ar/employees';
    window.history.replaceState(null, '', '/ar/employees');
    renderWithI18n(<LocaleSwitch />, { locale: 'ar' });

    await user.click(screen.getByRole('button', { name: 'English' }));

    expect(document.documentElement.dir).toBe('ltr');
    expect(push).toHaveBeenCalledWith('/en/employees', { scroll: false });
  });

  it('does nothing when the current language is chosen again', async () => {
    const user = userEvent.setup();
    renderWithI18n(<LocaleSwitch />, { locale: 'en' });
    const english = screen.getByRole('button', { name: 'English' });
    expect(english.getAttribute('aria-pressed')).toBe('true');

    await user.click(english);

    expect(push).not.toHaveBeenCalled();
    expect(document.documentElement.dir).toBe('ltr');
  });
});
