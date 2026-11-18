// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  redirect: vi.fn(),
}));

import { sessionWithout } from '@/test/render';
import { EMPTY_YEAR, MONTH, renderAccounting, YEAR } from '../test/fixtures';
import { YearBoard } from './year-board';

afterEach(cleanup);

const props = { basePath: '/en/accounting/payroll-taxes', payrollHref: '/en/payroll', currentMonth: '2026-11' };
const board = () => screen.getByRole('region', { name: 'Months of 2026' });
const tiles = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('[data-skeleton-block="month-tile"]')];

describe('YearBoard', () => {
  it('twelve tiles: approved months open their statement with their gross, a draft says it is in HR, the rest nothing yet', () => {
    const { container } = renderAccounting(<YearBoard year={2026} data={YEAR} {...props} />);
    expect(tiles(container)).toHaveLength(12);
    const october = within(board()).getByRole('link', { name: /October/ });
    expect(october.getAttribute('href')).toBe('/en/accounting/payroll-taxes/2026-10');
    expect(october.textContent).toContain('Approved');
    expect(october.textContent).toContain('3 employees');
    expect(october.textContent).toContain('28,148.78');
    // Only approved months are links.
    expect(within(board()).getAllByRole('link')).toHaveLength(2);
    const [, , , , , , , , , , november, december] = tiles(container);
    expect(november!.textContent).toContain('Draft in HR');
    expect(november!.textContent).toContain('Shows here once HR approves it.');
    expect(december!.textContent).toContain('Not started');
    expect(tiles(container)[0]!.textContent).toContain('No payroll in the system');
    expect(screen.queryByText(/No approved month/)).toBeNull();
  });

  it('salary data (§2, P4): an approved month whose totals the viewer may not see says so, no figure', () => {
    const year = {
      ...YEAR,
      months: YEAR.months.map((m) => (m.summary ? { ...m, summary: { ...m.summary, salaryVisible: false, totals: { employees: 3 } } } : m)),
    };
    renderAccounting(<YearBoard year={2026} data={year} {...props} />);
    const october = within(board()).getByRole('link', { name: /October/ });
    expect(october.textContent).toContain('Totals hidden');
    expect(october.textContent).not.toContain('28,148.78');
  });

  it('an approved month not worked out yet (a missed event) still opens; it is worked out then', () => {
    const year = { ...YEAR, months: YEAR.months.map((m) => (m.month === '2026-10' ? { month: m.month, state: 'APPROVED' as const } : m)) };
    renderAccounting(<YearBoard year={2026} data={year} {...props} />);
    expect(within(board()).getByRole('link', { name: /October/ }).textContent).toContain('Open to see its taxes');
  });

  it('empty year: says no month is approved and offers HR payroll (to someone who may open it)', () => {
    renderAccounting(<YearBoard year={2025} data={EMPTY_YEAR} {...props} />);
    const notice = screen.getByRole('status');
    expect(notice.textContent).toContain('No approved month in 2025');
    expect(within(notice).getByRole('link', { name: 'Open HR payroll' }).getAttribute('href')).toBe('/en/payroll');
    cleanup();
    renderAccounting(<YearBoard year={2025} data={EMPTY_YEAR} {...props} />, 'en', sessionWithout('hr.payroll.view'));
    expect(screen.queryByRole('link', { name: 'Open HR payroll' })).toBeNull();
  });

  it('the year switch: back to last year, never past this year', () => {
    renderAccounting(<YearBoard year={2026} data={YEAR} {...props} />);
    expect(screen.getByRole('link', { name: 'Previous year' }).getAttribute('href')).toBe('/en/accounting/payroll-taxes?year=2025');
    expect(screen.getByRole('button', { name: 'Next year' })).toHaveProperty('disabled', true);
    cleanup();
    renderAccounting(<YearBoard year={2025} data={EMPTY_YEAR} {...props} />);
    expect(screen.getByRole('link', { name: 'Next year' }).getAttribute('href')).toBe('/en/accounting/payroll-taxes?year=2026');
  });

  it('loading: twelve skeleton tiles, nothing clickable, no empty notice', () => {
    const { container } = renderAccounting(<YearBoard year={2026} data={undefined} {...props} />);
    expect(tiles(container)).toHaveLength(12);
    expect(within(board()).queryAllByRole('link')).toHaveLength(0);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('Arabic (RTL): Arabic month names and states, Latin figures', () => {
    renderAccounting(<YearBoard year={2026} data={YEAR} {...props} basePath="/ar/accounting/payroll-taxes" />, 'ar');
    expect(document.documentElement.dir).toBe('rtl');
    const october = within(screen.getByRole('region', { name: 'أشهر 2026' })).getByRole('link', { name: /أكتوبر/ });
    expect(october.textContent).toContain('معتمد');
    expect(october.textContent).toContain('3 موظفين');
    expect(october.textContent).toContain('28,148.78');
    expect(screen.getByText('مسودة في الموارد البشرية')).toBeTruthy();
    expect(MONTH.month).toBe('2026-10');
  });
});
