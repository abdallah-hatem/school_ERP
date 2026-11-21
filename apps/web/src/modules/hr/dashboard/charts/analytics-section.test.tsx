// @vitest-environment jsdom
import type { HrDashboardAnalytics } from '@school-erp/shared';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/en' }));
// jsdom lays nothing out (every width is 0): the charts' frames render, their marks don't.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

import type { Locale } from '@/shared/lib/i18n';
import { I18nProvider } from '@/shared/providers/i18n-provider';
import { renderWithI18n, sessionWithout } from '@/test/render';
import { DashboardSkeleton } from '../dashboard-view';
import { dashboardMessages } from '../dashboard-screen';
import { AnalyticsSection } from './analytics-section';
import { AnalyticsRangeProvider, RangeSwitch } from './range-switch';

const months = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];
const stage = (id: string, nameEn: string, nameAr: string) => ({ id, nameEn, nameAr });

const DATA: HrDashboardAnalytics = {
  range: 6,
  months,
  approvedMonths: 5,
  latestApproved: '2026-10',
  payroll: months.map((month, i) => ({
    month,
    net: i < 5 ? 1_000_000_00 + i * 10_000_00 : null,
    employees: i < 5 ? 38 : null,
    change: i > 0 && i < 5 ? 10_000_00 : null,
  })),
  headcountByStage: [
    { stage: stage('kg', 'KG', 'رياض الأطفال'), count: 8, share: 0.2, noStage: false },
    { stage: stage('p', 'Primary', 'الابتدائية'), count: 32, share: 0.8, noStage: false },
  ],
  flow: months.map((month, i) => ({ month, joiners: i % 2, leavers: i === 5 ? 2 : 0, headcountEnd: 40 })),
  penalties: months.map((month, i) => ({ month, notice: i, deduct: 1, other: 0, total: i + 1 })),
  lateness: months.map((month, i) => ({ month, minutes: 100 * i })),
  deductions: {
    month: '2026-10',
    gross: 1_200_000_00,
    parts: [
      { part: 'net', amount: 1_040_000_00, share: 0.8667 },
      { part: 'insurance', amount: 90_000_00, share: 0.075 },
      { part: 'incomeTax', amount: 66_000_00, share: 0.055 },
      { part: 'penalties', amount: 4_000_00, share: 0.0033 },
    ],
  },
  deductionTrend: [
    { month: '2026-10', insurance: 0.075, incomeTax: 0.055, penalties: 0.0033, share: 0.1333, amount: 160_000_00 },
    { month: '2026-09', insurance: 0.074, incomeTax: 0.054, penalties: 0.002, share: 0.13, amount: 150_000_00 },
  ],
};

function renderSection(data: HrDashboardAnalytics, locale: Locale = 'en') {
  return renderWithI18n(
    <I18nProvider messages={dashboardMessages(locale)}>
      <AnalyticsRangeProvider range={data.range}>
        <RangeSwitch />
        <AnalyticsSection data={data} payrollHref={`/${locale}/payroll`} />
      </AnalyticsRangeProvider>
    </I18nProvider>,
    { locale },
  );
}

afterEach(cleanup);

describe('dashboard charts', () => {
  it('draws the four cards, each with a Table toggle that shows the same numbers', async () => {
    renderSection(DATA);
    for (const title of ['Payroll cost', 'Headcount', 'Penalties and lateness', 'Deductions vs net']) {
      expect(screen.getByRole('heading', { name: title })).toBeTruthy();
    }
    const toggles = screen.getAllByRole('button', { name: 'Table' });
    expect(toggles).toHaveLength(4);
    const payroll = screen.getByRole('region', { name: 'Payroll cost' });
    await userEvent.click(within(payroll).getByRole('button', { name: 'Table' }));
    const table = within(payroll).getByRole('table');
    // One row per month, the API's figures formatted (thousands grouped), a gap as a dash.
    expect(within(table).getAllByRole('row')).toHaveLength(1 + months.length);
    expect(within(table).getByText('1,040,000.00')).toBeTruthy();
    expect(within(table).getAllByText('—').length).toBeGreaterThan(0);
    await userEvent.click(within(payroll).getByRole('button', { name: 'Chart' }));
    expect(within(payroll).queryByRole('table')).toBeNull();
  });

  it('the deductions card names its month and gross; its table lists the four parts', async () => {
    renderSection(DATA);
    const card = screen.getByRole('region', { name: 'Deductions vs net' });
    expect(card.textContent).toContain('October 2026');
    expect(card.textContent).toMatch(/EGP\s1,200,000\.00/);
    await userEvent.click(within(card).getByRole('button', { name: 'Table' }));
    const [parts] = within(card).getAllByRole('table');
    expect(within(parts!).getAllByRole('row')).toHaveLength(5);
    expect(within(parts!).getByText('Penalties & lateness')).toBeTruthy();
  });

  it('a part the API left out (no permission) has no card', () => {
    renderSection({ ...DATA, payroll: null, deductions: null, deductionTrend: null });
    expect(screen.queryByRole('heading', { name: 'Payroll cost' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Deductions vs net' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Headcount' })).toBeTruthy();
  });

  it('under two approved months: the empty card replaces the trends; the snapshots still show', () => {
    renderSection({ ...DATA, approvedMonths: 1, latestApproved: '2026-10' });
    expect(screen.getByRole('heading', { name: 'Charts appear after two approved months' })).toBeTruthy();
    expect(screen.getByText(/one approved month so far, October 2026/)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Payroll cost' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Penalties and lateness' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Headcount' })).toBeTruthy();
    expect(screen.queryByText('Joiners and leavers')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Deductions vs net' })).toBeTruthy();
    expect(screen.queryByText('Deductions, % of gross')).toBeNull();
    expect(screen.getByRole('link', { name: /Open payroll/ }).getAttribute('href')).toBe('/en/payroll');
  });

  it('the range switch marks the current range; Arabic labels, Latin digits', () => {
    renderSection(DATA, 'ar');
    const group = screen.getByRole('group', { name: 'الأشهر المعروضة' });
    expect(within(group).getByRole('button', { name: '6 أشهر' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(group).getByRole('button', { name: '12 شهرًا' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('heading', { name: 'تكلفة الرواتب' })).toBeTruthy();
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('the skeleton draws the chart cards only for a role with the charts permission', () => {
    const { unmount } = renderWithI18n(
      <I18nProvider messages={dashboardMessages('en')}>
        <DashboardSkeleton />
      </I18nProvider>,
    );
    expect(document.querySelector('[data-skeleton-block="chart-payroll"]')).not.toBeNull();
    expect(screen.getAllByRole('status')).toHaveLength(1);
    unmount();
    renderWithI18n(
      <I18nProvider messages={dashboardMessages('en')}>
        <DashboardSkeleton />
      </I18nProvider>,
      { session: sessionWithout('hr.dashboard.view_analytics') },
    );
    expect(document.querySelector('[data-skeleton-block="charts"]')).toBeNull();
  });
});
