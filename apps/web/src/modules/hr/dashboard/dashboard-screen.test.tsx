// @vitest-environment jsdom
import { PayrollStatus, type SessionUser } from '@school-erp/shared';
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  redirect: vi.fn(),
}));
vi.mock('./apis', () => ({ GET_HR_DASHBOARD: vi.fn() }));
const session = vi.hoisted(() => ({ current: null as SessionUser | null }));
vi.mock('@/core/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/auth')>()),
  getSession: async () => session.current,
}));

import { SchoolBrandingProvider } from '@/core/settings';
import { I18nProvider } from '@/shared/providers/i18n-provider';
import { renderWithI18n, sessionWith } from '@/test/render';
import { GET_HR_DASHBOARD } from './apis';
import { DashboardScreen, dashboardMessages } from './dashboard-screen';
import { seesDashboardFigures, TILE_PERMISSIONS, tilesShown } from './dashboard-tiles';
import { DashboardSkeleton, DashboardView } from './dashboard-view';

/* Home with `hr.dashboard.view` but none of the tiles' permissions: the welcome, not a bare greeting. */

const BRANDING = { nameEn: 'Test School', nameAr: 'مدرسة الاختبار', logoUrl: null };

function renderAs(ui: React.ReactElement, user: SessionUser) {
  return renderWithI18n(
    <SchoolBrandingProvider initial={BRANDING}>
      <I18nProvider messages={dashboardMessages('en')}>{ui}</I18nProvider>
    </SchoolBrandingProvider>,
    { session: user },
  );
}

async function renderScreen(user: SessionUser) {
  session.current = user;
  return renderAs(await DashboardScreen({ locale: 'en' }), user);
}

beforeEach(() => vi.mocked(GET_HR_DASHBOARD).mockReset());
afterEach(cleanup);

describe('Home: dashboard or welcome', () => {
  it('hr.dashboard.view alone: the welcome with its links (My account last), no tiles, no figures fetched', async () => {
    await renderScreen({ ...sessionWith('hr.dashboard.view'), name: 'Mona Adel' });
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome, Mona Adel' })).toBeTruthy();
    const links = within(screen.getByRole('region', { name: 'Your screens' }))
      .getAllByRole('link')
      .map((l) => [l.textContent, l.getAttribute('href')]);
    // Home is the only screen this role opens, so the list is just My account.
    expect(links).toEqual([['My account', '/en/account']]);
    expect(screen.queryByRole('region', { name: 'This month' })).toBeNull();
    expect(screen.queryByText('Active employees')).toBeNull();
    expect(screen.queryByText('Penalties waiting')).toBeNull();
    expect(document.querySelector('[aria-busy]')).toBeNull(); // no skeleton
    expect(GET_HR_DASHBOARD).not.toHaveBeenCalled();
  });

  it('hr.dashboard.view + hr.penalties.view: the dashboard, not the welcome; its skeleton has only the penalty tiles', async () => {
    const user = sessionWith('hr.dashboard.view', 'hr.penalties.view');
    expect(seesDashboardFigures(user)).toBe(true);
    renderAs(<DashboardSkeleton />, user);
    expect(screen.getByText('Penalties waiting')).toBeTruthy();
    expect(screen.getByText('Approved penalties')).toBeTruthy();
    expect(screen.queryByText('Active employees')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Your screens' })).toBeNull();
  });

  it('hr.dashboard.view + hr.penalties.view: only the penalty tiles, even when the API sent every figure', () => {
    renderAs(
      <DashboardView
        data={{
          headcount: { active: 12, byStage: [] },
          currentRun: { id: 'r', month: '2026-11', status: PayrollStatus.DRAFT, net: 1_000_00, salaryVisible: true },
          penaltiesThisMonth: { pending: 2, approved: 1 },
        }}
        month="2026-11"
      />,
      sessionWith('hr.dashboard.view', 'hr.penalties.view'),
    );
    const tiles = within(screen.getByRole('region', { name: 'This month' }));
    expect(tiles.getByText('Penalties waiting')).toBeTruthy();
    expect(tiles.getByText('Approved penalties')).toBeTruthy();
    expect(screen.queryByText('Active employees')).toBeNull();
    expect(screen.queryByText(/Payroll/)).toBeNull();
  });

  it('the skeleton shows no tiles with hr.dashboard.view alone', () => {
    renderAs(<DashboardSkeleton />, sessionWith('hr.dashboard.view'));
    expect(screen.queryByText('Active employees')).toBeNull();
    expect(screen.queryByText('Penalties waiting')).toBeNull();
  });

  it('the server check and the tiles read the same three keys', () => {
    expect(Object.values(TILE_PERMISSIONS)).toEqual(['hr.employees.view', 'hr.payroll.view', 'hr.penalties.view']);
    for (const key of Object.values(TILE_PERMISSIONS)) {
      expect(seesDashboardFigures(sessionWith('hr.dashboard.view', key))).toBe(true);
      expect(seesDashboardFigures(sessionWith(key))).toBe(false);
    }
    expect(seesDashboardFigures(sessionWith('hr.dashboard.view'))).toBe(false);
    expect(tilesShown(sessionWith('hr.payroll.view'))).toEqual({ headcount: false, payroll: true, penalties: false });
  });
});
