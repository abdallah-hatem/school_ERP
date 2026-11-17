// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
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
}));

import { PAGINATION } from '@school-erp/shared';
import { violationGroups } from '../lib/penalty-text';
import type { PenaltiesListQuery } from '../lib/list-query';
import { groups, record, renderPenalties } from '../test/fixtures';
import { PenaltiesList, type PenaltiesListProps } from './penalties-list';

const QUERY: PenaltiesListQuery = { month: '2026-11', page: 1, limit: PAGINATION.defaultLimit };

function renderList(props: Partial<PenaltiesListProps> = {}, locale: 'en' | 'ar' = 'en') {
  return renderPenalties(
    <PenaltiesList
      basePath="/en/penalties"
      employeesPath="/en/employees"
      query={QUERY}
      currentMonth="2026-11"
      rows={[record(), record({ id: 'p-2', status: 'CANCELLED', cancelReason: 'Wrong day', action: 'WARNING', days: null, level: 1 })]}
      total={2}
      employees={[]}
      violations={violationGroups(groups, locale)}
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
    expect(rows[1]?.textContent).toContain('قيد الانتظار');
    expect(rows[2]?.textContent).toContain('السبب: Wrong day');
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

    await user.type(screen.getByRole('textbox', { name: 'Search penalties' }), 'EMP-0001');
    await waitFor(() => expect(router.push).toHaveBeenLastCalledWith('/en/penalties?search=EMP-0001', { scroll: false }));
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
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(router.push).toHaveBeenLastCalledWith('/en/penalties', { scroll: false });
  });

  it('a failed load shows the error state with a retry', async () => {
    const user = userEvent.setup();
    renderList({ rows: [], total: 0, error: true });
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(router.refresh).toHaveBeenCalled();
  });
});
