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

import { SIDEBAR_SCREENS, type SessionUser } from '@school-erp/shared';
import { renderWithI18n, sessionWithout, TEST_SESSION } from '@/test/render';
import { NAV_ITEMS, NAV_MODULES } from './nav-items';
import { SidebarNav } from './sidebar-nav';

function renderNav(variant: 'full' | 'rail' = 'full', locale: 'en' | 'ar' = 'en', session: SessionUser = TEST_SESSION) {
  return renderWithI18n(<SidebarNav variant={variant} />, { locale, session });
}

const hrButton = (name = 'HR') => screen.getByRole('button', { name });
/** The top-level entries, in order, each by its name (a locked one's "Soon" tag left out). */
const topLevel = (soon = 'Soon') =>
  [...document.querySelectorAll('nav > div > ul > li')].map((li) => {
    const head = li.querySelector('a, button, [aria-disabled="true"]');
    return (head?.textContent ?? '').replace(soon, '').trim();
  });
/** A group's entries in order: live pages as links, coming ones as locked rows. */
function groupEntries(button: HTMLElement) {
  const list = document.getElementById(button.getAttribute('aria-controls') ?? '') as HTMLElement;
  return [...list.querySelectorAll(':scope > li')].map((li) => {
    const link = li.querySelector('a');
    if (link) return link.textContent ?? '';
    const locked = li.querySelector('[aria-disabled="true"]');
    return `locked:${(locked?.textContent ?? '').replace(/Soon|قريبًا/, '').trim()}`;
  });
}
/** Every "Soon" row: locked, tagged, and neither a link nor a button. */
function expectLocked(name: string, soon = 'Soon') {
  expect(screen.queryByRole('link', { name: new RegExp(name) })).toBeNull();
  expect(screen.queryByRole('button', { name: new RegExp(name) })).toBeNull();
  const row = screen.getByText(name).closest('[aria-disabled="true"]');
  expect(row, name).not.toBeNull();
  expect(row?.tagName).not.toBe('A');
  expect(row?.getAttribute('tabindex')).toBeNull();
  expect(within(row as HTMLElement).getByText(soon)).toBeTruthy();
}
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

  it('order: Dashboard, School, HR, Accounting, Transport, Parent portal, Administration; no Inventory', () => {
    renderNav();
    expect(topLevel()).toEqual(['Dashboard', 'School', 'HR', 'Accounting', 'Transport', 'Parent portal', 'Administration']);
    expect(screen.queryByText('Inventory')).toBeNull();
  });

  it('coming pages sit locked where they belong, with "Soon", never links', () => {
    renderNav();
    // School: a locked group that still opens to show its four coming pages.
    const school = screen.getByRole('button', { name: 'School' });
    expect(school.getAttribute('aria-expanded')).toBe('true');
    expect(groupEntries(school)).toEqual(['locked:Students', 'locked:Academics', 'locked:Attendance', 'locked:Exams & grades']);
    // Leave after Payroll in HR, Fees after the live pages in Accounting.
    expect(groupEntries(hrButton())).toEqual(['Employees', 'Contracts', 'Penalties', 'Lateness', 'Payroll', 'locked:Leave & permissions']);
    expect(groupEntries(screen.getByRole('button', { name: 'Accounting' }))).toEqual([
      'Approved pay',
      'Payroll taxes',
      'locked:Fees',
    ]);
    for (const name of ['Students', 'Academics', 'Attendance', 'Exams & grades', 'Leave & permissions', 'Fees', 'Transport', 'Parent portal']) {
      expectLocked(name);
    }
    expect(screen.getByText('Fees').closest('[aria-disabled="true"]')?.getAttribute('title')).toBe('Fees — coming soon');
    expect(screen.getAllByText('Soon')).toHaveLength(8);
  });

  it('the School group collapses and expands like the others, and is remembered', async () => {
    const user = userEvent.setup();
    renderNav();
    const school = () => screen.getByRole('button', { name: 'School' });
    await user.click(school());
    expect(school().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Academics')).toBeNull();
    expect(JSON.parse(window.localStorage.getItem('nav.groups') ?? '{}')).toEqual({ school: false });
    // Clicking a locked row does nothing.
    await user.click(screen.getByText('Leave & permissions'));
    expect(hrButton().getAttribute('aria-expanded')).toBe('true');
    await user.click(school());
    expect(screen.getByText('Academics')).toBeTruthy();
  });

  it('rail: one icon per module; HR opens its pages in a flyout, coming modules stay locked', async () => {
    const user = userEvent.setup();
    pathname = '/en/employees';
    renderNav('rail');
    expect(screen.getByRole('link', { name: 'Dashboard' }).getAttribute('href')).toBe('/en');
    expect(screen.getByRole('img', { name: 'Transport — coming soon' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Parent portal — coming soon' })).toBeTruthy();
    // School opens its coming pages in a flyout: all locked, none a link.
    await user.click(screen.getByRole('button', { name: 'School' }));
    const school = await screen.findByRole('dialog', { name: 'School pages' });
    expect(within(school).queryAllByRole('link')).toHaveLength(0);
    expect(within(school).getAllByText('Soon')).toHaveLength(4);
    await user.keyboard('{Escape}');
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
    expect(within(flyout).getByText('Leave & permissions').closest('[aria-disabled="true"]')).not.toBeNull();
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
    expect(screen.getAllByText('قريبًا')).toHaveLength(8);
    expect(topLevel('قريبًا')).toEqual([
      'لوحة التحكم',
      'المدرسة',
      'الموارد البشرية',
      'الحسابات',
      'النقل',
      'بوابة أولياء الأمور',
      'الإدارة',
    ]);
    expect(groupEntries(screen.getByRole('button', { name: 'المدرسة' }))).toEqual([
      'locked:الطلاب',
      'locked:الشؤون الأكاديمية',
      'locked:الحضور',
      'locked:الامتحانات والدرجات',
    ]);
    expect(groupEntries(hr).at(-1)).toBe('locked:الإجازات والأذونات');
    for (const name of ['الإجازات والأذونات', 'المصروفات', 'النقل', 'بوابة أولياء الأمور']) expectLocked(name, 'قريبًا');
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
      renderNav('full', 'en', sessionWithout('hr.employees.view', 'hr.contracts.view', 'hr.penalties.view', 'hr.lateness.view', 'hr.payroll.view'));
      expect(screen.queryByRole('button', { name: 'HR' })).toBeNull();
      // HR's Leave goes with HR; School (4), Accounting's Fees, Transport and Parent portal stay.
      expect(screen.queryByText('Leave & permissions')).toBeNull();
      expect(screen.getAllByText('Soon')).toHaveLength(7);
      expect(screen.getByRole('button', { name: 'School' })).toBeTruthy();
      cleanup();
      renderNav('rail', 'en', sessionWithout('hr.employees.view', 'hr.contracts.view', 'hr.penalties.view', 'hr.lateness.view', 'hr.payroll.view'));
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
      renderNav('full', 'en', sessionWithout('core.users.view', 'core.roles.view', 'core.audit.view', 'core.settings.view', 'core.stages.view', 'hr.settings.view', 'hr.lists.view', 'hr.penalty_catalogue.view', 'accounting.settings.view', 'core.notifications.view', 'hr.contract_templates.manage'));
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
        'hr.contract_templates.manage',
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

describe('coming pages are never screens', () => {
  it('no coming page is in NAV_ITEMS or SIDEBAR_SCREENS, so nothing (the welcome page included) can open one', () => {
    const coming = NAV_MODULES.flatMap((m) => (m.coming ?? []).map((c) => c.key));
    expect(coming).toEqual(['students', 'academics', 'attendance', 'exams', 'leave', 'fees']);
    const pages = new Set<string>(NAV_ITEMS.map((i) => i.key));
    const screens = new Set<string>(SIDEBAR_SCREENS);
    for (const key of coming) {
      expect(pages.has(key), key).toBe(false);
      expect(screens.has(key), key).toBe(false);
    }
    // A coming module has no live page: nothing in it has a path.
    for (const m of NAV_MODULES.filter((x) => x.status === 'soon')) expect(m.items).toEqual([]);
  });
});
