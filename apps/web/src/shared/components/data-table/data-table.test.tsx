// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
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
  return { page: 1, limit: 10, total: 2, onPageChange: vi.fn(), ...overrides };
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
    // Nothing to page: no "Showing 0–0 of 0" and no paging buttons under the empty state.
    expect(within(table).queryByText(/Showing/)).toBeNull();
    expect(within(table).queryByRole('navigation', { name: 'Pagination' })).toBeNull();
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
    // One skeleton row per row the page will hold — the real table and cards with placeholder
    // cells, so nothing shifts when data lands — hidden from assistive tech.
    expect(container.querySelectorAll('[aria-hidden="true"] tbody tr')).toHaveLength(10);
    expect(container.querySelectorAll('[aria-hidden="true"] [data-view="cards"] > li')).toHaveLength(10);
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

describe('DataTable totals row (footer)', () => {
  afterEach(cleanup);

  it('puts each total under its column in the table and on a summary card after the cards', () => {
    renderWithI18n(
      <DataTable
        label="Employees"
        columns={columns}
        rows={people}
        getRowId={(p) => p.id}
        footer={{ label: 'Subtotal', cells: { salary: '2,630,000' } }}
      />,
    );
    const table = screen.getByRole('table', { name: 'Employees' });
    const rows = within(table).getAllByRole('row');
    // Header, two rows, the totals row last — label in the first column, the sum under Salary.
    expect(rows).toHaveLength(4);
    expect(within(rows[3]!).getAllByRole('cell').map((c) => c.textContent)).toEqual(['Subtotal', '2,630,000']);
    const cards = within(screen.getByRole('list', { name: 'Employees' })).getAllByRole('listitem');
    expect(cards).toHaveLength(3);
    expect(cards[2]!.textContent).toContain('Subtotal');
    expect(cards[2]!.textContent).toContain('Salary2,630,000');
  });

  it('a note instead of the totals spans the other columns (totals the viewer may not see)', () => {
    renderWithI18n(
      <DataTable
        label="Employees"
        columns={columns}
        rows={people}
        getRowId={(p) => p.id}
        footer={{ label: 'Subtotal', note: 'Hidden' }}
      />,
    );
    const last = within(screen.getByRole('table', { name: 'Employees' })).getAllByRole('row').at(-1)!;
    const cells = within(last).getAllByRole('cell');
    expect(cells.map((c) => c.textContent)).toEqual(['Subtotal', 'Hidden']);
    expect(cells[1]!.getAttribute('colspan')).toBe('1');
  });

  it('keeps its place in the skeleton and is not drawn on an empty list', () => {
    const footer = { label: 'Subtotal', cells: { salary: '2,630,000' } };
    const { container, unmount } = renderWithI18n(
      <DataTable label="Employees" columns={columns} rows={undefined} getRowId={(p) => p.id} loading footer={footer} />,
    );
    expect(container.querySelectorAll('[aria-hidden="true"] tfoot tr')).toHaveLength(1);
    expect(container.querySelector('[aria-hidden="true"] tfoot')?.textContent).toBe('');
    unmount();
    const empty = renderWithI18n(
      <DataTable label="Employees" columns={columns} rows={[]} getRowId={(p) => p.id} footer={footer} />,
    );
    expect(empty.container.querySelector('tfoot')).toBeNull();
    expect(screen.queryByText('Subtotal')).toBeNull();
  });
});

describe('DataTable sideways scroll cue', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  function sized(scrollWidth: number, clientWidth: number) {
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(scrollWidth);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(clientWidth);
  }
  function fade(side: 'start' | 'end'): HTMLElement {
    const el = document.querySelector<HTMLElement>(`[data-scroll-fade="${side}"]`);
    if (!el) throw new Error(`no ${side} fade`);
    return el;
  }

  it('no fade on a table that fits', () => {
    sized(600, 600);
    renderWithI18n(<DataTable label="Employees" columns={columns} rows={people} getRowId={(p) => p.id} />);
    expect(fade('start').hidden).toBe(true);
    expect(fade('end').hidden).toBe(true);
  });

  it('fades only the side that hides columns, and follows the scroll (RTL positions are negative)', () => {
    sized(1200, 600);
    renderWithI18n(<DataTable label="Employees" columns={columns} rows={people} getRowId={(p) => p.id} />, {
      locale: 'ar',
    });
    expect(fade('start').hidden).toBe(true);
    expect(fade('end').hidden).toBe(false);

    const scroller = screen.getByRole('table').parentElement as HTMLElement;
    scroller.scrollLeft = -600;
    fireEvent.scroll(scroller);
    expect(fade('start').hidden).toBe(false);
    expect(fade('end').hidden).toBe(true);
  });
});

describe('Pagination on a phone', () => {
  afterEach(cleanup);

  it.each(['en', 'ar'] as const)('%s: says which page of how many, between previous and next', async (locale) => {
    const user = userEvent.setup();
    const paging = pagination({ page: 2, limit: 10, total: 45 });
    renderWithI18n(
      <DataTable label="Employees" columns={columns} rows={people} getRowId={(p) => p.id} pagination={paging} />,
      { locale },
    );
    const nav = screen.getByRole('navigation');
    const pageOf = nav.querySelector('[data-page-of]');
    expect(pageOf?.textContent).toBe(locale === 'en' ? 'Page 2 of 5' : 'صفحة 2 من 5');
    const previous = within(nav).getByRole('button', { name: locale === 'en' ? 'Previous page' : 'الصفحة السابقة' });
    const next = within(nav).getByRole('button', { name: locale === 'en' ? 'Next page' : 'الصفحة التالية' });
    // Previous · "page X of Y" · next, in that order.
    expect(previous.compareDocumentPosition(pageOf as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect((pageOf as Node).compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.click(next);
    expect(paging.onPageChange).toHaveBeenCalledWith(3);
  });
});
