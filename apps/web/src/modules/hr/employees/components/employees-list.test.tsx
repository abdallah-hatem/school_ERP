// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh, replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('next/link', async () => ({ default: (await import('../test/fixtures')).MockLink }));

import type { EmployeeSummary } from '@school-erp/shared';
import { parseEmployeesQuery } from '../lib/list-query';
import { departments, renderEmployees, stages, summary } from '../test/fixtures';
import { EmployeesList } from './employees-list';

const people: EmployeeSummary[] = [
  summary({ id: 'e-1', code: 'EMP-0001', nameEn: 'Mona Khalil', nameAr: 'منى خليل' }),
  summary({ id: 'e-2', code: 'EMP-0002', nameEn: 'Omar Fathy', nameAr: 'عمر فتحي', status: 'INACTIVE' }),
];

function renderList(params: Record<string, string> = {}, rows: EmployeeSummary[] = [], locale: 'en' | 'ar' = 'en') {
  return renderEmployees(
    <EmployeesList
      basePath={`/${locale}/employees`}
      query={parseEmployeesQuery(params)}
      rows={rows}
      total={rows.length}
      departments={departments}
      stages={stages}
    />,
    locale,
  );
}

describe('EmployeesList', () => {
  beforeEach(() => push.mockReset());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('Empty list and no-results states differ', async () => {
    const user = userEvent.setup();
    renderList();
    const region = screen.getByRole('region', { name: 'Employees' });
    expect(within(region).getByText('No employees yet')).toBeTruthy();
    expect(within(region).getByRole('link', { name: 'Add employee' }).getAttribute('href')).toBe('/en/employees/new');
    expect(within(region).queryByText('No employees match')).toBeNull();
    cleanup();

    renderList({ search: 'zzz', stageId: 's-kg' });
    const filtered = screen.getByRole('region', { name: 'Employees' });
    expect(within(filtered).getByText('No employees match')).toBeTruthy();
    expect(within(filtered).queryByText('No employees yet')).toBeNull();
    await user.click(within(filtered).getByRole('button', { name: 'Clear filters' }));
    expect(push).toHaveBeenCalledWith('/en/employees', { scroll: false });
  });

  it('a filter updates the URL in place and goes back to page 1', async () => {
    const user = userEvent.setup();
    renderList({ page: '3', workSystem: 'FULL_TIME' }, people);
    await user.click(screen.getByRole('combobox', { name: 'Department' }));
    await user.click(await screen.findByRole('option', { name: 'Science' }));
    expect(push).toHaveBeenCalledWith('/en/employees?departmentId=d-sci&workSystem=FULL_TIME', { scroll: false });
  });

  it('search waits for typing to pause, then searches from page 1', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderList({ page: '2' }, people);
    await user.type(screen.getByRole('textbox', { name: 'Search employees' }), 'mona');
    expect(push).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    expect(push).toHaveBeenCalledWith('/en/employees?search=mona', { scroll: false });
  });

  it('pagination keeps the filters', async () => {
    const user = userEvent.setup();
    renderEmployees(
      <EmployeesList
        basePath="/en/employees"
        query={parseEmployeesQuery({ status: 'ACTIVE' })}
        rows={people}
        total={45}
        departments={departments}
        stages={stages}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(push).toHaveBeenCalledWith('/en/employees?status=ACTIVE&page=2', { scroll: false });
  });

  it('in Arabic each card shows the Arabic name and links to the profile and its edit page', () => {
    renderList({}, people, 'ar');
    const region = screen.getByRole('region', { name: 'الموظفون' });
    const card = within(region).getByRole('article', { name: 'منى خليل' });
    expect(within(card).getByRole('link', { name: 'منى خليل' }).getAttribute('href')).toBe('/ar/employees/e-1');
    expect(within(card).getByRole('link', { name: 'عرض منى خليل' }).getAttribute('href')).toBe('/ar/employees/e-1');
    expect(within(card).getByRole('link', { name: 'تعديل منى خليل' }).getAttribute('href')).toBe('/ar/employees/e-1/edit');
    expect(within(region).getByRole('article', { name: 'عمر فتحي' }).textContent).toContain('غير نشط');
  });

  it('12 per page: the URL limit is ignored, pages are counted in twelves and never sent as limit', async () => {
    const user = userEvent.setup();
    const query = parseEmployeesQuery({ limit: '50', page: '1' });
    expect(query.limit).toBe(12);
    renderEmployees(
      <EmployeesList basePath="/en/employees" query={query} rows={people} total={30} departments={departments} stages={stages} />,
    );
    expect(screen.getByText('Showing 1–12 of 30')).toBeTruthy();
    expect(screen.getByText('30 employees')).toBeTruthy();
    expect(screen.queryByText('Rows per page')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Page 3' }));
    expect(push).toHaveBeenCalledWith('/en/employees?page=3', { scroll: false });
  });

  it('a failed load shows the error state with a retry', async () => {
    const user = userEvent.setup();
    renderEmployees(
      <EmployeesList basePath="/en/employees" query={parseEmployeesQuery({})} rows={[]} total={0} departments={[]} stages={[]} error />,
    );
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByText('No employees yet')).toBeNull();
  });
});
