// @vitest-environment jsdom
import { PayrollStatus, type HrDashboard } from '@school-erp/shared';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  redirect: vi.fn(),
}));
vi.mock('./apis', () => ({ GET_HR_DASHBOARD: vi.fn() }));

import type { SessionUser } from '@school-erp/shared';
import { SchoolBrandingProvider } from '@/core/settings';
import { I18nProvider } from '@/shared/providers/i18n-provider';
import { renderWithI18n, sessionWith, STAGE_HEAD_KEYS, TEST_SESSION } from '@/test/render';
import { dashboardMessages } from './dashboard-screen';
import { DashboardSkeleton, DashboardView } from './dashboard-view';

/* P4 (R6, R7): the dashboard shows only the widgets the viewer may see. */

const BRANDING = { nameEn: 'School', nameAr: 'مدرسة', logoUrl: null };
const FULL: HrDashboard = {
  headcount: { active: 12, byStage: [] },
  currentRun: { id: 'r', month: '2026-11', status: PayrollStatus.DRAFT, net: 1_000_00, salaryVisible: true },
  penaltiesThisMonth: { pending: 2, approved: 1 },
};

function renderAs(ui: React.ReactElement, session: SessionUser) {
  return renderWithI18n(
    <SchoolBrandingProvider initial={BRANDING}>
      <I18nProvider messages={dashboardMessages('en')}>{ui}</I18nProvider>
    </SchoolBrandingProvider>,
    { session },
  );
}

afterEach(cleanup);

describe('dashboard visibility', () => {
  it('a Stage head (no hr.dashboard.view): no figures, and only the quick links they can use (Settings: stages, catalogue)', () => {
    renderAs(<DashboardView data={undefined} month="2026-11" />, sessionWith(...STAGE_HEAD_KEYS));
    expect(screen.queryByText('Active employees')).toBeNull();
    expect(screen.queryByText('Pending penalties')).toBeNull();
    expect(screen.getAllByRole('link').map((l) => l.textContent)).toEqual(['Record a penalty', 'Settings']);
  });

  it('a viewer without hr.payroll.view gets no payroll tile, even when the run exists', () => {
    renderAs(
      <DashboardView data={{ ...FULL, currentRun: null }} month="2026-11" />,
      sessionWith('hr.dashboard.view', 'hr.employees.view', 'hr.penalties.view'),
    );
    expect(screen.getByText('Active employees')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Payroll/ })).toBeNull();
  });

  it('a hidden net (R7) shows a dash, never a figure', () => {
    renderAs(
      <DashboardView
        data={{ ...FULL, currentRun: { id: 'r', month: '2026-11', status: PayrollStatus.DRAFT, salaryVisible: false } }}
        month="2026-11"
      />,
      TEST_SESSION,
    );
    expect(screen.getByLabelText('Amount hidden')).toBeTruthy();
  });

  it('the HR manager sees all four tiles and every quick link', () => {
    renderAs(<DashboardView data={FULL} month="2026-11" />, TEST_SESSION);
    expect(screen.getByText('Active employees')).toBeTruthy();
    expect(screen.getByText('Pending penalties')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Run payroll' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Add employee' })).toBeTruthy();
  });

  it('the skeleton follows the same gates (no tile skeletons for a Stage head)', () => {
    renderAs(<DashboardSkeleton />, sessionWith(...STAGE_HEAD_KEYS));
    expect(screen.queryByText('Active employees')).toBeNull();
    cleanup();
    renderAs(<DashboardSkeleton />, TEST_SESSION);
    expect(screen.getByText('Active employees')).toBeTruthy();
  });
});
