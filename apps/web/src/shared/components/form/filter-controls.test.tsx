// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithI18n } from '@/test/render';
import { Pagination } from '../data-table/pagination';
import { ClearFilters, FilterSelect } from './filter-controls';

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

describe('ClearFilters', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is hidden while no search or filter is in use', () => {
    renderWithI18n(<ClearFilters count={0} onClear={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Clear filters/ })).toBeNull();
  });

  it('shows how many are in use, in both languages', () => {
    renderWithI18n(<ClearFilters count={3} onClear={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Clear filters · 3' })).toBeTruthy();
    cleanup();
    renderWithI18n(<ClearFilters count={2} onClear={vi.fn()} />, { locale: 'ar' });
    expect(screen.getByRole('button', { name: 'مسح عوامل التصفية · 2' })).toBeTruthy();
  });

  it('one click is one reset, then the list scrolls back to its top (like paging)', async () => {
    const onClear = vi.fn();
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    renderWithI18n(
      <section data-testid="list">
        <ClearFilters count={2} onClear={onClear} />
      </section>,
    );
    // The list's top has scrolled above the screen.
    vi.spyOn(screen.getByTestId('list'), 'getBoundingClientRect').mockReturnValue({ top: -400 } as DOMRect);
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters · 2' }));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('is disabled while the list is loading', async () => {
    const onClear = vi.fn();
    renderWithI18n(<ClearFilters count={1} onClear={onClear} disabled />);
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters · 1' }));
    expect(onClear).not.toHaveBeenCalled();
  });
});
