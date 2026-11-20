// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const router = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  prefetch: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  redirect: vi.fn(),
}));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
const apis = vi.hoisted(() => ({ CREATE_PAYROLL_RUN: vi.fn() }));
vi.mock('../apis', () => apis);

import type { PayrollRunSummary } from '@school-erp/shared';
import { renderPayroll, run, RUN_ID, summary } from '../test/fixtures';
import { RunsList } from './runs-list';

const draft = summary();
const approved: PayrollRunSummary = {
  ...draft,
  id: 'r-oct',
  month: '2026-10',
  status: 'APPROVED',
  approvedAt: '2026-10-31T09:00:00.000Z',
};

function renderList(runs: PayrollRunSummary[] | null = [draft, approved], locale: 'en' | 'ar' = 'en') {
  return renderPayroll(
    <RunsList
      basePath={`/${locale}/payroll`}
      query={{ page: 1, limit: 10 }}
      runs={runs}
      total={runs?.length ?? 0}
      currentMonth="2026-11"
    />,
    locale,
  );
}

beforeEach(() => {
  apis.CREATE_PAYROLL_RUN.mockReset();
  router.push.mockReset();
  toast.error.mockReset();
  toast.success.mockReset();
});
afterEach(cleanup);

describe('RunsList', () => {
  it('lists runs with month link, status and approval date', () => {
    renderList();
    const table = within(document.querySelector<HTMLElement>('[data-view="table"]')!);
    expect(table.getByRole('link', { name: 'Open November 2026' }).getAttribute('href')).toBe(`/en/payroll/${RUN_ID}`);
    expect(table.getByText('Draft')).toBeTruthy();
    expect(table.getByText('Approved', { selector: 'span' })).toBeTruthy();
    expect(table.getByText('31 Oct 2026')).toBeTruthy();
    expect(table.getByText('Not yet')).toBeTruthy();
  });

  it('a run Accounting finalized reads "Finalized · transferred" (EN and AR)', () => {
    const transferred = { ...approved, transferredAt: '2026-11-05T09:00:00.000Z' };
    renderList([transferred]);
    expect(within(document.querySelector<HTMLElement>('[data-view="table"]')!).getByText('Finalized · transferred')).toBeTruthy();
    cleanup();
    renderList([transferred], 'ar');
    expect(within(document.querySelector<HTMLElement>('[data-view="table"]')!).getByText('نهائي · تم التحويل')).toBeTruthy();
  });

  it('a draft Accounting returned shows "Returned" beside Draft (EN and AR); approved again, only the status', () => {
    const returned = { ...draft, returned: { at: '2026-11-19T10:00:00.000Z', reason: 'Penalty missing' } };
    renderList([returned]);
    let table = within(document.querySelector<HTMLElement>('[data-view="table"]')!);
    expect(table.getByText('Draft')).toBeTruthy();
    expect(table.getByText('Returned')).toBeTruthy();
    cleanup();
    renderList([returned], 'ar');
    table = within(document.querySelector<HTMLElement>('[data-view="table"]')!);
    expect(table.getByText('مسودة')).toBeTruthy();
    expect(table.getByText('مُعاد')).toBeTruthy();
    cleanup();
    renderList([draft, approved]);
    expect(within(document.querySelector<HTMLElement>('[data-view="table"]')!).queryByText('Returned')).toBeNull();
  });

  it('creates a run for the chosen month and opens it', async () => {
    const user = userEvent.setup();
    apis.CREATE_PAYROLL_RUN.mockResolvedValue({
      success: true,
      status: 201,
      data: { ...run(), id: 'r-new' },
    });
    renderList([]);
    // Empty list offers the action too.
    expect(screen.getByText('No payroll runs yet')).toBeTruthy();
    await user.click(screen.getAllByRole('button', { name: 'Create run' })[0]!);
    const dialog = await screen.findByRole('dialog');
    expect(
      (
        within(dialog).getByRole('button', {
          name: 'Next month',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await user.click(within(dialog).getByRole('button', { name: 'Previous month' }));
    await user.click(within(dialog).getByRole('button', { name: 'Create October 2026' }));
    expect(apis.CREATE_PAYROLL_RUN).toHaveBeenCalledWith('2026-10');
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/en/payroll/r-new'));
    expect(toast.success).toHaveBeenCalledWith('Payroll run created.');
  });

  it('409 when the month already has a run → the message is shown in the dialog', async () => {
    const user = userEvent.setup();
    apis.CREATE_PAYROLL_RUN.mockResolvedValue({
      success: false,
      status: 409,
      error: 'PAYROLL_RUN_EXISTS',
      message: 'A payroll run already exists for this month.',
    });
    renderList();
    await user.click(screen.getByRole('button', { name: 'Create run' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Create November 2026' }));
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    expect(within(dialog).getByText('A payroll run already exists for this month.')).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('double-clicking create sends one request', async () => {
    const user = userEvent.setup();
    apis.CREATE_PAYROLL_RUN.mockReturnValue(new Promise(() => undefined));
    renderList();
    await user.click(screen.getByRole('button', { name: 'Create run' }));
    const dialog = await screen.findByRole('dialog');
    await user.dblClick(within(dialog).getByRole('button', { name: 'Create November 2026' }));
    expect(apis.CREATE_PAYROLL_RUN).toHaveBeenCalledTimes(1);
  });

  it('first load (the route skeleton): busy, a page of placeholder rows, nothing clickable', () => {
    renderPayroll(
      <RunsList basePath="/en/payroll" query={{ page: 1, limit: 10 }} runs={undefined} total={0} currentMonth="2026-11" />,
    );
    expect(screen.getByRole('status').textContent).toBe('Loading…');
    expect(document.querySelectorAll('[aria-hidden="true"] tbody tr')).toHaveLength(10);
    expect(screen.getByRole('button', { name: 'Create run' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Next page' })).toHaveProperty('disabled', true);
  });

  it('a failed load shows an error with retry', async () => {
    const user = userEvent.setup();
    renderList(null);
    expect(screen.getByRole('alert')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(router.refresh).toHaveBeenCalled();
  });

  it('pages through the URL without scrolling', async () => {
    const user = userEvent.setup();
    renderPayroll(
      <RunsList
        basePath="/en/payroll"
        query={{ page: 1, limit: 10 }}
        runs={[draft]}
        total={45}
        currentMonth="2026-11"
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(router.push).toHaveBeenCalledWith('/en/payroll?page=2', {
      scroll: false,
    });
  });

  it('renders right-to-left in Arabic', () => {
    renderList(undefined, 'ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(screen.getByRole('button', { name: 'إنشاء مسيّر' })).toBeTruthy();
  });
});
