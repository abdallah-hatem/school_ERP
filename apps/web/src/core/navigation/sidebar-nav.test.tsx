// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let pathname = '/en';
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('next/link', () => ({
  // Navigation is the router's job; a link here only fires its onClick.
  default: ({ children, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode }) => (
    <a
      {...props}
      onClick={(e) => {
        e.preventDefault();
        onClick?.(e);
      }}
    >
      {children}
    </a>
  ),
}));

import { renderWithI18n } from '@/test/render';
import { SidebarNav } from './sidebar-nav';

function renderNav(variant: 'full' | 'rail' = 'full', locale: 'en' | 'ar' = 'en') {
  return renderWithI18n(<SidebarNav variant={variant} />, { locale });
}

const hrButton = (name = 'HR') => screen.getByRole('button', { name });

describe('SidebarNav (grouped by module)', () => {
  beforeEach(() => {
    pathname = '/en';
    window.localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('HR group: open by default, collapses and expands, and remembers the choice', async () => {
    const user = userEvent.setup();
    renderNav();
    expect(hrButton().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('link', { name: 'Payroll' })).toBeTruthy();

    await user.click(hrButton());
    expect(hrButton().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('link', { name: 'Payroll' })).toBeNull();
    expect(JSON.parse(window.localStorage.getItem('nav.groups') ?? '{}')).toEqual({ hr: false });

    cleanup();
    renderNav();
    expect(hrButton().getAttribute('aria-expanded')).toBe('false');

    await user.click(hrButton());
    expect(hrButton().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('link', { name: 'Employees' }).getAttribute('href')).toBe('/en/employees');
  });

  it('a current page inside a group opens it, even when it was left closed', () => {
    window.localStorage.setItem('nav.groups', JSON.stringify({ hr: false }));
    pathname = '/en/payroll/2026-11';
    renderNav();
    expect(hrButton().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('link', { name: 'Payroll' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Dashboard' }).getAttribute('aria-current')).toBeNull();
  });

  it('blocked storage: every group still opens and toggles', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const user = userEvent.setup();
    renderNav();
    expect(hrButton().getAttribute('aria-expanded')).toBe('true');
    await user.click(hrButton());
    expect(hrButton().getAttribute('aria-expanded')).toBe('false');
  });

  it('coming modules are shown with "Soon" and are not links', () => {
    renderNav();
    for (const name of ['Accounting', 'Inventory', 'Students']) {
      expect(screen.queryByRole('link', { name: new RegExp(name) })).toBeNull();
      expect(screen.queryByRole('button', { name: new RegExp(name) })).toBeNull();
      const row = screen.getByText(name).closest('[aria-disabled="true"]');
      expect(row).not.toBeNull();
      expect(within(row as HTMLElement).getByText('Soon')).toBeTruthy();
    }
  });

  it('rail: one icon per module; HR opens its pages in a flyout, coming modules stay locked', async () => {
    const user = userEvent.setup();
    pathname = '/en/employees';
    renderNav('rail');
    expect(screen.getByRole('link', { name: 'Dashboard' }).getAttribute('href')).toBe('/en');
    expect(screen.getByRole('img', { name: 'Accounting — coming soon' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Penalties' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'HR' }));
    const flyout = await screen.findByRole('dialog', { name: 'HR pages' });
    expect(within(flyout).getByRole('link', { name: 'Employees' }).getAttribute('aria-current')).toBe('page');
    await user.click(within(flyout).getByRole('link', { name: 'Penalties' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('RTL: Arabic names, Arabic links and the same structure', async () => {
    const user = userEvent.setup();
    pathname = '/ar/lateness';
    renderNav('full', 'ar');
    expect(document.documentElement.dir).toBe('rtl');
    const hr = screen.getByRole('button', { name: 'الموارد البشرية' });
    expect(hr.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('link', { name: 'التأخير' }).getAttribute('href')).toBe('/ar/lateness');
    expect(screen.getByRole('link', { name: 'التأخير' }).getAttribute('aria-current')).toBe('page');
    expect(screen.queryByRole('link', { name: /الحسابات/ })).toBeNull();
    expect(screen.getAllByText('قريبًا')).toHaveLength(3);
    await user.click(hr);
    expect(screen.queryByRole('link', { name: 'التأخير' })).toBeNull();
  });
});
