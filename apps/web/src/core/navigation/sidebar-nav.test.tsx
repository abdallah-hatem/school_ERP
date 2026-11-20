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

import type { SessionUser } from '@school-erp/shared';
import { renderWithI18n, sessionWithout, TEST_SESSION } from '@/test/render';
import { SidebarNav } from './sidebar-nav';

function renderNav(variant: 'full' | 'rail' = 'full', locale: 'en' | 'ar' = 'en', session: SessionUser = TEST_SESSION) {
  return renderWithI18n(<SidebarNav variant={variant} />, { locale, session });
}

const hrButton = (name = 'HR') => screen.getByRole('button', { name });
/** HR's "Payroll" and Accounting's "Approved pay", each by its name and where it goes. */
const payrollLink = (href = '/en/payroll') =>
  screen
    .queryAllByRole('link', { name: href === '/en/accounting/payroll' ? 'Approved pay' : 'Payroll' })
    .find((l) => l.getAttribute('href') === href) ?? null;

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
    expect(payrollLink()).toBeTruthy();

    await user.click(hrButton());
    expect(hrButton().getAttribute('aria-expanded')).toBe('false');
    expect(payrollLink()).toBeNull();
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
    expect(payrollLink()?.getAttribute('aria-current')).toBe('page');
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
    for (const name of ['Inventory', 'Students']) {
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
    expect(screen.getByRole('img', { name: 'Inventory — coming soon' })).toBeTruthy();
    // Accounting has two pages now: like HR, the rail opens them in a flyout.
    expect(screen.queryByRole('link', { name: 'Payroll taxes' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Penalties' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Accounting' }));
    const accounting = await screen.findByRole('dialog', { name: 'Accounting pages' });
    expect(within(accounting).getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual([
      '/en/accounting/payroll',
      '/en/accounting/payroll-taxes',
    ]);
    await user.keyboard('{Escape}');

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
    expect(screen.getByRole('link', { name: 'ضرائب الرواتب' }).getAttribute('href')).toBe('/ar/accounting/payroll-taxes');
    expect(screen.getAllByText('قريبًا')).toHaveLength(2);
    await user.click(hr);
    expect(screen.queryByRole('link', { name: 'التأخير' })).toBeNull();
  });

  it('Accounting is live: Approved pay and Payroll taxes, for whoever holds accounting.payroll.view', () => {
    pathname = '/en/accounting/payroll-taxes/2026-10';
    renderNav();
    const accounting = screen.getByRole('button', { name: 'Accounting' });
    const list = document.getElementById(accounting.getAttribute('aria-controls') ?? '') as HTMLElement;
    expect(within(list).getAllByRole('link').map((l) => l.textContent)).toEqual(['Approved pay', 'Payroll taxes']);
    const link = screen.getByRole('link', { name: 'Payroll taxes' });
    expect(link.getAttribute('href')).toBe('/en/accounting/payroll-taxes');
    expect(link.getAttribute('aria-current')).toBe('page');
    // Neither Payroll page is current on /accounting/payroll-taxes (a prefix, not a parent).
    expect(payrollLink()?.getAttribute('aria-current')).toBeNull();
    expect(payrollLink('/en/accounting/payroll')?.getAttribute('aria-current')).toBeNull();
    cleanup();

    pathname = '/en/accounting/payroll/2026-10';
    renderNav();
    expect(payrollLink('/en/accounting/payroll')?.getAttribute('aria-current')).toBe('page');
    expect(payrollLink()?.getAttribute('aria-current')).toBeNull();
    cleanup();

    renderNav('full', 'en', sessionWithout('accounting.payroll.view'));
    expect(screen.queryByRole('link', { name: 'Payroll taxes' })).toBeNull();
    expect(payrollLink('/en/accounting/payroll')).toBeNull();
    expect(screen.queryByText('Accounting')).toBeNull();
  });

  describe('only what the user may see (can(), view only)', () => {
    it('the HR admin sees every page and Settings', () => {
      renderNav();
      for (const name of ['Dashboard', 'Employees', 'Penalties', 'Lateness', 'Settings']) {
        expect(screen.getByRole('link', { name })).toBeTruthy();
      }
      expect(payrollLink()).toBeTruthy();
      expect(payrollLink('/en/accounting/payroll')).toBeTruthy();
    });

    it('a page without its view permission is left out', () => {
      renderNav('full', 'en', sessionWithout('hr.payroll.view', 'hr.lateness.view'));
      expect(screen.getByRole('link', { name: 'Employees' })).toBeTruthy();
      expect(payrollLink()).toBeNull();
      expect(screen.queryByRole('link', { name: 'Lateness' })).toBeNull();
    });

    it('a module with no visible page is not drawn; coming modules still are', () => {
      renderNav('full', 'en', sessionWithout('hr.employees.view', 'hr.penalties.view', 'hr.lateness.view', 'hr.payroll.view'));
      expect(screen.queryByRole('button', { name: 'HR' })).toBeNull();
      expect(screen.getAllByText('Soon')).toHaveLength(2);
      cleanup();
      renderNav('rail', 'en', sessionWithout('hr.employees.view', 'hr.penalties.view', 'hr.lateness.view', 'hr.payroll.view'));
      expect(screen.queryByRole('button', { name: 'HR' })).toBeNull();
    });

    it('Administration holds Settings and Activity; Activity needs core.audit.view', () => {
      pathname = '/en/activity';
      renderNav();
      const admin = screen.getByRole('button', { name: 'Administration' });
      expect(admin.getAttribute('aria-expanded')).toBe('true');
      const list = document.getElementById(admin.getAttribute('aria-controls') ?? '') as HTMLElement;
      expect(within(list).getAllByRole('link').map((l) => l.textContent)).toEqual(['Settings', 'Activity', 'Users', 'Roles']);
      expect(within(list).getByRole('link', { name: 'Activity' }).getAttribute('aria-current')).toBe('page');
      cleanup();

      renderNav('full', 'en', sessionWithout('core.audit.view'));
      expect(screen.queryByRole('link', { name: 'Activity' })).toBeNull();
      expect(screen.getByRole('link', { name: 'Settings' })).toBeTruthy();
      cleanup();

      renderNav('full', 'ar');
      expect(screen.getByRole('link', { name: 'سجل النشاط' }).getAttribute('href')).toBe('/ar/activity');
    });

    it('Users needs core.users.view and Roles core.roles.view (P3); an HR officer sees neither', () => {
      renderNav('full', 'en', sessionWithout('core.users.view'));
      expect(screen.queryByRole('link', { name: 'Users' })).toBeNull();
      expect(screen.getByRole('link', { name: 'Roles' }).getAttribute('href')).toBe('/en/roles');
      cleanup();

      renderNav('full', 'en', sessionWithout('core.roles.view'));
      expect(screen.getByRole('link', { name: 'Users' }).getAttribute('href')).toBe('/en/users');
      expect(screen.queryByRole('link', { name: 'Roles' })).toBeNull();
      cleanup();

      // An HR officer: HR pages only, no Users / Roles / Activity.
      renderNav('full', 'en', sessionWithout('core.users.view', 'core.roles.view', 'core.audit.view', 'core.settings.view', 'core.stages.view', 'hr.settings.view', 'hr.lists.view', 'hr.penalty_catalogue.view', 'accounting.settings.view', 'core.notifications.view'));
      for (const name of ['Users', 'Roles', 'Activity', 'Settings']) expect(screen.queryByRole('link', { name })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Administration' })).toBeNull();
      expect(screen.getByRole('link', { name: 'Employees' })).toBeTruthy();
    });

    it('Settings shows with any one of its sections, and not with none', () => {
      const settingsKeys = [
        'core.settings.view',
        'hr.settings.view',
        'hr.lists.view',
        'core.stages.view',
        'hr.penalty_catalogue.view',
        'accounting.settings.view',
        'core.notifications.view',
      ];
      renderNav('full', 'en', sessionWithout(...settingsKeys.filter((k) => k !== 'hr.lists.view')));
      expect(screen.getByRole('link', { name: 'Settings' })).toBeTruthy();
      cleanup();
      renderNav('full', 'en', sessionWithout(...settingsKeys));
      expect(screen.queryByRole('link', { name: 'Settings' })).toBeNull();      cleanup();
      // The Accountant: only Settings → Accounting (§10).
      renderNav('full', 'en', sessionWithout(...settingsKeys.filter((k) => k !== 'accounting.settings.view')));
      expect(screen.getByRole('link', { name: 'Settings' })).toBeTruthy();
    });
  });
});
