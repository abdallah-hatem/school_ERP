// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { settingsHref } from '@school-erp/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  GET_HR_SETTINGS: vi.fn(),
  UPDATE_HR_SETTINGS: vi.fn(),
  GET_SCHOOL_CALENDAR: vi.fn(),
  PUT_SCHOOL_CALENDAR: vi.fn(),
}));
vi.mock('../apis', () => api);

// The address the payroll rules panel's "Edit in settings" opens.
const address = vi.hoisted(() => ({ search: '' }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/en/settings',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(address.search),
  redirect: vi.fn(),
}));

import { sessionWith } from '@/test/render';
import { SettingsScreen } from '../components/settings-screen';
import { parseSection } from '../sections';
import { deferred, hrSettings, ok, renderSettings } from './helpers';

const HR_MANAGER = sessionWith('hr.settings.view', 'hr.settings.edit', 'core.settings.view', 'hr.lists.view');

function payrollCard(): HTMLElement | undefined {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-settings-part="payroll"]')).find((el) => !el.closest('[inert]'));
}

function openFromLink(href: string) {
  const url = new URL(href, 'http://school.test');
  address.search = url.search;
  return renderSettings(<SettingsScreen initialSection={parseSection(url.searchParams.get('section') ?? undefined)} />, 'en', HR_MANAGER);
}

describe('Settings — a link lands on one card (owner, 2026-11-24)', () => {
  const scrollTo = vi.fn();
  beforeEach(() => {
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    api.GET_SCHOOL_CALENDAR.mockImplementation((year: number) => ok({ year, calendar: null }));
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    address.search = '';
  });

  it('the payroll rules link opens the HR rules tab and lands on Payroll rule once it has loaded', async () => {
    const href = settingsHref('en', 'hrRules', 'payroll');
    expect(href).toBe('/en/settings?section=hrRules&part=payroll');
    const settings = deferred<Awaited<ReturnType<typeof ok<typeof hrSettings>>>>();
    api.GET_HR_SETTINGS.mockImplementation(() => settings.promise);
    openFromLink(href);

    // The HR rules tab is the open one, not the first section (School).
    expect(screen.getByRole('button', { name: /HR rules/, current: 'page' })).toBeTruthy();
    // While the rules load only the skeleton copy exists: nothing lands on it.
    expect(payrollCard()).toBeUndefined();
    expect(scrollTo).not.toHaveBeenCalled();

    await act(async () => settings.resolve(await ok(hrSettings)));
    await waitFor(() => expect(payrollCard()?.hasAttribute('data-landed')).toBe(true));
    const card = payrollCard()!;
    expect(card.querySelector('h2')?.textContent).toBe('Payroll rule');
    expect(document.activeElement).toBe(card.querySelector('h2'));
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('gives up when the person scrolls or taps before the rules load, so the page never jumps', async () => {
    const settings = deferred<Awaited<ReturnType<typeof ok<typeof hrSettings>>>>();
    api.GET_HR_SETTINGS.mockImplementation(() => settings.promise);
    openFromLink(settingsHref('en', 'hrRules', 'payroll'));
    fireEvent.pointerDown(window);
    await act(async () => settings.resolve(await ok(hrSettings)));
    await waitFor(() => expect(payrollCard()).toBeTruthy());
    expect(payrollCard()?.hasAttribute('data-landed')).toBe(false);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('ignores a part the section does not have', async () => {
    api.GET_HR_SETTINGS.mockImplementation(() => ok(hrSettings));
    openFromLink('/en/settings?section=hrRules&part=nope');
    await waitFor(() => expect(payrollCard()).toBeTruthy());
    expect(payrollCard()?.hasAttribute('data-landed')).toBe(false);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
