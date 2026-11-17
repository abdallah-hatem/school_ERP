// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithI18n } from '@/test/render';
import { DataTable, type DataTableColumn } from './data-table';
import { pageWindow } from './pagination';

interface Person {
  id: string;
  name: string;
  salary: number;
}

const columns: DataTableColumn<Person>[] = [
  { id: 'name', header: 'Name', cell: (p) => p.name, card: 'title' },
  { id: 'salary', header: 'Salary', cell: (p) => p.salary, align: 'end' },
];

const people: Person[] = [
  { id: '1', name: 'Mona Khalil', salary: 1350000 },
  { id: '2', name: 'Omar Fathy', salary: 1280000 },
];

function pagination(overrides: Partial<{ page: number; limit: number; total: number }> = {}) {
  return { page: 1, limit: 10, total: 2, onPageChange: vi.fn(), onLimitChange: vi.fn(), ...overrides };
}

describe('DataTable states', () => {
  afterEach(cleanup);

  it('DataTable: empty state', () => {
    renderWithI18n(
      <DataTable label="Employees" columns={columns} rows={[]} getRowId={(p) => p.id} pagination={pagination({ total: 0 })} />,
    );
    const table = screen.getByRole('region', { name: 'Employees' });
    expect(within(table).getByRole('status')).toHaveProperty('textContent', expect.stringContaining('Nothing here yet'));
    expect(within(table).queryByRole('table')).toBeNull();
    // Pagination still shows, with an honest summary.
    expect(within(table).getByText('Showing 0–0 of 0')).toBeTruthy();
  });

  it('DataTable: a custom empty state replaces the default (e.g. no results for these filters)', () => {
    renderWithI18n(
      <DataTable label="Employees" columns={columns} rows={[]} getRowId={(p) => p.id} empty={<p>No one matches</p>} />,
    );
    expect(screen.getByText('No one matches')).toBeTruthy();
    expect(screen.queryByText('Nothing here yet')).toBeNull();
  });

  it('DataTable: error state with retry', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderWithI18n(
      <DataTable label="Employees" columns={columns} rows={undefined} getRowId={(p) => p.id} error onRetry={onRetry} />,
    );
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain("This couldn't load");
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('DataTable: loading skeleton', () => {
    const { container } = renderWithI18n(
      <DataTable
        label="Employees"
        columns={columns}
        rows={undefined}
        getRowId={(p) => p.id}
        loading
        pagination={pagination({ limit: 10, total: 0 })}
      />,
    );
    expect(screen.getByRole('status').textContent).toBe('Loading…');
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    // One skeleton row per row the page will hold, so nothing shifts when data lands.
    expect(container.querySelectorAll('[data-skeleton-row]')).toHaveLength(10);
    expect(screen.queryByRole('table')).toBeNull();
    // Paging is locked while the first page loads.
    expect(screen.getByRole('button', { name: 'Next page' })).toHaveProperty('disabled', true);
  });

  it('keeps rows on screen, dimmed and busy, while refreshing', () => {
    const { container } = renderWithI18n(
      <DataTable label="Employees" columns={columns} rows={people} getRowId={(p) => p.id} refreshing />,
    );
    expect(screen.getByRole('table', { name: 'Employees' })).toBeTruthy();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-skeleton-row]')).toHaveLength(0);
  });

  it('renders the rows as a table and as cards, and pages through them', async () => {
    const user = userEvent.setup();
    const paging = pagination({ page: 2, limit: 10, total: 45 });
    renderWithI18n(
      <DataTable label="Employees" columns={columns} rows={people} getRowId={(p) => p.id} pagination={paging} />,
    );
    const table = screen.getByRole('table', { name: 'Employees' });
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    const cards = screen.getByRole('list', { name: 'Employees' });
    expect(within(cards).getAllByRole('listitem')).toHaveLength(2);

    expect(screen.getByText('Showing 11–20 of 45')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(paging.onPageChange).toHaveBeenCalledWith(3);
    await user.click(screen.getByRole('button', { name: 'Last page' }));
    expect(paging.onPageChange).toHaveBeenCalledWith(5);
    expect(screen.getByRole('button', { name: 'Page 2' }).getAttribute('aria-current')).toBe('page');
  });

  it('shows at most five page numbers around the current page', () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(1, 12)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(7, 12)).toEqual([5, 6, 7, 8, 9]);
    expect(pageWindow(12, 12)).toEqual([8, 9, 10, 11, 12]);
  });
});
