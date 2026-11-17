// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithI18n } from '@/test/render';
import { Pagination } from '../data-table/pagination';
import { FilterSelect } from './filter-controls';

const OPTIONS = [
  { value: 'd1', label: 'Science' },
  { value: 'd2', label: 'Languages' },
];

function filter(value: string | undefined, onChange = vi.fn()) {
  return (
    <FilterSelect label="Department" allLabel="All departments" value={value} options={OPTIONS} onChange={onChange} />
  );
}

afterEach(cleanup);

describe('Selects show their choice while closed', () => {
  it('a filter on "All" names it in the closed trigger, from the first (server) paint', () => {
    renderWithI18n(filter(undefined));
    expect(screen.getByRole('combobox', { name: 'Department' }).textContent).toBe('All departments');
    // The server render has no mounted list to borrow the text from — it must still be there.
    expect(renderToStaticMarkup(filter(undefined))).toContain('All departments');
  });

  it('a filter with a value names that option, and choosing "All" reports no filter', async () => {
    const onChange = vi.fn();
    renderWithI18n(filter('d2', onChange));
    const trigger = screen.getByRole('combobox', { name: 'Department' });
    expect(trigger.textContent).toBe('Languages');
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole('option', { name: 'All departments' }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('pagination has no rows-per-page control (fixed page size)', () => {
    renderWithI18n(<Pagination page={1} limit={10} total={45} onPageChange={vi.fn()} />);
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText('Showing 1–10 of 45')).toBeTruthy();
  });
});
