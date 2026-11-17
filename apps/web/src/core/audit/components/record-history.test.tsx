// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('next/link', async () => ({ default: (await import('../test/fixtures')).MockLink }));

import type { AuditEntry } from '@school-erp/shared';
import { parseHistoryQuery } from '../lib/history-query';
import { AHMED, entry, MONA, NOW, renderAudit } from '../test/fixtures';
import { RecordHistory } from './record-history';

const BASE = '/en/employees/33333333-3333-4333-8333-333333333333/history';

function renderHistory(params: Record<string, string> = {}, entries: AuditEntry[] = [entry()], locale: 'en' | 'ar' = 'en') {
  return renderAudit(
    <RecordHistory
      basePath={BASE}
      recordName="Omar Fathy"
      query={parseHistoryQuery(params)}
      entries={entries}
      total={entries.length}
      fields={['phone', 'basicSalary']}
      actors={[MONA, AHMED]}
      now={NOW}
    />,
    locale,
  );
}

describe('RecordHistory (employee History tab)', () => {
  beforeEach(() => push.mockReset());
  afterEach(cleanup);

  it('field and person filters go into the URL from page 1', async () => {
    const user = userEvent.setup();
    renderHistory({ page: '2' });
    await user.click(screen.getByRole('combobox', { name: 'Field' }));
    await user.click(await screen.findByRole('option', { name: 'Basic salary' }));
    expect(push).toHaveBeenLastCalledWith(`${BASE}?field=basicSalary`, { scroll: false });

    await user.click(screen.getByRole('combobox', { name: 'Who' }));
    await user.click(await screen.findByRole('option', { name: 'Ahmed Mahmoud' }));
    expect(push).toHaveBeenLastCalledWith(`${BASE}?person=${AHMED.id}`, { scroll: false });
  });

  it('shows the record’s entries by month, with the last change', () => {
    renderHistory();
    expect(screen.getByRole('heading', { name: 'November 2026' })).toBeTruthy();
    expect(screen.getByText("Who changed what on Omar Fathy's record, newest first.")).toBeTruthy();
    expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === '12 min ago · Mona Ibrahim')).toBeTruthy();
  });

  it('empty: nothing recorded yet vs no match for the filters', async () => {
    const user = userEvent.setup();
    renderHistory({}, []);
    expect(screen.getByText('No changes recorded yet')).toBeTruthy();
    // Nothing to page: no "Showing 0–0 of 0", no paging buttons.
    expect(screen.queryByText(/Showing/)).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).toBeNull();
    cleanup();
    renderHistory({ field: 'phone', person: AHMED.id }, []);
    expect(screen.getByText('No changes match these filters')).toBeTruthy();
    // The message names what is narrowing the list.
    expect(
      screen.getByText('Nothing matches the field Phone and the person Ahmed Mahmoud. Remove one of them or clear the filters.'),
    ).toBeTruthy();
    expect(screen.queryByText(/Showing/)).toBeNull();
    await user.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]!);
    expect(push).toHaveBeenLastCalledWith(BASE, { scroll: false });
  });

  it('on narrow screens the filters sit behind one Filters button, like Activity', async () => {
    const user = userEvent.setup();
    renderHistory({ field: 'phone' });
    await user.click(screen.getByRole('button', { name: 'Filters, 1 on' }));
    const sheet = await screen.findByRole('dialog', { name: 'Filters' });
    expect(sheet).toBeTruthy();
    expect(within(sheet).getByRole('combobox', { name: 'Field' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Close filters' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Arabic: translated labels and field names', () => {
    renderHistory({}, [entry()], 'ar');
    expect(screen.getByRole('heading', { name: 'سجل التغييرات' })).toBeTruthy();
    expect(screen.getAllByText('رقم الهاتف').length).toBeGreaterThan(0);
  });
});
