// @vitest-environment jsdom
import { PayrollStatus, type HrDashboard } from '@school-erp/shared';
import ar from '@school-erp/shared/locales/ar/dashboard.json';
import en from '@school-erp/shared/locales/en/dashboard.json';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, redirect: vi.fn() }));
const apis = vi.hoisted(() => ({ GET_HR_DASHBOARD: vi.fn() }));
vi.mock('./apis', () => apis);

import { SchoolBrandingProvider } from '@/core/settings';
import type { Locale } from '@/shared/lib/i18n';
import { I18nProvider } from '@/shared/providers/i18n-provider';
import { renderWithI18n } from '@/test/render';
import { dashboardLinks } from './dashboard-links';
import { dashboardMessages } from './dashboard-screen';
import { DashboardHeader, DashboardSkeleton, DashboardView } from './dashboard-view';
import { loadDashboard } from './load-dashboard';

const BRANDING = { nameEn: 'Green Valley School', nameAr: 'مدرسة الوادي الأخضر', logoUrl: null };

const DATA: HrDashboard = {
  headcount: {
    active: 1284,
    byStage: [
      { stage: { id: 's1', nameEn: 'Primary', nameAr: 'الابتدائية' }, count: 1000 },
      { stage: { id: 's2', nameEn: 'Preparatory', nameAr: 'الإعدادية' }, count: 284 },
    ],
  },
  currentRun: { id: 'run-11', month: '2026-11', status: PayrollStatus.DRAFT, net: 140_000_00 },
  penaltiesThisMonth: { pending: 3, approved: 7 },
};

function renderDashboard(data: HrDashboard | null, locale: Locale = 'en') {
  return renderWithI18n(
    <SchoolBrandingProvider initial={BRANDING}>
      <I18nProvider messages={dashboardMessages(locale)}>
        <DashboardHeader month="2026-11" />
        <DashboardView data={data} month="2026-11" />
      </I18nProvider>
    </SchoolBrandingProvider>,
    { locale },
  );
}

function linkTo(name: RegExp) {
  return screen.getByRole('link', { name }).getAttribute('href');
}

function keys(tree: object, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? keys(v as object, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('Dashboard', () => {
  it('greets with the school name and shows the month figures', () => {
    renderDashboard(DATA);
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome to Green Valley School' })).toBeTruthy();
    const tiles = screen.getByRole('region', { name: 'This month' });
    expect(within(tiles).getByText('1,284')).toBeTruthy();
    const byStage = within(tiles).getByRole('list', { name: 'By stage' });
    expect(within(byStage).getAllByRole('listitem')).toHaveLength(2);
    expect(within(tiles).getByText('140,000.00')).toBeTruthy();
    expect(within(tiles).getByText('Draft')).toBeTruthy();
  });

  it('empty state when there is no run: "No run yet" with a Create run link to the runs list', () => {
    renderDashboard({ ...DATA, currentRun: null });
    const tile = screen.getByRole('link', { name: /No run yet/ });
    expect(within(tile).getByText('Create run')).toBeTruthy();
    expect(tile.getAttribute('href')).toBe('/en/payroll');
    expect(linkTo(/Run payroll/)).toBe('/en/payroll');
    expect(screen.queryByText('Draft')).toBeNull();
  });

  it('error state: says the figures did not load and retries by refreshing', async () => {
    renderDashboard(null);
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText("The dashboard couldn't load")).toBeTruthy();
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(router.refresh).toHaveBeenCalledTimes(1);
    // The quick links still work while the figures are down.
    expect(linkTo(/Add employee/)).toBe('/en/employees/new');
  });

  it('links go to the right filtered pages', () => {
    renderDashboard(DATA);
    expect(linkTo(/Pending penalties/)).toBe('/en/penalties?month=2026-11&status=PENDING');
    expect(linkTo(/Approved penalties/)).toBe('/en/penalties?month=2026-11&status=APPROVED');
    expect(linkTo(/Active employees/)).toBe('/en/employees');
    // The month has a run: the tile and "Run payroll" open it directly.
    expect(linkTo(/Payroll, November 2026/)).toBe('/en/payroll/run-11');
    expect(linkTo(/Add employee/)).toBe('/en/employees/new');
    expect(linkTo(/Record a penalty/)).toBe('/en/penalties');
    expect(linkTo(/Enter lateness/)).toBe('/en/lateness?month=2026-11');
    expect(linkTo(/Run payroll/)).toBe('/en/payroll/run-11');
    expect(linkTo(/Settings/)).toBe('/en/settings');
  });

  it('renders in Arabic (RTL) with Arabic names and links under /ar', () => {
    renderDashboard(DATA, 'ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(BRANDING.nameAr);
    expect(screen.getByText('الابتدائية')).toBeTruthy();
    expect(linkTo(/جزاءات معلّقة/)).toBe('/ar/penalties?month=2026-11&status=PENDING');
  });

  it('loading skeleton has the shape of the figures (four tiles, five quick links), no spinner', () => {
    renderWithI18n(
      <I18nProvider messages={dashboardMessages('en')}>
        <DashboardSkeleton />
      </I18nProvider>,
    );
    expect(screen.queryByRole('link')).toBeNull();
    // Announced as loading (screen-reader text), never a spinner.
    expect(screen.getByRole('status').textContent).toBe('Loading…');
    expect(screen.getByText('Active employees')).toBeTruthy();
  });

  it('English and Arabic locale files have identical keys', () => {
    expect(keys(ar).sort()).toEqual(keys(en).sort());
  });
});

describe('loadDashboard', () => {
  it('returns the figures on success and null when the request fails', async () => {
    apis.GET_HR_DASHBOARD.mockResolvedValueOnce({ success: true, data: DATA });
    await expect(loadDashboard()).resolves.toEqual(DATA);
    apis.GET_HR_DASHBOARD.mockResolvedValueOnce({ success: false, status: 502, message: 'down' });
    await expect(loadDashboard()).resolves.toBeNull();
  });
});

describe('dashboardLinks', () => {
  it('builds the penalties filters from the month and status', () => {
    const links = dashboardLinks('ar', '2026-01');
    expect(links.pendingPenalties).toBe('/ar/penalties?month=2026-01&status=PENDING');
    expect(links.lateness).toBe('/ar/lateness?month=2026-01');
  });
});
