// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, redirect: vi.fn() }));
vi.mock('next/link', () => ({
  default: (props: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode; scroll?: boolean }) => {
    const anchor = { ...props };
    delete anchor.scroll;
    return <a {...anchor} />;
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../apis', () => ({
  APPROVE_PENALTY: vi.fn(),
  CANCEL_PENALTY: vi.fn(),
  CREATE_PENALTY: vi.fn(),
  GET_PENALTY_PREVIEW: vi.fn(),
  GET_PENALTY_GROUPS: vi.fn(),
}));
vi.mock('../../employees/apis', () => ({ GET_EMPLOYEES: vi.fn(), GET_STAGES: vi.fn().mockResolvedValue({ success: true, status: 200, data: [] }) }));

import { PAGINATION } from '@school-erp/shared';
import type { PenaltiesListQuery } from '../lib/list-query';
import { record, renderPenalties } from '../test/fixtures';
import { PenaltiesList, type PenaltiesListProps } from './penalties-list';
import { ACTION } from '@/test/penalty-actions';

const QUERY: PenaltiesListQuery = { month: '2026-11', page: 1, limit: PAGINATION.defaultLimit };

function renderList(props: Partial<PenaltiesListProps> = {}, locale: 'en' | 'ar' = 'en') {
  return renderPenalties(
    <PenaltiesList
      basePath="/en/penalties"
      query={QUERY}
      currentMonth="2026-11"
      rows={[record(), record({ id: 'p-2', status: 'CANCELLED', cancelReason: 'Wrong day', action: ACTION.WARNING, days: null, percent: null, amount: null, level: 1 })]}
      total={2}
      {...props}
    />,
    locale,
  );
}

const table = () => within(document.querySelector<HTMLElement>('[data-view="table"]')!);

describe('PenaltiesList', () => {
  beforeEach(() => router.push.mockReset());
  afterEach(cleanup);

  it('shows each row: date, employee, localised violation, level, action with days, status', () => {
    renderList({}, 'ar');
    const rows = table().getAllByRole('row');
    expect(rows[1]?.textContent).toContain('منى خليل');
    expect(rows[1]?.textContent).toContain('التأخر دون إخطار');
    expect(rows[1]?.textContent).toContain('المرة 2');
    expect(rows[1]?.textContent).toContain('خصم 0.5 يوم');
    expect(rows[1]?.textContent).toContain('لدى شؤون الموظفين');
    expect(rows[2]?.textContent).toContain('السبب: Wrong day');
    // The English reason keeps its own direction inside the Arabic line.
    const reason = within(rows[2] as HTMLElement).getByText('Wrong day');
    expect([reason.tagName, reason.getAttribute('dir'), reason.getAttribute('lang')]).toEqual(['BDI', 'ltr', 'en']);
  });

  it('an Arabic date reads in Arabic order (day, month, year): it is not forced left-to-right', () => {
    renderList({}, 'ar');
    const date = table().getAllByRole('row')[1]?.querySelector('td bdi');
    expect(date?.textContent).toMatch(/^\d{1,2} \S+ \d{4}$/);
    // Under a forced LTR the browser lays "16 نوفمبر 2026" out as "16 2026 نوفمبر".
    expect(date?.closest('[dir="ltr"]')).toBeNull();
  });

  it('fits an ~800px content area: level shares the action column, and rows turn to cards below 1100px', () => {
    renderList();
    const headers = table()
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(headers).toEqual(['Date', 'Employee', 'Violation', 'Level · action', 'Status', 'Actions']);
    const row = table().getAllByRole('row')[1]!;
    expect(within(row).getAllByRole('cell')[3]?.textContent).toBe('Level 2Deduct 0.5 day');
    // Six columns need more than 740px; below 1100px the list is cards, never a sideways scroll.
    expect(screen.getByRole('region', { name: /penalties/i }).getAttribute('data-cards-below')).toBe('1100');
  });

  it('month, status and search filters update the URL without scrolling, from the first page', async () => {
    const user = userEvent.setup();
    renderList({ query: { ...QUERY, page: 3 } });

    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(router.push).toHaveBeenLastCalledWith('/en/penalties?month=2026-10', { scroll: false });
    // This month is the latest a penalty can be dated in.
    expect(screen.getByRole('button', { name: 'Next month' })).toHaveProperty('disabled', true);

    await user.click(screen.getByRole('combobox', { name: 'Status' }));
    await user.click(await screen.findByRole('option', { name: 'Approved' }));
    expect(router.push).toHaveBeenLastCalledWith('/en/penalties?status=APPROVED', { scroll: false });

    await user.type(screen.getByRole('searchbox', { name: 'Search penalties' }), 'EMP-0001');
    await waitFor(() => expect(router.push).toHaveBeenLastCalledWith('/en/penalties?search=EMP-0001', { scroll: false }));
  });

  it('a filter change shows the spinner in the search box while the list loads, then the magnifier', async () => {
    // The navigation stays pending until the next page "arrives".
    let arrive: () => void = () => undefined;
    router.push.mockImplementation(() => new Promise<void>((resolve) => (arrive = resolve)));
    const user = userEvent.setup();
    renderList();
    const box = screen.getByRole('searchbox', { name: 'Search penalties' }).parentElement!;
    expect(within(box).queryByTestId('search-spinner')).toBeNull();

    await user.click(screen.getByRole('combobox', { name: 'Status' }));
    await user.click(await screen.findByRole('option', { name: 'Approved' }));
    // The status filter has no spinner of its own; the search box shows it, and the rows dim.
    expect(await within(box).findByTestId('search-spinner')).toBeTruthy();
    expect(within(box).queryByTestId('search-icon')).toBeNull();
    expect(within(box).getByRole('status').textContent).toBe('Loading…');
    expect(screen.getAllByTestId('search-spinner')).toHaveLength(1);

    await act(async () => arrive());
    await waitFor(() => expect(within(box).queryByTestId('search-spinner')).toBeNull());
    expect(within(box).getByTestId('search-icon')).toBeTruthy();
    // `beforeEach` hands back the mock, which vitest calls as teardown: it must not stay pending.
    router.push.mockReset();
  });

  it('"Record a penalty" opens the dialog', async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole('button', { name: 'Record a penalty' }));
    expect(await screen.findByRole('dialog', { name: 'Record a penalty' })).toBeTruthy();
  });

  it('an empty month and an empty filter result say different things', async () => {
    const user = userEvent.setup();
    const { unmount } = renderList({ rows: [], total: 0 });
    expect(screen.getByText('No penalties this month')).toBeTruthy();
    unmount();

    renderList({ rows: [], total: 0, query: { ...QUERY, status: 'APPROVED', search: 'zz' } });
    expect(screen.getByText('No penalties match')).toBeTruthy();
    // The toolbar's and the "No results" one; either resets search and status, keeping the month.
    const clears = screen.getAllByRole('button', { name: 'Clear filters · 2' });
    expect(clears).toHaveLength(2);
    router.push.mockClear();
    await user.click(clears[1]!);
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenLastCalledWith('/en/penalties', { scroll: false });
  });

  it('"Clear filters" is hidden with nothing narrowing the list, and keeps the month', async () => {
    const user = userEvent.setup();
    const { unmount } = renderList();
    expect(screen.queryByRole('button', { name: /Clear filters/ })).toBeNull();
    unmount();
    renderList({ query: { ...QUERY, month: '2026-09', page: 2, status: 'APPROVED' } });
    router.push.mockClear();
    await user.click(screen.getByRole('button', { name: 'Clear filters · 1' }));
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenLastCalledWith('/en/penalties?month=2026-09', { scroll: false });
  });

  it('a failed load shows the error state with a retry', async () => {
    const user = userEvent.setup();
    renderList({ rows: [], total: 0, error: true });
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(router.refresh).toHaveBeenCalled();
  });
});
