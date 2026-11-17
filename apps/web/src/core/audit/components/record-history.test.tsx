// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { cleanup, screen } from '@testing-library/react';
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
    expect(screen.getByText('12 min ago · Mona Ibrahim')).toBeTruthy();
  });

  it('empty: nothing recorded yet vs no match for the filters', async () => {
    const user = userEvent.setup();
    renderHistory({}, []);
    expect(screen.getByText('No changes recorded yet')).toBeTruthy();
    expect(screen.getByText('Showing 0–0 of 0')).toBeTruthy();
    cleanup();
    renderHistory({ field: 'phone' }, []);
    expect(screen.getByText('No changes match these filters')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(push).toHaveBeenLastCalledWith(BASE, { scroll: false });
  });

  it('Arabic: translated labels and field names', () => {
    renderHistory({}, [entry()], 'ar');
    expect(screen.getByRole('heading', { name: 'سجل التغييرات' })).toBeTruthy();
    expect(screen.getAllByText('رقم الهاتف').length).toBeGreaterThan(0);
  });
});
