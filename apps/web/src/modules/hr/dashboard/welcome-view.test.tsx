// @vitest-environment jsdom
import { BUILT_IN_ROLES, type SessionUser } from '@school-erp/shared';
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }), redirect: vi.fn() }));
vi.mock('./apis', () => ({ GET_HR_DASHBOARD: vi.fn() }));

import { SchoolBrandingProvider } from '@/core/settings';
import { I18nProvider } from '@/shared/providers/i18n-provider';
import { renderWithI18n, sessionWith, STAGE_HEAD_KEYS } from '@/test/render';
import { GET_HR_DASHBOARD } from './apis';
import { dashboardMessages } from './dashboard-screen';
import { WelcomeView, welcomeScreens } from './welcome-view';

/* Home without `hr.dashboard.view` (§2): a welcome with the viewer's name and links to their screens. */

const BRANDING = { nameEn: 'Test School', nameAr: 'مدرسة الاختبار', logoUrl: null };

function renderAs(session: SessionUser, locale: 'en' | 'ar' = 'en') {
  return renderWithI18n(
    <SchoolBrandingProvider initial={BRANDING}>
      <I18nProvider messages={dashboardMessages(locale)}>
        <WelcomeView />
      </I18nProvider>
    </SchoolBrandingProvider>,
    { session, locale },
  );
}

const links = () =>
  within(screen.getByRole('region', { name: /Your screens|شاشاتك/ }))
    .getAllByRole('link')
    .map((l) => [l.textContent, l.getAttribute('href')]);

const keysOf = (role: string) => Object.keys(BUILT_IN_ROLES.find((r) => r.key === role)!.permissions);

afterEach(cleanup);

describe('Home without hr.dashboard.view', () => {
  it('a Stage head: greeted by name, links to Employees, Contracts, Penalties, Settings and My account — no figures, no request', () => {
    renderAs({ ...sessionWith(...STAGE_HEAD_KEYS), name: 'Mona Adel' });
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome, Mona Adel' })).toBeTruthy();
    expect(screen.getByText('Test School. These are the screens you can open.')).toBeTruthy();
    expect(links()).toEqual([
      ['Employees', '/en/employees'],
      ['Contracts', '/en/contracts'],
      ['Penalties', '/en/penalties'],
      ['Settings', '/en/settings'],
      ['My account', '/en/account'],
    ]);
    expect(screen.queryByText('Active employees')).toBeNull();
    expect(GET_HR_DASHBOARD).not.toHaveBeenCalled();
  });

  it("the Accountant: Employees, HR's Payroll, Accounting's Approved pay, Payroll taxes, Settings (Accounting), My account", () => {
    renderAs(sessionWith(...keysOf('accountant')));
    expect(links().map(([label]) => label)).toEqual(['Employees', 'Payroll', 'Approved pay', 'Payroll taxes', 'Settings', 'My account']);
    expect(links().map(([, href]) => href).slice(1, 3)).toEqual(['/en/payroll', '/en/accounting/payroll']);
  });

  it('no permission at all: says so, and still offers My account', () => {
    renderAs(sessionWith());
    expect(screen.getByText('No screens yet')).toBeTruthy();
    // They may already hold a role: the hint never claims they have none.
    expect(screen.getByText("Your roles don't open any screen yet. Ask the system admin if you need one.")).toBeTruthy();
    expect(links()).toEqual([['My account', '/en/account']]);
  });

  it('Arabic: the welcome and the links read in Arabic, under the Arabic locale', () => {
    renderAs({ ...sessionWith(...STAGE_HEAD_KEYS), name: 'منى عادل' }, 'ar');
    expect(screen.getByRole('heading', { level: 1, name: 'أهلًا بك، منى عادل' })).toBeTruthy();
    expect(links()[0]).toEqual(['الموظفون', '/ar/employees']);
  });

  it('welcomeScreens follows SCREENS: never Home itself, in menu order', () => {
    expect(welcomeScreens(STAGE_HEAD_KEYS).map((s) => s.key)).toEqual(['employees', 'contracts', 'penalties', 'settings']);
    expect(welcomeScreens([]).length).toBe(0);
  });
});
